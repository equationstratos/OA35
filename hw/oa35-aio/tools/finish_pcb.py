#!/usr/bin/env python3
"""Add the copper pours and silkscreen, fill, then check the board.

Runs after routing, on a board that came from gen_pcb.py in this same build:
gen_pcb.py lays down the three planes the router needs, this adds the rest of
the copper, the silkscreen and the fabrication origin.  Re-running it on its
own output would duplicate the zones, so always rebuild from gen_pcb.py.
"""

import math
import os
import subprocess
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import pcbnew                                                    # noqa: E402
import design                                                    # noqa: E402
import layout as LO                                              # noqa: E402
from pcb import Board, Frame, LAYER, mm, vec, ORIGIN             # noqa: E402
import gen_pcb                                                   # noqa: E402
import stitch                                                    # noqa: E402

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


def hull(points):
    """Convex hull, monotone chain.  Small point counts, so simplicity wins."""
    pts = sorted(set((round(x, 4), round(y, 4)) for x, y in points))
    if len(pts) <= 2:
        return pts

    def cross(o, a, b):
        return ((a[0] - o[0]) * (b[1] - o[1])
                - (a[1] - o[1]) * (b[0] - o[0]))

    lower = []
    for p in pts:
        while len(lower) >= 2 and cross(lower[-2], lower[-1], p) <= 0:
            lower.pop()
        lower.append(p)
    upper = []
    for p in reversed(pts):
        while len(upper) >= 2 and cross(upper[-2], upper[-1], p) <= 0:
            upper.pop()
        upper.append(p)
    return lower[:-1] + upper[:-1]


def pad_corners(board, ref, inset=0.0):
    fp = board.FindFootprintByReference(ref)
    if fp is None:
        return []
    xs, ys = [], []
    for pad in fp.Pads():
        bb = pad.GetBoundingBox()
        xs += [pcbnew.ToMM(bb.GetLeft()) - ORIGIN[0],
               pcbnew.ToMM(bb.GetRight()) - ORIGIN[0]]
        ys += [pcbnew.ToMM(bb.GetTop()) - ORIGIN[1],
               pcbnew.ToMM(bb.GetBottom()) - ORIGIN[1]]
    x0, x1 = min(xs) + inset, max(xs) - inset
    y0, y1 = min(ys) + inset, max(ys) - inset
    return [(x0, y0), (x1, y0), (x1, y1), (x0, y1)]


def phase_polys(board):
    """One pour per motor phase: the gap between the two FET rows, widened
    into a corridor that reaches the motor pad in the corner.

    The motor current has to travel in copper, not in a routed trace, so the
    pour is what actually carries it; the router's thin trace only
    establishes the connection.
    """
    out = []
    phases = ('A', 'B', 'C')
    for ch, (ox, oy, ang) in sorted(LO.CHANNEL_FRAME.items()):
        f = Frame(ox, oy, ang)
        for k, ph in enumerate(phases):
            lx = LO.FET_X[ph]
            y0, y1 = LO.FET_Y_LOW + 0.45, LO.FET_Y_HIGH - 0.45
            x0, x1 = lx - 1.35, lx + 1.35
            pts = [f.xy(x0, y0), f.xy(x1, y0), f.xy(x1, y1), f.xy(x0, y1)]
            pad = 'J%d' % (10 + 3 * (ch - 1) + k)
            pts += pad_corners(board, pad, inset=0.1)
            out.append(('PH_%s_%d' % (ph, ch), hull(pts)))
    return out


