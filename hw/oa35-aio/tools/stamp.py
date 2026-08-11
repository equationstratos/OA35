#!/usr/bin/env python3
"""Route one ESC channel, then stamp its copper into the other three.

136 of the 198 nets on this board -- 34 per channel, exactly -- never leave
the channel they belong to.  And since match_channel_one() in gen_pcb.py, the
four channels are identical pad for pad in their own frames, to 0.0000 mm.
So the same copper fits all four.

That turns two thirds of the board into a problem a quarter of the size,
solved once, at a density where the maze router does not struggle.  It also
makes the four power stages electrically identical, which no autorouter would
have given us and which matters on a stage switching 45 A.

The remaining 62 nets -- flight controller, supplies, the wires between the
micros and the outside world -- are left to whatever runs next.
"""

import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import pcbnew                                                    # noqa: E402
import design                                                    # noqa: E402
import layout as LO                                              # noqa: E402
import finish_route as FR                                        # noqa: E402
from pcb import Frame                                            # noqa: E402

PCB = FR.PCB
ORIGIN = FR.ORIGIN


def channel_nets(ch):
    """Nets whose every pin sits in this channel's block."""
    out = []
    for name, pins in design.nets().items():
        if name in ('GND', 'VBAT') or name.startswith(('NC', 'ND')):
            continue
        if len(pins) < 2:
            continue
        blocks = set(design.PARTS[r].block for r, _ in pins)
        if blocks == {'ESC%d' % ch}:
            out.append(name)
    return out


def span(board, name):
    pts = []
    for fp in board.GetFootprints():
        for pad in fp.Pads():
            if pad.GetNetname() == name:
                p = pad.GetPosition()
                pts.append((FR.tomm(p.x), FR.tomm(p.y)))
    if len(pts) < 2:
        return 0.0
    return (max(p[0] for p in pts) - min(p[0] for p in pts)
            + max(p[1] for p in pts) - min(p[1] for p in pts))


# Capping the search to speed the sampling up was a bad trade: it turned a
# twenty minute ordering into a four minute one but cost five nets out of
# thirty-four, and the point of sampling orders is to find one that routes
# them all.  Full budget.
TRY_BUDGET = 400000


def try_order(board_path, ch, order):
    """Route one channel in a given net order, on a throwaway board.

    Returns (nets that failed, the tracks that worked), the tracks as plain
    tuples so nothing survives that depends on the board object.
    """
    board = pcbnew.LoadBoard(board_path)
    sp = FR.paint(board)
    nets = board.GetNetsByName()
    lost = []
    for name in order:
        if not FR.route_one(board, sp, nets[name].GetNetCode(),
                            TRY_BUDGET):
            lost.append(name)
    keep = set(order)
    out = []
    for t in board.GetTracks():
        n = t.GetNetname()
        if n not in keep:
            continue
        if t.Type() == pcbnew.PCB_VIA_T:
            p = t.GetPosition()
            out.append(('v', n, p.x, p.y, t.GetWidth(), t.GetDrill(), 0))
        else:
            a, b = t.GetStart(), t.GetEnd()
            out.append(('t', n, a.x, a.y, b.x, b.y, t.GetWidth(),
                        t.GetLayer()))
    return lost, out


def route_channel(board_path, ch, tries=12):
    """Route the channel, trying several net orders and keeping the best.

    One order is not enough: taken shortest first, sixteen of the thirty-four
    nets in a channel end up blocked by the ones routed before them.  Which
    net blocks which depends entirely on the order, and thirty-four nets is
    small enough to simply try again -- which two hundred was not.
    """
    import random
    base = sorted(channel_nets(ch), key=lambda n: span_of(board_path, n))
    orders = [base, list(reversed(base))]
    rng = random.Random(20250810)
    for _ in range(tries - len(orders)):
        o = list(base)
        rng.shuffle(o)
        orders.append(o)

    best = None
    for i, order in enumerate(orders, 1):
        lost, tracks = try_order(board_path, ch, order)
        print('  ordre %2d : %d/%d nets' % (i, len(order) - len(lost),
                                            len(order)), flush=True)
        if best is None or len(lost) < len(best[0]):
            best = (lost, tracks)
        if not lost:
            break
    return best


_SPAN_CACHE = {}


def span_of(board_path, name):
    if board_path not in _SPAN_CACHE:
        _SPAN_CACHE[board_path] = pcbnew.LoadBoard(board_path)
    return span(_SPAN_CACHE[board_path], name)


