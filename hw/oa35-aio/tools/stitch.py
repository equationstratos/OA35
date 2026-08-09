"""Stitch the plane nets to their planes with vias.

freerouting treats GND and VBAT as planes and assumes they need no routing,
which is only true for through-hole pads.  Every surface-mount pad on those
nets therefore comes back from the router with nothing tying it to the inner
copper, and the outer pours alone break into islands on a board this dense.

This adds the missing vias: one beside (or on) each plane-net pad, plus a
sparse grid that ties the outer pours back to the planes.  Placement is
checked against every pad, track and via already on the board, so nothing
lands on top of existing copper.
"""

import math

import pcbnew

ORIGIN = (150.0, 100.0)
VIA_DRILL = 0.3
VIA_DIA = 0.6
CLEAR = 0.18                 # copper-to-copper for the stitching vias
CELL = 1.0                   # spatial index cell, mm


def mm(v):
    return pcbnew.FromMM(float(v))


def tomm(v):
    return pcbnew.ToMM(v)


class Obstacles(object):
    """Copper already on the board, bucketed on a coarse grid.

    Pads are boxes, tracks are segments with a width, vias are circles.
    Using a track's bounding box instead of the segment itself would mark a
    diagonal trace as blocking a whole rectangle, which leaves nowhere to
    stitch.
    """

    def __init__(self):
        self.cells = {}

    def _put(self, x0, y0, x1, y1, item):
        for ix in range(int(math.floor(x0 / CELL)), int(x1 / CELL) + 1):
            for iy in range(int(math.floor(y0 / CELL)), int(y1 / CELL) + 1):
                self.cells.setdefault((ix, iy), []).append(item)

    def add_box(self, x0, y0, x1, y1, net):
        self._put(x0, y0, x1, y1, ('box', x0, y0, x1, y1, net))

    def add_segment(self, x0, y0, x1, y1, half, net):
        self._put(min(x0, x1) - half, min(y0, y1) - half,
                  max(x0, x1) + half, max(y0, y1) + half,
                  ('seg', x0, y0, x1, y1, half, net))

    def add_circle(self, x, y, r, net):
        self._put(x - r, y - r, x + r, y + r, ('cir', x, y, r, net))

    def blocked(self, x, y, r, net):
        ix0 = int(math.floor((x - r) / CELL))
        ix1 = int((x + r) / CELL)
        iy0 = int(math.floor((y - r) / CELL))
        iy1 = int((y + r) / CELL)
        for ix in range(ix0, ix1 + 1):
            for iy in range(iy0, iy1 + 1):
                for item in self.cells.get((ix, iy), ()):
                    if item[0] == 'box':
                        _, bx0, by0, bx1, by1, bnet = item
                        if bnet == net:
                            continue
                        if (x + r > bx0 and bx1 > x - r
                                and y + r > by0 and by1 > y - r):
                            return True
                    elif item[0] == 'seg':
                        _, ax, ay, bx, by, half, bnet = item
                        if bnet == net:
                            continue
                        if seg_distance(x, y, ax, ay, bx, by) < r + half:
                            return True
                    else:
                        _, cx, cy, cr, bnet = item
                        if bnet == net:
                            continue
                        if math.hypot(x - cx, y - cy) < r + cr:
                            return True
        return False


def seg_distance(px, py, ax, ay, bx, by):
    dx, dy = bx - ax, by - ay
    L2 = dx * dx + dy * dy
    if L2 <= 1e-12:
        return math.hypot(px - ax, py - ay)
    t = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / L2))
    return math.hypot(px - (ax + t * dx), py - (ay + t * dy))


def collect(board):
    """Everything a via must not touch, in page millimetres."""
    obs = Obstacles()
    for fp in board.GetFootprints():
        for pad in fp.Pads():
            bb = pad.GetBoundingBox()
            obs.add_box(tomm(bb.GetLeft()), tomm(bb.GetTop()),
                        tomm(bb.GetRight()), tomm(bb.GetBottom()),
                        pad.GetNetCode())
    for t in board.GetTracks():
        if t.Type() == pcbnew.PCB_VIA_T:
            p = t.GetPosition()
            obs.add_circle(tomm(p.x), tomm(p.y),
                           tomm(t.GetWidth()) / 2.0, t.GetNetCode())
        else:
            a, b = t.GetStart(), t.GetEnd()
            obs.add_segment(tomm(a.x), tomm(a.y), tomm(b.x), tomm(b.y),
                            tomm(t.GetWidth()) / 2.0, t.GetNetCode())
    return obs