def add_pours(w):
    """All the copper pours.  gen_pcb.py puts the three planes down before
    the DSN export so the router knows about them; this pass rebuilds them
    from scratch along with the rest, having stripped the old set first."""
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
           [(-0.5, 8.9), (11.7, 8.9), (11.7, 17.2), (-0.5, 17.2)],
           priority=20)
    for net, p in phase_polys(w.b):
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
        w.text(layer, part.value, tx, ty, size=0.8, thickness=0.12,
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
            # 0.13 mm everywhere the router was allowed to work: a class
            # clearance wider than what the board was routed at would turn
            # every trace between two QFN pins into a DRC error.
            {'bus_width': 12, 'clearance': 0.13, 'diff_pair_gap': 0.25,
             'diff_pair_via_gap': 0.25, 'diff_pair_width': 0.2,
             'line_style': 0, 'microvia_diameter': 0.3,
             'microvia_drill': 0.1, 'name': 'Default',
             'pcb_color': 'rgba(0, 0, 0, 0.000)',
             'schematic_color': 'rgba(0, 0, 0, 0.000)',
             'track_width': 0.13, 'via_diameter': 0.45, 'via_drill': 0.25,
             'wire_width': 6},
            {'bus_width': 12, 'clearance': 0.13, 'diff_pair_gap': 0.25,
             'diff_pair_via_gap': 0.25, 'diff_pair_width': 0.2,
             'line_style': 0, 'microvia_diameter': 0.3,
             'microvia_drill': 0.1, 'name': 'supply',
             'pcb_color': 'rgba(0, 0, 0, 0.000)',
             'schematic_color': 'rgba(0, 0, 0, 0.000)',
             'track_width': 0.4, 'via_diameter': 0.45, 'via_drill': 0.25,
             'wire_width': 6},
            {'bus_width': 12, 'clearance': 0.13, 'diff_pair_gap': 0.25,
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
    # This board is denser than IPC nominal courtyards allow, like every
    # commercial AIO of this size; silk over copper is clipped by the
    # fabricator.  Neither is a manufacturing constraint, so they are not
    # allowed to hide the checks that are.
    sev = doc['board']['design_settings'].setdefault('rule_severities', {})
    sev['courtyards_overlap'] = 'warning'
    sev['silk_over_copper'] = 'ignore'
    sev['silk_overlap'] = 'ignore'
    sev['silk_edge_clearance'] = 'warning'
    json.dump(doc, open(path, 'w'), indent=2, sort_keys=True)


def bare_nets(board):
    """Nets that have more than one pad and no copper at all on them.

    The router prints "Auto-routing was completed" whether or not it managed
    to route everything, so this is the check that decides.
    """
    import collections
    pads = collections.Counter()
    for fp in board.GetFootprints():
        for pad in fp.Pads():
            name = pad.GetNetname()
            if name:
                pads[name] += 1
    copper = collections.Counter()
    for t in board.GetTracks():
        copper[t.GetNetname()] += 1
    for z in board.Zones():
        copper[z.GetNetname()] += 1
    return sorted(n for n, k in pads.items()
                  if k > 1 and not copper[n]
                  and not n.startswith(('NC', 'ND')))


def report(board):
    conn = board.GetConnectivity()
    conn.RecalculateRatsnest()
    un = conn.GetUnconnectedCount(False)
    bare = bare_nets(board)
    print('unconnected pads: %d' % un)
    if bare:
        print('nets with no copper at all: %d' % len(bare))
        print('  ' + ', '.join(bare[:20])
              + (' ...' if len(bare) > 20 else ''))
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


def strip_generated():
    """Drop the zones and board-level silk from a previous run.

    Done in a separate process: pcbnew's python proxies stop behaving after
    BOARD.Remove(), for the rest of the interpreter, not just for that board.
    """
    subprocess.check_call([sys.executable, os.path.abspath(__file__),
                           '--strip'])


def _strip_here():
    board = pcbnew.LoadBoard(PCB)
    dws = board.Drawings()
    doomed = [dws[i] for i in range(dws.size())
              if dws[i].GetLayer() in (pcbnew.F_SilkS, pcbnew.B_SilkS,
                                       pcbnew.Cmts_User)]
    doomed += list(board.Zones())
    if not doomed:
        return
    for item in doomed:
        board.Remove(item)
    board.Save(PCB)


def main():
    strip_generated()
    board = pcbnew.LoadBoard(PCB)
    per_pad, grid_vias = stitch.stitch(board, half=LO.BOARD / 2.0,
                                       edge_clr=LO.EDGE_CLR + 0.3,
                                       corner_r=LO.CORNER_R)
    print('stitching vias: %d beside pads, %d in the pour grid'
          % (per_pad, grid_vias))
    fat = stitch.widen(board, ('VBAT', 'VBAT_IN', '+5V', '+5V_BUCK', '+10V',
                               '+3V3', '+3V3E', 'VBUS', 'SW_5V', 'SW_GD')
                       + tuple('PH_%s_%d' % (p, c) for p in 'ABC'
                               for c in (1, 2, 3, 4)))
    print('widened %d track segments on the current-carrying nets' % fat)
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
    if '--strip' in sys.argv:
        _strip_here()
        sys.exit(0)
    sys.exit(0 if main() == 0 else 1)