def rename(name, src, dst):
    """GHA_1 -> GHA_3.  Anything not ending in the channel number is left."""
    m = re.match(r'^(.*)_%d$' % src, name)
    return '%s_%d' % (m.group(1), dst) if m else None


def stamp(board, src=1, dsts=(2, 3, 4)):
    """Copy the source channel's copper into the other channels' frames."""
    fs = dict((c, Frame(*LO.CHANNEL_FRAME[c])) for c in LO.CHANNEL_FRAME)
    names = set(channel_nets(src))
    codes = {}
    for n in names:
        ni = board.FindNet(n)
        if ni:
            codes[ni.GetNetCode()] = n

    mine = [t for t in board.GetTracks() if t.GetNetCode() in codes]
    added = 0
    for dst in dsts:
        for t in mine:
            name = rename(codes[t.GetNetCode()], src, dst)
            ni = board.FindNet(name) if name else None
            if ni is None:
                continue

            def move(p):
                lx, ly = fs[src].inv(FR.tomm(p.x) - ORIGIN[0],
                                     FR.tomm(p.y) - ORIGIN[1])
                bx, by = fs[dst].xy(lx, ly)
                return pcbnew.VECTOR2I(FR.mm(bx + ORIGIN[0]),
                                       FR.mm(by + ORIGIN[1]))

            if t.Type() == pcbnew.PCB_VIA_T:
                v = pcbnew.PCB_VIA(board)
                v.SetPosition(move(t.GetPosition()))
                v.SetWidth(t.GetWidth())
                v.SetDrill(t.GetDrill())
                v.SetLayerPair(pcbnew.F_Cu, pcbnew.B_Cu)
                v.SetNetCode(ni.GetNetCode())
                board.Add(v)
            else:
                n = pcbnew.PCB_TRACK(board)
                n.SetStart(move(t.GetStart()))
                n.SetEnd(move(t.GetEnd()))
                n.SetWidth(t.GetWidth())
                n.SetLayer(t.GetLayer())
                n.SetNetCode(ni.GetNetCode())
                board.Add(n)
            added += 1
    return added


def main():
    board = pcbnew.LoadBoard(PCB)
    if any(True for _t in board.GetTracks()):
        raise SystemExit('the board already has copper on it; start from a '
                         'freshly placed one')

    print('routage du canal 1', flush=True)
    lost, tracks = route_channel(PCB, 1)
    todo = channel_nets(1)
    print('canal 1 : %d nets, %d raccordes, %d en echec'
          % (len(todo), len(todo) - len(lost), len(lost)), flush=True)
    if lost:
        print('  ' + ', '.join(lost), flush=True)

    # put the best attempt's copper on the board we are keeping
    board = pcbnew.LoadBoard(PCB)
    for item in tracks:
        ni = board.FindNet(item[1])
        if ni is None:
            continue
        if item[0] == 'v':
            v = pcbnew.PCB_VIA(board)
            v.SetPosition(pcbnew.VECTOR2I(item[2], item[3]))
            v.SetWidth(item[4])
            v.SetDrill(item[5])
            v.SetLayerPair(pcbnew.F_Cu, pcbnew.B_Cu)
            v.SetNetCode(ni.GetNetCode())
            board.Add(v)
        else:
            t = pcbnew.PCB_TRACK(board)
            t.SetStart(pcbnew.VECTOR2I(item[2], item[3]))
            t.SetEnd(pcbnew.VECTOR2I(item[4], item[5]))
            t.SetWidth(item[6])
            t.SetLayer(item[7])
            t.SetNetCode(ni.GetNetCode())
            board.Add(t)

    added = stamp(board)
    print('stamped %d segments and vias into channels 2, 3 and 4' % added,
          flush=True)
    board.Save(PCB)

    board = pcbnew.LoadBoard(PCB)
    left = FR.in_pieces(board)
    seg = sum(1 for t in board.GetTracks() if t.Type() != pcbnew.PCB_VIA_T)
    via = sum(1 for t in board.GetTracks() if t.Type() == pcbnew.PCB_VIA_T)
    print('board now: %d segments, %d vias, %d nets still in pieces'
          % (seg, via, len(left)))
    return len(left)


if __name__ == '__main__':
    sys.exit(0 if main() == 0 else 1)
