#!/usr/bin/env python3
"""Route whatever freerouting left bare, with a maze router of our own.

freerouting gets most of the board and then stops improving: on this layout
it climbs to a little over half the nets and the remaining passes buy three
or four more each.  What is left is not hard, it is just fiddly -- short hops
that need a via at each end in a one-millimetre band.  So this finishes the
job deterministically: an A* over a 0.05 mm grid across all six copper
layers, with the existing copper as obstacles.

It only ever adds copper for nets that have none, or that are still in
pieces, so it can be run after any routing round without disturbing what is
already there.
"""

import heapq
import math
import os
import subprocess
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import pcbnew                                                    # noqa: E402
import layout as LO                                              # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, '..'))
PCB = os.path.join(ROOT, 'oa35-aio.kicad_pcb')

ORIGIN = (150.0, 100.0)
GRID = 0.05
TRACK_W = 0.13
CLEAR = 0.13
VIA_DIA = 0.45
VIA_DRILL = 0.25
EDGE_KEEP = 0.3

# How far a piece of foreign copper reaches: its own half-width, the
# clearance and our half-width.  The test is exact for a track centred on a
# cell, so the only slack needed is for the middle of a diagonal step between
# two cells -- a hundredth of a millimetre.  Half a cell was tried first and
# is far too much: between two pads of a 0.4 mm pitch QFN it closes the
# escape corridor down to a single cell, and the pin cannot be routed at all.
MARGIN = 0.01
INFLATE = CLEAR + TRACK_W / 2.0 + MARGIN
VIA_INFLATE = CLEAR + VIA_DIA / 2.0 + MARGIN

LAYERS = (pcbnew.F_Cu, pcbnew.In1_Cu, pcbnew.In2_Cu, pcbnew.In3_Cu,
          pcbnew.In4_Cu, pcbnew.B_Cu)
# In1 is the solid ground plane and In2 the battery plane: routing a signal
# through either cuts the plane it is supposed to be.  In3 and In4 are the
# inner signal layers, and the two outer layers carry the rest.  One inner
# signal layer was tried first and is not enough: the failures start at a
# third of the board and climb from there.
ROUTABLE = (0, 3, 4, 5)         # F.Cu, In3, In4, B.Cu
# What a layer change is worth, in millimetres of detour.  At 1.2 the router
# would rather meander half way across the board on one layer than drop to an
# inner one, and the surface it wasted was exactly what the next net needed:
# failures climbed to nine out of every ten nets towards the end of the list.
VIA_COST = 0.5
# The outer layers carry every pad, so a run there costs more than the same
# run on an inner layer.  Small enough not to force pointless vias on the
# short hops.
LAYER_COST = {0: 1.25, 3: 1.0, 4: 1.0, 5: 1.25}

N = int(round(LO.BOARD / GRID)) + 1
HALF = LO.BOARD / 2.0


def tomm(v):
    return pcbnew.ToMM(v)


def mm(v):
    return pcbnew.FromMM(float(v))