def inside_board(x, y, half, edge_clr, corner_r):
    """x, y are board-local."""
    lim = half - edge_clr
    if abs(x) > lim or abs(y) > lim:
        return False
    if abs(x) > lim - corner_r and abs(y) > lim - corner_r:
        cx = math.copysign(lim - corner_r, x)
        cy = math.copysign(lim - corner_r, y)
        return (x - cx) ** 2 + (y - cy) ** 2 <= corner_r ** 2
    return True


def add_via(board, x, y, netcode):
    v = pcbnew.PCB_VIA(board)
    v.SetPosition(pcbnew.VECTOR2I(mm(x), mm(y)))
    v.SetWidth(mm(VIA_DIA))
    v.SetDrill(mm(VIA_DRILL))
    v.SetLayerPair(pcbnew.F_Cu, pcbnew.B_Cu)
    v.SetNetCode(netcode)
    board.Add(v)
    return v


def add_track(board, x0, y0, x1, y1, layer, netcode, width=0.25):
    t = pcbnew.PCB_TRACK(board)
    t.SetStart(pcbnew.VECTOR2I(mm(x0), mm(y0)))
    t.SetEnd(pcbnew.VECTOR2I(mm(x1), mm(y1)))
    t.SetWidth(mm(width))
    t.SetLayer(layer)
    t.SetNetCode(netcode)
    board.Add(t)
    return t


def stitch(board, nets=('GND', 'VBAT'), half=18.0, edge_clr=0.5,
           corner_r=2.0, grid=2.0):
    """Returns (vias beside pads, grid vias)."""
    obs = collect(board)
    codes = {}
    for name in nets:
        n = board.FindNet(name)
        if n:
            codes[name] = n.GetNetCode()
    r = VIA_DIA / 2.0 + CLEAR

    def free(x, y, netcode):
        lx, ly = x - ORIGIN[0], y - ORIGIN[1]
        if not inside_board(lx, ly, half, edge_clr, corner_r):
            return False
        return not obs.blocked(x, y, VIA_DIA / 2.0 + CLEAR, netcode)

    per_pad = 0
    for fp in board.GetFootprints():
        for pad in fp.Pads():
            if pad.GetNetname() not in codes:
                continue
            if pad.GetAttribute() in (pcbnew.PAD_ATTRIB_PTH,
                                      pcbnew.PAD_ATTRIB_NPTH):
                continue                      # already through the board
            code = pad.GetNetCode()
            pos = pad.GetPosition()
            px, py = tomm(pos.x), tomm(pos.y)
            size = pad.GetSize()
            hw, hh = tomm(size.x) / 2.0, tomm(size.y) / 2.0
            placed = False
            # on the pad, when the pad is big enough to swallow the via
            if min(hw, hh) >= VIA_DIA / 2.0 + 0.1 and free(px, py, code):
                add_via(board, px, py, code)
                obs.add_circle(px, py, VIA_DIA / 2.0, code)
                placed = True
            if not placed:
                step = max(hw, hh) + VIA_DIA / 2.0 + CLEAR + 0.05
                for k in range(8):
                    a = math.pi * k / 4.0
                    vx, vy = px + step * math.cos(a), py + step * math.sin(a)
                    if not free(vx, vy, code):
                        continue
                    add_via(board, vx, vy, code)
                    obs.add_circle(vx, vy, VIA_DIA / 2.0, code)
                    layer = pcbnew.B_Cu if pad.IsOnLayer(pcbnew.B_Cu) \
                        else pcbnew.F_Cu
                    add_track(board, px, py, vx, vy, layer, code, 0.25)
                    placed = True
                    break
            if placed:
                per_pad += 1

    # sparse grid, to tie the outer pours back to the inner planes
    gnd = codes.get('GND')
    grid_vias = 0
    if gnd is not None:
        n = int(2 * half / grid)
        for i in range(n + 1):
            for j in range(n + 1):
                x = ORIGIN[0] - half + i * grid
                y = ORIGIN[1] - half + j * grid
                if free(x, y, gnd):
                    add_via(board, x, y, gnd)
                    obs.add_circle(x, y, VIA_DIA / 2.0, gnd)
                    grid_vias += 1
    return per_pad, grid_vias
