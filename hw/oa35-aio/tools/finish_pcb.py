#!/usr/bin/env python3
"""Add the copper pours and silkscreen, fill, then check the board.

Run after routing.  Idempotent: it removes anything it added last time
before adding it again, so the board can be rebuilt at will.
"""

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import pcbnew                                                    # noqa: E402
import design                                                    # noqa: E402
import layout as LO                                              # noqa: E402
from pcb import Board, Frame, LAYER, mm, vec, ORIGIN             # noqa: E402
import gen_pcb                                                   # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, '..'))
PCB = os.path.join(ROOT, 'oa35-aio.kicad_pcb')
HALF = LO.BOARD / 2.0


class Wrap(object):
    """Just enough of pcb.Board to reuse its zone and graphics helpers."""

    def __init__(self, board):
        self.b = board
        self._nets = board.GetNetsByName()

    def net(self, name):
        if name in self._nets:
            return self._nets[name]
        n = pcbnew.NETINFO_ITEM(self.b, name)
        self.b.Add(n)
        self._nets = self.b.GetNetsByName()
        return n

    zone = Board.zone
    keepout = Board.keepout
    seg = Board.seg
    arc = Board.arc
    text = Board.text
    fill_zones = Board.fill_zones


def phase_polys():
    """One pour per motor phase, over the gap between the two FET rows."""
    out = []
    for ch, (ox, oy, ang) in sorted(LO.CHANNEL_FRAME.items()):
        f = Frame(ox, oy, ang)
        for ph, lx in sorted(LO.FET_X.items()):
            y0, y1 = LO.FET_Y_LOW + 0.45, LO.FET_Y_HIGH - 0.45
            x0, x1 = lx - 1.35, lx + 1.35
            poly = [f.xy(x0, y0), f.xy(x1, y0), f.xy(x1, y1), f.xy(x0, y1)]
            out.append(('PH_%s_%d' % (ph, ch), poly))
    return out


def clear_generated(board):
    for z in list(board.Zones()):
        board.Remove(z)
    for d in list(board.GetDrawings()):
        if d.GetLayer() in (pcbnew.F_SilkS, pcbnew.B_SilkS,
                            pcbnew.Cmts_User):
            board.Remove(d)


def add_pours(w):
    poly = gen_pcb.board_poly()
    w.zone('GND', ['In1'], poly, priority=10)
    w.zone('GND', ['In3'], poly, priority=10)
    w.zone('VBAT', ['In2'], poly, priority=10)
    w.zone('GND', ['In4'], poly, priority=1)
    w.zone('GND', ['F'], poly, priority=1)
    w.zone('GND', ['B'], poly, priority=1)
    for net, p in phase_polys():
        w.zone(net, ['F'], p, priority=30)


SILK = {
    'J3': 'BAT+', 'J4': 'BAT-',
}


def add_silk(w, board):
    """Label every wire pad, plus the board name and revision."""
    for ref, part in design.PARTS.items():
        if part.sym != 'PAD':
            continue
        fp = board.FindFootprintByReference(ref)
        if fp is None:
            continue
        p = fp.GetPosition()
        x = pcbnew.ToMM(p.x) - ORIGIN[0]
        y = pcbnew.ToMM(p.y) - ORIGIN[1]
        bottom = fp.IsFlipped()
        layer = pcbnew.B_SilkS if bottom else pcbnew.F_SilkS
        # push the text towards the middle of the board
        dx = -1.6 if x > 0 else 1.6
        dy = -1.6 if y > 0 else 1.6
        if abs(x) > abs(y):
            ty, tx = y, x + dx
        else:
            tx, ty = x, y + dy
        w.text(layer, part.value, tx, ty, size=0.7, thickness=0.11,
               mirror=bottom,
               justify=pcbnew.GR_TEXT_H_ALIGN_CENTER)
    w.text(pcbnew.B_SilkS, 'OA35-AIO  rev A', 0.0, 5.6, size=1.0,
           thickness=0.15, mirror=True,
           justify=pcbnew.GR_TEXT_H_ALIGN_CENTER)
    w.text(pcbnew.F_SilkS, 'F722 + 4x AM32   3-6S', 0.0, -1.4, size=0.9,
           thickness=0.14, justify=pcbnew.GR_TEXT_H_ALIGN_CENTER)


def report(board):
    conn = board.GetConnectivity()
    conn.RecalculateRatsnest()
    un = conn.GetUnconnectedCount()
    print('unconnected pads: %d' % un)
    rpt = os.path.join(ROOT, 'build', 'drc.rpt')
    if not os.path.isdir(os.path.dirname(rpt)):
        os.makedirs(os.path.dirname(rpt))
    pcbnew.WriteDRCReport(board, rpt, pcbnew.EDA_UNITS_MILLIMETRES, True)
    txt = open(rpt).read()
    errs = txt.count('Severity: error')
    warns = txt.count('Severity: warning')
    if not errs and not warns:
        for line in txt.splitlines():
            if line.startswith('** Found'):
                print(line)
    print('DRC report: %s' % rpt)
    for line in txt.splitlines():
        if line.startswith('** Found') or line.startswith('**'):
            print('  ' + line)
    return un


def main():
    board = pcbnew.LoadBoard(PCB)
    clear_generated(board)
    w = Wrap(board)
    add_pours(w)
    add_silk(w, board)
    w.fill_zones()
    board.Save(PCB)
    print('zones: %d' % board.GetAreaCount())
    return report(board)


if __name__ == '__main__':
    sys.exit(0 if main() == 0 else 1)