class Space(object):
    """Per-layer occupancy: which net owns a cell, and which are unusable.

    A cell an obstacle reaches becomes that obstacle's net.  A cell two
    different nets reach belongs to neither and is closed to everyone -- which
    is exactly the rule a track has to obey.
    """

    def __init__(self):
        self.owner = [[0] * (N * N) for _ in LAYERS]
        self.shut = [bytearray(N * N) for _ in LAYERS]
        # cells that are literally inside a piece of copper.  A neighbour's
        # clearance must never close them: the copper is already there, and a
        # track of the same net may always run inside its own pad.  Without
        # this a corner pin of a QFN can end up with no way out at all.
        self.hard = [bytearray(N * N) for _ in LAYERS]
        self._close_outside()

    # -- coordinates ------------------------------------------------------
    @staticmethod
    def to_i(v):
        return int(round((v + HALF) / GRID))

    @staticmethod
    def to_mm(i):
        return i * GRID - HALF

    def _close_outside(self):
        r, lim = LO.CORNER_R, HALF - EDGE_KEEP
        for iy in range(N):
            y = self.to_mm(iy)
            for ix in range(N):
                x = self.to_mm(ix)
                bad = abs(x) > lim or abs(y) > lim
                if not bad and abs(x) > lim - r and abs(y) > lim - r:
                    cx = math.copysign(lim - r, x)
                    cy = math.copysign(lim - r, y)
                    bad = (x - cx) ** 2 + (y - cy) ** 2 > r * r
                if bad:
                    for li in range(len(LAYERS)):
                        self.shut[li][iy * N + ix] = 1
        for (mx, my) in ((1, 1), (1, -1), (-1, 1), (-1, -1)):
            self.disc(mx * LO.MOUNT_XY, my * LO.MOUNT_XY,
                      LO.MOUNT_D / 2.0 + CLEAR + TRACK_W / 2.0,
                      None, range(len(LAYERS)))

    # -- painting ---------------------------------------------------------
    def _touch(self, li, ix, iy, net, hard=False):
        if not (0 <= ix < N and 0 <= iy < N):
            return
        k = iy * N + ix
        if hard:
            self.hard[li][k] = 1
            self.shut[li][k] = 0
            self.owner[li][k] = net or 0
            return
        if self.hard[li][k] or self.shut[li][k]:
            return
        if net is None:
            self.shut[li][k] = 1
            return
        own = self.owner[li][k]
        if own == 0:
            self.owner[li][k] = net
        elif own != net:
            self.shut[li][k] = 1

    def box(self, x0, y0, x1, y1, pad, net, lis, hard=False):
        ix0, ix1 = self.to_i(x0 - pad), self.to_i(x1 + pad)
        iy0, iy1 = self.to_i(y0 - pad), self.to_i(y1 + pad)
        for li in lis:
            for iy in range(max(0, iy0), min(N, iy1 + 1)):
                for ix in range(max(0, ix0), min(N, ix1 + 1)):
                    self._touch(li, ix, iy, net, hard)

    def disc(self, cx, cy, r, net, lis, hard=False):
        ix0, ix1 = self.to_i(cx - r), self.to_i(cx + r)
        iy0, iy1 = self.to_i(cy - r), self.to_i(cy + r)
        rr = r * r
        for li in lis:
            for iy in range(max(0, iy0), min(N, iy1 + 1)):
                dy = self.to_mm(iy) - cy
                for ix in range(max(0, ix0), min(N, ix1 + 1)):
                    dx = self.to_mm(ix) - cx
                    if dx * dx + dy * dy <= rr:
                        self._touch(li, ix, iy, net, hard)

    def capsule(self, x0, y0, x1, y1, r, net, lis, hard=False):
        """A segment with a radius, rasterised without its bounding box.

        Using the bounding box for a diagonal track would close a whole
        rectangle of the board.
        """
        ix0, ix1 = self.to_i(min(x0, x1) - r), self.to_i(max(x0, x1) + r)
        iy0, iy1 = self.to_i(min(y0, y1) - r), self.to_i(max(y0, y1) + r)
        dx, dy = x1 - x0, y1 - y0
        L2 = dx * dx + dy * dy
        rr = r * r
        for li in lis:
            for iy in range(max(0, iy0), min(N, iy1 + 1)):
                py = self.to_mm(iy)
                for ix in range(max(0, ix0), min(N, ix1 + 1)):
                    px = self.to_mm(ix)
                    if L2 <= 1e-12:
                        d2 = (px - x0) ** 2 + (py - y0) ** 2
                    else:
                        t = ((px - x0) * dx + (py - y0) * dy) / L2
                        t = 0.0 if t < 0.0 else (1.0 if t > 1.0 else t)
                        d2 = ((px - x0 - t * dx) ** 2
                              + (py - y0 - t * dy) ** 2)
                    if d2 <= rr:
                        self._touch(li, ix, iy, net, hard)


def layer_indices(item):
    out = []
    for i, lid in enumerate(LAYERS):
        if item.IsOnLayer(lid):
            out.append(i)
    return out


