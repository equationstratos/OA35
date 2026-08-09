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
    # copper around the battery input pads, so the clamps and the shunt sit
    # on plane rather than on a trace
    w.zone('VBAT_IN', ['F'],
           [(-0.4, 8.9), (12.3, 8.9), (12.3, 17.2), (-0.4, 17.2)],
           priority=20)
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


PRO_PATCH = {
    'net_settings': {
        'classes': [
            {'bus_width': 12, 'clearance': 0.15, 'diff_pair_gap': 0.25,
             'diff_pair_via_gap': 0.25, 'diff_pair_width': 0.2,
             'line_style': 0, 'microvia_diameter': 0.3,
             'microvia_drill': 0.1, 'name': 'Default',
             'pcb_color': 'rgba(0, 0, 0, 0.000)',
             'schematic_color': 'rgba(0, 0, 0, 0.000)',
             'track_width': 0.2, 'via_diameter': 0.5, 'via_drill': 0.25,
             'wire_width': 6},
            {'bus_width': 12, 'clearance': 0.15, 'diff_pair_gap': 0.25,
             'diff_pair_via_gap': 0.25, 'diff_pair_width': 0.2,
             'line_style': 0, 'microvia_diameter': 0.3,
             'microvia_drill': 0.1, 'name': 'supply',
             'pcb_color': 'rgba(0, 0, 0, 0.000)',
             'schematic_color': 'rgba(0, 0, 0, 0.000)',
             'track_width': 0.5, 'via_diameter': 0.5, 'via_drill': 0.25,
             'wire_width': 6},
            {'bus_width': 12, 'clearance': 0.15, 'diff_pair_gap': 0.25,
             'diff_pair_via_gap': 0.25, 'diff_pair_width': 0.2,
             'line_style': 0, 'microvia_diameter': 0.3,
             'microvia_drill': 0.1, 'name': 'phase',
             'pcb_color': 'rgba(0, 0, 0, 0.000)',
             'schematic_color': 'rgba(0, 0, 0, 0.000)',
             'track_width': 0.8, 'via_diameter': 0.6, 'via_drill': 0.3,
             'wire_width': 6},
        ],
        'netclass_patterns': [
            {'netclass': 'phase', 'pattern': 'PH_*'},
            {'netclass': 'phase', 'pattern': 'VBAT'},
            {'netclass': 'phase', 'pattern': 'VBAT_IN'},
            {'netclass': 'supply', 'pattern': '+5V*'},
            {'netclass': 'supply', 'pattern': '+10V'},
            {'netclass': 'supply', 'pattern': '+3V3*'},
            {'netclass': 'supply', 'pattern': 'VBUS'},
        ],
    },
    'libraries': {'pinned_footprint_libs': ['oa35'],
                  'pinned_symbol_libs': []},
}


def patch_project():
    """pcbnew rewrites the project file when it saves; put back the net
    classes and the pinned library."""
    import json
    path = os.path.join(ROOT, 'oa35-aio.kicad_pro')
    if not os.path.exists(path):
        return
    doc = json.load(open(path))
    doc.setdefault('net_settings', {})
    doc['net_settings']['classes'] = PRO_PATCH['net_settings']['classes']
    doc['net_settings']['netclass_patterns'] = \
        PRO_PATCH['net_settings']['netclass_patterns']
    doc['libraries'] = PRO_PATCH['libraries']
    doc.setdefault('erc', {})['rule_severities'] = {
        'pin_not_connected': 'ignore', 'pin_not_driven': 'ignore',
        'power_pin_not_driven': 'ignore'}
    json.dump(doc, open(path, 'w'), indent=2, sort_keys=True)


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
    # fabrication origin at the lower-left corner of the outline, so gerber
    # and pick-and-place coordinates share the same reference
    board.GetDesignSettings().SetAuxOrigin(
        pcbnew.VECTOR2I(mm(ORIGIN[0] - HALF), mm(ORIGIN[1] + HALF)))
    w.fill_zones()
    board.Save(PCB)
    patch_project()
    print('zones: %d' % board.GetAreaCount())
    return report(board)


if __name__ == '__main__':
    sys.exit(0 if main() == 0 else 1)
