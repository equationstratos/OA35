#!/usr/bin/env python3
"""Make a connected board legal, one net at a time.

Negotiated congestion gets every net connected and then stalls: on this
board it settles around five hundred clearance violations and each further
iteration costs half an hour to move the number by a percent.  That is the
wrong tool for the endgame.  Once the board is connected, a violation is a
local problem -- this net runs too close to that one, somewhere -- and the
board around it is settled enough that a legal detour usually exists.

So: find the nets that violate, and for each one in turn, rub out its copper,
look for a route that is legal by construction against everything else, and
put it back only if one is found.  A net can never come out worse than it
went in, and it can never be lost.
"""

import os
import subprocess
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import pcbnew                                                    # noqa: E402
import finish_route as FR                                        # noqa: E402

PCB = FR.PCB
N = FR.N


def track_cells(board, code):
    """The cells a net's own copper runs through, per layer."""
    out = set()
    for t in board.GetTracks():
        if t.GetNetCode() != code:
            continue
        if t.Type() == pcbnew.PCB_VIA_T:
            p = t.GetPosition()
            ix = FR.Space.to_i(FR.tomm(p.x) - FR.ORIGIN[0])
            iy = FR.Space.to_i(FR.tomm(p.y) - FR.ORIGIN[1])
            for li in FR.ROUTABLE:
                out.add((li, ix, iy))
            continue
        lis = [li for li in FR.layer_indices(t) if li in FR.ROUTABLE]
        a, b = t.GetStart(), t.GetEnd()
        ax = FR.tomm(a.x) - FR.ORIGIN[0]
        ay = FR.tomm(a.y) - FR.ORIGIN[1]
        bx = FR.tomm(b.x) - FR.ORIGIN[0]
        by = FR.tomm(b.y) - FR.ORIGIN[1]
        steps = max(2, int(max(abs(bx - ax), abs(by - ay)) / FR.GRID) + 1)
        for i in range(steps + 1):
            u = i / float(steps)
            ix = FR.Space.to_i(ax + (bx - ax) * u)
            iy = FR.Space.to_i(ay + (by - ay) * u)
            for li in lis:
                out.add((li, ix, iy))
    return out


def offenders(board):
    """Nets whose copper sits inside another net's clearance.

    The board has to be painted once per net, without that net, because the
    painting marks a piece of copper's own cells as hard and hard cells are
    never closed -- so a net tested against a picture containing itself comes
    back clean however badly it overlaps, which is what "board is legal" meant
    the first time this ran.
    """
    nets = board.GetNetsByName()
    bad = {}
    for name in nets.keys():
        name = str(name)
        if not name or name in ('GND', 'VBAT') \
                or name.startswith(('NC', 'ND')):
            continue
        code = nets[name].GetNetCode()
        cells = track_cells(board, code)
        if not cells:
            continue
        sp = FR.paint(board, skip=code)
        hits = 0
        for (li, ix, iy) in cells:
            if not (0 <= ix < N and 0 <= iy < N):
                continue
            k = iy * N + ix
            own = sp.owner[li][k]
            if sp.shut[li][k] or (own and own != code):
                hits += 1
        if hits:
            bad[code] = (name, hits)
    return bad


def main(rounds=6):
    for r in range(1, rounds + 1):
        board = pcbnew.LoadBoard(PCB)
        bad = offenders(board)
        print('round %d: %d nets in violation' % (r, len(bad)), flush=True)
        if not bad:
            print('board is legal', flush=True)
            return 0
        # worst first: the net standing on the most contested ground has the
        # most to gain from being moved, and moving it frees the others
        order = sorted(bad, key=lambda c: -bad[c][1])
        fixed = []
        for code in order:
            name, hits = bad[code]
            sp = FR.paint(board, skip=code)
            items = [it for it in FR.net_items(board, code)
                     if it[0] == 'b' and len(it[3]) == 1]
            groups = FR.components(items)
            if len(groups) < 2:
                continue
            ok = True
            paths = []
            tree = FR.anchor_cells(sp, items, groups[0], code)
            for g in groups[1:]:
                tgt = FR.anchor_cells(sp, items, g, code)
                path = FR.astar(sp, tree, tgt, code)
                if not path:
                    ok = False
                    break
                paths.append(path)
                tree = tree | set(path) | tgt
            if ok:
                fixed.append((code, paths))
        print('  %d of %d have a legal route' % (len(fixed), len(bad)),
              flush=True)
        if not fixed:
            print('nothing more can be moved', flush=True)
            return len(bad)
        subprocess.check_call([sys.executable,
                               os.path.join(FR.HERE, 'finish_route.py'),
                               '--clear-nets',
                               ','.join(str(c) for c, _p in fixed)])
        board = pcbnew.LoadBoard(PCB)
        sp = FR.paint(board)
        for code, paths in fixed:
            for path in paths:
                FR.commit(board, sp, path, code)
        board.Save(PCB)
        conn = board.GetConnectivity()
        conn.RecalculateRatsnest()
        print('  rewritten, unconnected pads: %d'
              % conn.GetUnconnectedCount(False), flush=True)
    board = pcbnew.LoadBoard(PCB)
    return len(offenders(board))


if __name__ == '__main__':
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    sys.exit(0 if main(int(args[0]) if args else 6) == 0 else 1)