def paint(board, ignore_tracks=False, skip=None):
    """Everything already on the board, as obstacles.

    Two passes, and the order matters: the real copper first, then the
    clearance around it.  Painted in one pass, a pad in a fine-pitch package
    has its own copper closed by its neighbours' clearance and the pin ends up
    with nowhere to start from.
    """
    sp = Space()
    for hard in (True, False):
        _paint_pass(board, sp, hard, ignore_tracks, skip)
    return sp


def _paint_pass(board, sp, hard, ignore_tracks=False, skip=None):
    grow = 0.0 if hard else INFLATE
    for fp in board.GetFootprints():
        for pad in fp.Pads():
            net = pad.GetNetCode()
            lis = layer_indices(pad)
            if pad.GetAttribute() in (pcbnew.PAD_ATTRIB_PTH,
                                      pcbnew.PAD_ATTRIB_NPTH):
                lis = list(range(len(LAYERS)))
            if not lis:
                continue
            if pad.GetAttribute() == pcbnew.PAD_ATTRIB_NPTH:
                net = None
            bb = pad.GetBoundingBox()
            sp.box(tomm(bb.GetLeft()) - ORIGIN[0],
                   tomm(bb.GetTop()) - ORIGIN[1],
                   tomm(bb.GetRight()) - ORIGIN[0],
                   tomm(bb.GetBottom()) - ORIGIN[1],
                   grow, net, lis, hard)
    for t in board.GetTracks():
        net = t.GetNetCode()
        if skip is not None and net == skip:
            continue                    # this net is being redone
        if ignore_tracks and t.Type() != pcbnew.PCB_VIA_T:
            continue
        if t.Type() == pcbnew.PCB_VIA_T:
            p = t.GetPosition()
            sp.disc(tomm(p.x) - ORIGIN[0], tomm(p.y) - ORIGIN[1],
                    tomm(t.GetWidth()) / 2.0 + grow, net,
                    range(len(LAYERS)), hard)
        else:
            a, b = t.GetStart(), t.GetEnd()
            lis = layer_indices(t)
            sp.capsule(tomm(a.x) - ORIGIN[0], tomm(a.y) - ORIGIN[1],
                       tomm(b.x) - ORIGIN[0], tomm(b.y) - ORIGIN[1],
                       tomm(t.GetWidth()) / 2.0 + grow, net, lis, hard)


# --------------------------------------------------------------------- A* --

STEPS = ((1, 0, GRID), (-1, 0, GRID), (0, 1, GRID), (0, -1, GRID),
         (1, 1, GRID * 1.4142), (1, -1, GRID * 1.4142),
         (-1, 1, GRID * 1.4142), (-1, -1, GRID * 1.4142))


def via_ok(sp, ix, iy, net):
    """A via needs room on every layer, not just the two it joins."""
    rad = int(math.ceil(VIA_INFLATE / GRID))
    rr = (VIA_INFLATE / GRID) ** 2
    for li in range(len(LAYERS)):
        own, shut = sp.owner[li], sp.shut[li]
        for dy in range(-rad, rad + 1):
            jy = iy + dy
            if not (0 <= jy < N):
                return False
            base = jy * N
            for dx in range(-rad, rad + 1):
                if dx * dx + dy * dy > rr:
                    continue
                jx = ix + dx
                if not (0 <= jx < N):
                    return False
                k = base + jx
                if shut[k] or (own[k] and own[k] != net):
                    return False
    return True


def free(sp, li, ix, iy, net):
    if not (0 <= ix < N and 0 <= iy < N):
        return False
    k = iy * N + ix
    if sp.shut[li][k]:
        return False
    own = sp.owner[li][k]
    return own == 0 or own == net


def astar(sp, sources, targets, net, budget=400000):
    """Shortest path from any source cell to any target cell.

    sources/targets are sets of (layer index, ix, iy).
    """
    if not sources or not targets:
        return None
    tset = set(targets)
    tx = sum(t[1] for t in targets) / float(len(targets))
    ty = sum(t[2] for t in targets) / float(len(targets))

    def h(ix, iy):
        return math.hypot(ix - tx, iy - ty) * GRID

    open_q = []
    best = {}
    for s in sources:
        if s in tset:
            return [s]
        best[s] = 0.0
        heapq.heappush(open_q, (h(s[1], s[2]), 0.0, s, None))
    came = {}
    seen = 0
    while open_q:
        f, g, cur, prev = heapq.heappop(open_q)
        if cur in came:
            continue
        came[cur] = prev
        if cur in tset:
            path = []
            while cur is not None:
                path.append(cur)
                cur = came[cur]
            path.reverse()
            return path
        seen += 1
        if seen > budget:
            return None
        li, ix, iy = cur
        mult = LAYER_COST[li]
        for dx, dy, cost in STEPS:
            nxt = (li, ix + dx, iy + dy)
            if nxt in came or not free(sp, li, ix + dx, iy + dy, net):
                continue
            ng = g + cost * mult
            if best.get(nxt, 1e18) <= ng:
                continue
            best[nxt] = ng
            heapq.heappush(open_q, (ng + h(ix + dx, iy + dy), ng, nxt, cur))
        for lj in ROUTABLE:
            if lj == li:
                continue
            nxt = (lj, ix, iy)
            if nxt in came or not free(sp, lj, ix, iy, net):
                continue
            ng = g + VIA_COST
            if best.get(nxt, 1e18) <= ng:
                continue
            if not via_ok(sp, ix, iy, net):
                continue
            best[nxt] = ng
            heapq.heappush(open_q, (ng + h(ix, iy), ng, nxt, cur))
    return None


def cells_of_pad(sp, pad):
    """The cells a track may start from inside a pad."""
    net = pad.GetNetCode()
    lis = layer_indices(pad)
    if pad.GetAttribute() == pcbnew.PAD_ATTRIB_PTH:
        lis = list(ROUTABLE)
    lis = [li for li in lis if li in ROUTABLE] or [li for li in lis]
    p = pad.GetPosition()
    cx = tomm(p.x) - ORIGIN[0]
    cy = tomm(p.y) - ORIGIN[1]
    out = set()
    for li in lis:
        ix, iy = sp.to_i(cx), sp.to_i(cy)
        if free(sp, li, ix, iy, net):
            out.add((li, ix, iy))
    return out


def commit(board, sp, path, net):
    """Turn a cell path into tracks and vias, and close the space it uses."""
    tracks, vias = 0, 0
    run = [path[0]]
    for cur in path[1:]:
        if cur[0] == run[-1][0]:
            run.append(cur)
            continue
        emit_run(board, sp, run, net)
        tracks += 1
        p = run[-1]
        v = pcbnew.PCB_VIA(board)
        v.SetPosition(pcbnew.VECTOR2I(mm(sp.to_mm(p[1]) + ORIGIN[0]),
                                      mm(sp.to_mm(p[2]) + ORIGIN[1])))
        v.SetWidth(mm(VIA_DIA))
        v.SetDrill(mm(VIA_DRILL))
        v.SetLayerPair(pcbnew.F_Cu, pcbnew.B_Cu)
        v.SetNetCode(net)
        board.Add(v)
        sp.disc(sp.to_mm(p[1]), sp.to_mm(p[2]), VIA_DIA / 2.0 + INFLATE,
                net, range(len(LAYERS)))
        vias += 1
        run = [cur]
    emit_run(board, sp, run, net)
    return tracks + 1, vias


def touching(a, b):
    """Do two pieces of copper on the same net actually meet?"""
    (ka, la, ga), (kb, lb, gb) = a, b
    if not (la & lb):
        return False
    if ka == 'c' and kb == 'c':
        return math.hypot(ga[0] - gb[0], ga[1] - gb[1]) <= ga[2] + gb[2]
    if ka == 'c':
        return seg_box(ga, gb)
    if kb == 'c':
        return seg_box(gb, ga)
    return not (ga[2] < gb[0] or gb[2] < ga[0]
                or ga[3] < gb[1] or gb[3] < ga[1])


def seg_box(circle, box):
    cx, cy, r = circle
    nx = min(max(cx, box[0]), box[2])
    ny = min(max(cy, box[1]), box[3])
    return math.hypot(cx - nx, cy - ny) <= r


def net_items(board, code):
    """Pads, tracks and vias of one net, as (kind, layers, geometry)."""
    out = []
    for fp in board.GetFootprints():
        for pad in fp.Pads():
            if pad.GetNetCode() != code:
                continue
            lis = set(layer_indices(pad))
            if pad.GetAttribute() == pcbnew.PAD_ATTRIB_PTH:
                lis = set(range(len(LAYERS)))
            bb = pad.GetBoundingBox()
            p = pad.GetPosition()
            out.append(('b', lis,
                        (tomm(bb.GetLeft()) - ORIGIN[0],
                         tomm(bb.GetTop()) - ORIGIN[1],
                         tomm(bb.GetRight()) - ORIGIN[0],
                         tomm(bb.GetBottom()) - ORIGIN[1]),
                        [(tomm(p.x) - ORIGIN[0], tomm(p.y) - ORIGIN[1])],
                        lis))
    for t in board.GetTracks():
        if t.GetNetCode() != code:
            continue
        if t.Type() == pcbnew.PCB_VIA_T:
            p = t.GetPosition()
            x, y = tomm(p.x) - ORIGIN[0], tomm(p.y) - ORIGIN[1]
            lis = set(range(len(LAYERS)))
            out.append(('c', lis, (x, y, tomm(t.GetWidth()) / 2.0),
                        [(x, y)], lis))
        else:
            a, b = t.GetStart(), t.GetEnd()
            ax, ay = tomm(a.x) - ORIGIN[0], tomm(a.y) - ORIGIN[1]
            bx, by = tomm(b.x) - ORIGIN[0], tomm(b.y) - ORIGIN[1]
            lis = set(layer_indices(t))
            half = tomm(t.GetWidth()) / 2.0
            out.append(('b', lis,
                        (min(ax, bx) - half, min(ay, by) - half,
                         max(ax, bx) + half, max(ay, by) + half),
                        [(ax, ay), (bx, by)], lis))
    return out


def components(items):
    """Union-find over the pieces of copper on one net."""
    parent = list(range(len(items)))

    def find(i):
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    for i in range(len(items)):
        for j in range(i + 1, len(items)):
            if touching(items[i][:3], items[j][:3]):
                a, b = find(i), find(j)
                if a != b:
                    parent[a] = b
    groups = {}
    for i in range(len(items)):
        groups.setdefault(find(i), []).append(i)
    return list(groups.values())


def anchor_cells(sp, items, group, net):
    """Every cell of the group's copper a track may leave from.

    Taking only the centre of each pad is not enough: on a fine-pitch package
    the centre can be the one cell with no way out, while the far end of the
    same pad opens straight into the fanout ring.
    """
    out = set()
    for i in group:
        kind, lis, geom = items[i][0], items[i][4], items[i][2]
        if kind == 'c':
            x0 = y0 = None
            cx, cy, r = geom
            x0, y0, x1, y1 = cx - r, cy - r, cx + r, cy + r
        else:
            x0, y0, x1, y1 = geom
        ix0, ix1 = sp.to_i(x0), sp.to_i(x1)
        iy0, iy1 = sp.to_i(y0), sp.to_i(y1)
        for li in lis:
            if li not in ROUTABLE:
                continue
            for iy in range(max(0, iy0), min(N, iy1 + 1)):
                for ix in range(max(0, ix0), min(N, ix1 + 1)):
                    if sp.hard[li][iy * N + ix] \
                            and sp.owner[li][iy * N + ix] == net:
                        out.add((li, ix, iy))
    return out


def via_sites_near(sp, cx, cy, code, reach=1.8):
    """Cells within reach of (cx, cy) that could hold a via, nearest first."""
    ix0, iy0 = sp.to_i(cx), sp.to_i(cy)
    span = int(reach / GRID)
    out = []
    for dy in range(-span, span + 1):
        for dx in range(-span, span + 1):
            d2 = dx * dx + dy * dy
            if d2 > span * span:
                continue
            out.append((d2, ix0 + dx, iy0 + dy))
    out.sort()
    return out


def fanout(board, sp, codes, reach=1.8):
    """Give every surface pad its own escape via before anything is routed.

    This is what a greedy router cannot recover from on its own: the first
    hundred nets run their tracks past the pads of the last hundred, and by
    the time those come up their pins are walled in -- not short of a route,
    short of any way off the layer at all.  Half the board failed that way.
    Reserving one via per pad up front costs a little copper and turns the
    long-distance routing into a problem on the inner layers, where there is
    room.

    Tightest pads first, so the pins with one way out get it.
    """
    jobs = []
    for fp in board.GetFootprints():
        for pad in fp.Pads():
            code = pad.GetNetCode()
            if code not in codes:
                continue
            if pad.GetAttribute() in (pcbnew.PAD_ATTRIB_PTH,
                                      pcbnew.PAD_ATTRIB_NPTH):
                continue                      # already through the board
            lis = [li for li in layer_indices(pad) if li in ROUTABLE]
            if not lis:
                continue
            p = pad.GetPosition()
            cx, cy = tomm(p.x) - ORIGIN[0], tomm(p.y) - ORIGIN[1]
            ix, iy = sp.to_i(cx), sp.to_i(cy)
            room = sum(1 for dx, dy, _ in STEPS
                       if free(sp, lis[0], ix + dx, iy + dy, code))
            jobs.append((room, cx, cy, lis[0], code))
    jobs.sort()

    placed = 0
    for _room, cx, cy, li, code in jobs:
        src = set()
        ix0, iy0 = sp.to_i(cx), sp.to_i(cy)
        for dy in range(-6, 7):
            for dx in range(-6, 7):
                k = (iy0 + dy) * N + ix0 + dx
                if 0 <= ix0 + dx < N and 0 <= iy0 + dy < N \
                        and sp.hard[li][k] and sp.owner[li][k] == code:
                    src.add((li, ix0 + dx, iy0 + dy))
        if not src:
            continue
        for _d2, ix, iy in via_sites_near(sp, cx, cy, code, reach):
            if not (0 <= ix < N and 0 <= iy < N):
                continue
            if not free(sp, li, ix, iy, code) or not via_ok(sp, ix, iy, code):
                continue
            path = astar(sp, src, {(li, ix, iy)}, code, budget=4000)
            if not path:
                continue
            commit(board, sp, path, code)
            v = pcbnew.PCB_VIA(board)
            v.SetPosition(pcbnew.VECTOR2I(mm(sp.to_mm(ix) + ORIGIN[0]),
                                          mm(sp.to_mm(iy) + ORIGIN[1])))
            v.SetWidth(mm(VIA_DIA))
            v.SetDrill(mm(VIA_DRILL))
            v.SetLayerPair(pcbnew.F_Cu, pcbnew.B_Cu)
            v.SetNetCode(code)
            board.Add(v)
            sp.disc(sp.to_mm(ix), sp.to_mm(iy), VIA_DIA / 2.0 + INFLATE,
                    code, range(len(LAYERS)))
            placed += 1
            break
    return placed


def in_pieces(board):
    """Every net that still needs copper, shortest span first."""
    nets = board.GetNetsByName()
    out = []
    for name in nets.keys():
        name = str(name)
        if not name or name in ('GND', 'VBAT') \
                or name.startswith(('NC', 'ND')):
            continue
        code = nets[name].GetNetCode()
        items = net_items(board, code)
        if len(items) < 2:
            continue
        if len(components(items)) > 1:
            xs = [p[0] for it in items for p in it[3]]
            ys = [p[1] for it in items for p in it[3]]
            out.append((name, code,
                        max(xs) - min(xs) + max(ys) - min(ys)))
    # shortest first: a long net routed early wanders across the board and
    # walls in the short local ones, which are the ones with no alternative
    out.sort(key=lambda r: r[2])
    return out


def route_one(board, sp, code):
    """Join the pieces of one net.  True if it came out whole."""
    items = net_items(board, code)
    groups = components(items)
    while len(groups) > 1:
        src = anchor_cells(sp, items, groups[0], code)
        best = None
        for g in groups[1:]:
            tgt = anchor_cells(sp, items, g, code)
            if not tgt:
                continue
            path = astar(sp, src, tgt, code)
            if path and (best is None or len(path) < len(best)):
                best = path
        if best is None:
            return False
        commit(board, sp, best, code)
        items = net_items(board, code)
        groups = components(items)
    return True


def blockers(sp, soft, board, code, limit=8):
    """Which nets stand in the way of this one.

    Routed again on a board where foreign tracks are transparent -- the pads
    are still there, so the path is a real one -- the cells it crosses say
    whose copper would have to move.
    """
    items = net_items(board, code)
    groups = components(items)
    if len(groups) < 2:
        return []
    src = anchor_cells(soft, items, groups[0], code)
    for g in groups[1:]:
        tgt = anchor_cells(soft, items, g, code)
        if not tgt:
            continue
        path = astar(soft, src, tgt, code)
        if not path:
            continue
        seen = []
        for (li, ix, iy) in path:
            own = sp.owner[li][iy * N + ix]
            if own and own != code and own not in seen:
                seen.append(own)
        return seen[:limit]
    return []


def clear_nets(codes):
    """Drop the tracks of these nets, in a separate process.

    BOARD.Remove() leaves pcbnew's python proxies broken for the rest of the
    interpreter, so this cannot share a process with the routing that follows.
    """
    subprocess.check_call([sys.executable, os.path.abspath(__file__),
                           '--clear-nets', ','.join(str(c) for c in codes)])


def _clear_here(codes):
    board = pcbnew.LoadBoard(PCB)
    doomed = [t for t in board.GetTracks() if t.GetNetCode() in codes]
    for t in doomed:
        board.Remove(t)
    board.Save(PCB)


def route_pass(board, sp, todo, label):
    done = lost = 0
    names = []
    for k, (name, code, _span) in enumerate(todo):
        if route_one(board, sp, code):
            done += 1
        else:
            lost += 1
            names.append(name)
        if (k + 1) % 10 == 0:
            print('  %s  %d/%d   %d joined, %d out of reach'
                  % (label, k + 1, len(todo), done, lost), flush=True)
    return done, lost, names


def main(limit=None, rounds=6, escapes=False):
    board = pcbnew.LoadBoard(PCB)
    sp = paint(board)
    todo = in_pieces(board)
    print('%d nets are in pieces' % len(todo), flush=True)
    if limit:
        todo = todo[:limit]
    # Order matters, and the obvious order is wrong.  Reserving the escape
    # vias first crowds the pads that the short local nets need -- gate
    # resistor to gate pad is under a millimetre and has nowhere else to go --
    # and the failures start at net 30 instead of net 60.  So: the local hops
    # first, then the escapes for what is left, then the long haul.
    LOCAL = 3.0
    local = [t for t in todo if t[2] <= LOCAL]
    done, lost, names = route_pass(board, sp, local, 'local')
    print('local nets: %d joined, %d out of reach' % (done, lost), flush=True)

    # Reserving an escape via per pad was tried here and is worse, not
    # better: a through via costs space on all six layers, and 284 of them
    # take a tenth of every layer out of use, clustered exactly where the
    # long nets have to pass.  Failures went from five in the first sixty
    # nets to eleven in the first thirty.  fanout() is kept for the record
    # and left switched off.
    if escapes:
        rest = [t for t in in_pieces(board) if t[2] > LOCAL]
        print('escape vias: %d placed'
              % fanout(board, sp, set(c for _n, c, _s in rest)), flush=True)
    done, lost, names = route_pass(board, sp, in_pieces(board), 'pass 1')
    board.Save(PCB)
    print('pass 1: %d joined, %d out of reach' % (done, lost), flush=True)

    # Then rip up and try again: a greedy router paints itself into corners,
    # and the only way out is to move what is in the way.
    for r in range(2, rounds + 1):
        board = pcbnew.LoadBoard(PCB)
        sp = paint(board)
        todo = in_pieces(board)
        if not todo:
            break
        soft = paint(board, ignore_tracks=True)
        doomed = set()
        for name, code, _span in todo:
            doomed.update(blockers(sp, soft, board, code))
        doomed.discard(0)
        if not doomed:
            print('nothing left to move for %d nets' % len(todo), flush=True)
            break
        print('round %d: %d nets left, ripping up %d that block them'
              % (r, len(todo), len(doomed)), flush=True)
        clear_nets(doomed)
        board = pcbnew.LoadBoard(PCB)
        sp = paint(board)
        # the ones that failed go first this time, then whatever was moved
        first = in_pieces(board)
        order = {name: i for i, (name, _c, _s) in enumerate(todo)}
        first.sort(key=lambda r: (order.get(r[0], 10 ** 6), r[2]))
        done, lost, names = route_pass(board, sp, first, 'round %d' % r)
        board.Save(PCB)
        print('round %d: %d joined, %d out of reach'
              % (r, done, lost), flush=True)

    board = pcbnew.LoadBoard(PCB)
    left = in_pieces(board)
    conn = board.GetConnectivity()
    conn.RecalculateRatsnest()
    print('nets still in pieces: %d' % len(left))
    if left:
        print('  ' + ', '.join(n for n, _c, _s in left))
    print('unconnected pads: %d' % conn.GetUnconnectedCount(False))
    return len(left)


def clear_line(sp, li, a, b, net):
    """Could a straight track run from cell a to cell b?"""
    dx, dy = b[0] - a[0], b[1] - a[1]
    steps = max(abs(dx), abs(dy))
    if steps == 0:
        return True
    for i in range(steps + 1):
        u = i / float(steps)
        ix = int(round(a[0] + dx * u))
        iy = int(round(a[1] + dy * u))
        if not free(sp, li, ix, iy, net):
            return False
    return True


def straighten(sp, run, net):
    """Replace the staircase with the longest straight runs that still fit.

    An eight-way search on a 0.05 mm grid draws a line at any angle other
    than a multiple of 45 degrees as an alternation of tiny steps, and
    emitting one track per step gives the zigzags that make the board look
    hand-drawn by somebody in a hurry.  Worse, a staircase sweeps a wider
    ribbon than the straight line it approximates, so it takes more of the
    board out of use than it needs -- it was part of why the board looked
    congested.

    Greedy line of sight: from each vertex, go as far along the path as a
    straight track can legally reach, and start again from there.
    """
    li = run[0][0]
    cells = [(c[1], c[2]) for c in run]
    out = [0]
    i = 0
    while i < len(cells) - 1:
        j = len(cells) - 1
        while j > i + 1 and not clear_line(sp, li, cells[i], cells[j], net):
            j -= 1
        out.append(j)
        i = j
    return [(li, cells[k][0], cells[k][1]) for k in out]


def emit_run(board, sp, run, net):
    """One straight track per collinear stretch of a same-layer run."""
    if len(run) < 2:
        return
    li = run[0][0]
    pts = straighten(sp, run, net)
    for a, b in zip(pts, pts[1:]):
        x0, y0 = sp.to_mm(a[1]), sp.to_mm(a[2])
        x1, y1 = sp.to_mm(b[1]), sp.to_mm(b[2])
        t = pcbnew.PCB_TRACK(board)
        t.SetStart(pcbnew.VECTOR2I(mm(x0 + ORIGIN[0]), mm(y0 + ORIGIN[1])))
        t.SetEnd(pcbnew.VECTOR2I(mm(x1 + ORIGIN[0]), mm(y1 + ORIGIN[1])))
        t.SetWidth(mm(TRACK_W))
        t.SetLayer(LAYERS[li])
        t.SetNetCode(net)
        board.Add(t)
        sp.capsule(x0, y0, x1, y1, TRACK_W / 2.0 + INFLATE, net, [li])


if __name__ == '__main__':
    if '--clear-nets' in sys.argv:
        i = sys.argv.index('--clear-nets')
        _clear_here(set(int(c) for c in sys.argv[i + 1].split(',') if c))
        sys.exit(0)
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    sys.exit(0 if main(int(args[0]) if args else None) == 0 else 1)
