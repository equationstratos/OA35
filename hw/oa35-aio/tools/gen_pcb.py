#!/usr/bin/env python3
"""Build oa35-aio.kicad_pcb: stackup, outline, placement, copper pours.

Big and position-critical parts come from tools/layout.py.  Everything else
(the ~150 passives) is placed automatically next to the pins it connects to,
on a 0.1 mm occupancy grid that also knows about the board outline and the
mounting holes, so the result never overlaps.
"""

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import pcbnew                                                    # noqa: E402
import design                                                    # noqa: E402
import layout as LO                                              # noqa: E402
from pcb import Board, Frame, LAYER, mm, vec                     # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, '..'))
LIBS = ['/usr/share/kicad/footprints', os.path.join(ROOT, 'lib')]
OUT = os.path.join(ROOT, 'oa35-aio.kicad_pcb')

HALF = LO.BOARD / 2.0
CLR = 0.3                     # component-to-component keep-apart, mm
GRID = 0.1                    # auto-placement grid


# ---------------------------------------------------------------- outline --

def outline(bd):
    r = LO.CORNER_R
    h = HALF
    pts = [(-h + r, -h, h - r, -h), (h, -h + r, h, h - r),
           (h - r, h, -h + r, h), (-h, h - r, -h, -h + r)]
    for x0, y0, x1, y1 in pts:
        bd.seg(pcbnew.Edge_Cuts, x0, y0, x1, y1, 0.1)
    for cx, cy, a0, a1 in ((h - r, -h + r, 270, 360), (h - r, h - r, 0, 90),
                           (-h + r, h - r, 90, 180), (-h + r, -h + r, 180, 270)):
        bd.arc(pcbnew.Edge_Cuts, cx, cy, r, a0, a1, 0.1)


def stackup_and_rules(bd):
    ds = bd.b.GetDesignSettings()
    ds.SetCopperLayerCount(6)
    ds.m_TrackMinWidth = mm(0.127)
    ds.m_ViasMinSize = mm(0.45)
    ds.m_MinThroughDrill = mm(0.25)
    ds.m_HoleToHoleMin = mm(0.25)
    ds.m_HoleClearance = mm(0.2)
    ds.m_CopperEdgeClearance = mm(0.25)
    # 0.13 mm track and clearance is JLCPCB's standard 5 mil capability, and
    # it is what makes the board routable: at 0.2/0.15 there is no channel
    # between the pins of a 0.4 mm pitch QFN, and the autorouter leaves a
    # third of the nets bare.  The current-carrying nets are fattened again
    # afterwards by stitch.widen().
    nc = ds.m_NetSettings.m_DefaultNetClass
    nc.SetClearance(mm(0.13))
    nc.SetTrackWidth(mm(0.13))
    nc.SetViaDiameter(mm(0.45))
    nc.SetViaDrill(mm(0.25))
    bd.b.SetCopperLayerCount(6)
    # In1 ground, In2 battery, In3 and In4 signal.  Two inner signal layers,
    # not one: with a single one the maze router runs out of room a third of
    # the way through the board.  In3 and In4 still get a ground pour around
    # whatever is routed on them.
    for lid, name in ((pcbnew.In1_Cu, 'GND1'), (pcbnew.In2_Cu, 'PWR'),
                      (pcbnew.In3_Cu, 'SIG1'), (pcbnew.In4_Cu, 'SIG2')):
        bd.b.SetLayerName(lid, name)


# ----------------------------------------------------------- placement ------

class Grid(object):
    """Occupancy grid per board side, used by the automatic placement."""

    def __init__(self):
        self.n = int(round(LO.BOARD / GRID)) + 1
        self.cells = {False: bytearray(self.n * self.n),
                      True: bytearray(self.n * self.n)}
        self._block_outside()

    def idx(self, ix, iy):
        return iy * self.n + ix

    def to_i(self, v):
        return int(round((v + HALF) / GRID))

    def _block_outside(self):
        r = LO.CORNER_R
        lim = HALF - LO.EDGE_CLR
        for iy in range(self.n):
            y = iy * GRID - HALF
            for ix in range(self.n):
                x = ix * GRID - HALF
                bad = abs(x) > lim or abs(y) > lim
                if not bad and abs(x) > lim - r and abs(y) > lim - r:
                    cx = math.copysign(lim - r, x)
                    cy = math.copysign(lim - r, y)
                    bad = (x - cx) ** 2 + (y - cy) ** 2 > r * r
                if bad:
                    for side in (False, True):
                        self.cells[side][self.idx(ix, iy)] = 1

    def block_rect(self, side, x0, y0, x1, y1, both=False):
        ix0, ix1 = self.to_i(x0), self.to_i(x1)
        iy0, iy1 = self.to_i(y0), self.to_i(y1)
        sides = (False, True) if both else (side,)
        for s in sides:
            c = self.cells[s]
            for iy in range(max(0, iy0), min(self.n, iy1 + 1)):
                base = iy * self.n
                for ix in range(max(0, ix0), min(self.n, ix1 + 1)):
                    c[base + ix] = 1

    def block_circle(self, cx, cy, r):
        ix0, ix1 = self.to_i(cx - r), self.to_i(cx + r)
        iy0, iy1 = self.to_i(cy - r), self.to_i(cy + r)
        for s in (False, True):
            c = self.cells[s]
            for iy in range(max(0, iy0), min(self.n, iy1 + 1)):
                y = iy * GRID - HALF
                for ix in range(max(0, ix0), min(self.n, ix1 + 1)):
                    x = ix * GRID - HALF
                    if (x - cx) ** 2 + (y - cy) ** 2 <= r * r:
                        c[iy * self.n + ix] = 1

    def free(self, side, x0, y0, x1, y1):
        ix0, ix1 = self.to_i(x0), self.to_i(x1)
        iy0, iy1 = self.to_i(y0), self.to_i(y1)
        if ix0 < 0 or iy0 < 0 or ix1 >= self.n or iy1 >= self.n:
            return False
        c = self.cells[side]
        for iy in range(iy0, iy1 + 1):
            base = iy * self.n
            for ix in range(ix0, ix1 + 1):
                if c[base + ix]:
                    return False
        return True


def pad_extent(fp):
    xs, ys = [], []
    for pad in fp.Pads():
        bb = pad.GetBoundingBox()
        xs += [pcbnew.ToMM(bb.GetLeft()), pcbnew.ToMM(bb.GetRight())]
        ys += [pcbnew.ToMM(bb.GetTop()), pcbnew.ToMM(bb.GetBottom())]
    if not xs:
        bb = fp.GetBoundingBox(False, False)
        return (pcbnew.ToMM(bb.GetLeft()), pcbnew.ToMM(bb.GetTop()),
                pcbnew.ToMM(bb.GetRight()), pcbnew.ToMM(bb.GetBottom()))
    return (min(xs), min(ys), max(xs), max(ys))


COURTYARD = (pcbnew.F_CrtYd, pcbnew.B_CrtYd)


def courtyard_extent(fp):
    """Bounding box of the courtyard drawings, read straight off the
    graphics: GetCourtyard() needs a cache that only exists once the
    footprint belongs to a board."""
    xs, ys = [], []
    items = fp.GraphicalItems()
    for i in range(items.size()):
        it = items[i]
        if it.GetLayer() not in COURTYARD:
            continue
        bb = it.GetBoundingBox()
        xs += [pcbnew.ToMM(bb.GetLeft()), pcbnew.ToMM(bb.GetRight())]
        ys += [pcbnew.ToMM(bb.GetTop()), pcbnew.ToMM(bb.GetBottom())]
    if not xs:
        return None
    return (min(xs), min(ys), max(xs), max(ys))


def keepout_extent(fp):
    """Courtyard if the footprint has one, unioned with its pads."""
    x0, y0, x1, y1 = pad_extent(fp)
    cy = courtyard_extent(fp)
    if cy:
        x0, y0 = min(x0, cy[0]), min(y0, cy[1])
        x1, y1 = max(x1, cy[2]), max(y1, cy[3])
    return (x0, y0, x1, y1)


def occupy(grid, bd, fp, side):
    x0, y0, x1, y1 = pad_extent(fp)
    ox, oy = pcbnew.ToMM(fp.GetPosition().x), pcbnew.ToMM(fp.GetPosition().y)
    grid.block_rect(side,
                    x0 - LO.BOARD - CLR, y0 - LO.BOARD - CLR,
                    x1 - LO.BOARD + CLR, y1 - LO.BOARD + CLR)


def occupy_abs(grid, side, x0, y0, x1, y1, extra=0.0):
    grid.block_rect(side, x0 - CLR - extra, y0 - CLR - extra,
                    x1 + CLR + extra, y1 + CLR + extra)


# Extra keep-out around the fine-pitch packages, on top of CLR.
#
# A 0.4 mm pitch QFN cannot be escaped between its own pads: a 0.13 mm trace
# with 0.13 mm either side needs 0.39 mm and there is 0.15 mm.  Every pin has
# to leave the package radially and then drop to an inner layer, which costs a
# 0.45 mm via plus its clearance -- 0.71 mm of ring, staggered over two rows.
# With decoupling packed at CLR the ring is 0.6 mm wide and the router simply
# gives up on those pins.
FANOUT = 0.75
# The gate drivers were left out of this once, on the theory that 0.5 mm
# pitch escapes easily.  It does not: with the ring gone, a driver pin could
# reach 0.8 mm2 of free copper and not one spot with room for a via, so its
# net could not be routed by anything.  They are back in.
FANOUT_RING = dict(
    [('U6', FANOUT), ('U7', FANOUT)]
    + [('U%d0' % c, FANOUT) for c in range(2, 6)]
    + [('U%d1' % c, FANOUT) for c in range(2, 6)])


class Placer(object):
    def __init__(self, bd):
        self.bd = bd
        self.grid = Grid()
        self.placed = {}          # ref -> (x, y, angle, bottom)
        self.fps = {}

    def size_of(self, part, angle):
        fp = self.bd.load_fp(part.fp)
        x0, y0, x1, y1 = pad_extent(fp)
        w, h = x1 - x0, y1 - y0
        cx, cy = (x0 + x1) / 2.0, (y0 + y1) / 2.0
        if int(round(angle)) % 180 in (90,):
            w, h = h, w
            cx, cy = cy, -cx
        return w, h, cx, cy

    def put(self, ref, x, y, angle=0.0, bottom=False):
        part = design.PARTS[ref]
        fp = self.bd.place(ref, part, x, y, angle, bottom)
        self.fps[ref] = fp
        self.placed[ref] = (x, y, angle, bottom)
        x0, y0, x1, y1 = self.abs_extent(ref)
        occupy_abs(self.grid, bottom, x0, y0, x1, y1,
                   FANOUT_RING.get(ref, 0.0))
        # a through-hole pad eats space on both sides, not just its own
        for box in self.through_boxes(ref):
            occupy_abs(self.grid, not bottom, *box)
        return fp

    def through_boxes(self, ref):
        """One box per through-hole pad, so a connector's shell posts do not
        block the whole rectangle between them."""
        through = (pcbnew.PAD_ATTRIB_PTH, pcbnew.PAD_ATTRIB_NPTH)
        out = []
        for pad in self.fps[ref].Pads():
            if pad.GetAttribute() not in through:
                continue
            bb = pad.GetBoundingBox()
            out.append((pcbnew.ToMM(bb.GetLeft()) - 150.0,
                        pcbnew.ToMM(bb.GetTop()) - 100.0,
                        pcbnew.ToMM(bb.GetRight()) - 150.0,
                        pcbnew.ToMM(bb.GetBottom()) - 100.0))
        return out

    def abs_extent(self, ref, through_only=False):
        """Keep-out box: the pads plus CLR.

        Courtyards would be the textbook keep-out, but searching free space
        against full IPC courtyards does not converge on a board this dense,
        and a courtyard overlap is a design convention rather than something
        the fabricator cares about.  See finish_pcb.patch_project().
        """
        fp = self.fps[ref]
        xs, ys = [], []
        through = (pcbnew.PAD_ATTRIB_PTH, pcbnew.PAD_ATTRIB_NPTH)
        for pad in fp.Pads():
            if through_only and pad.GetAttribute() not in through:
                continue
            bb = pad.GetBoundingBox()
            xs += [pcbnew.ToMM(bb.GetLeft()) - 150.0,
                   pcbnew.ToMM(bb.GetRight()) - 150.0]
            ys += [pcbnew.ToMM(bb.GetTop()) - 100.0,
                   pcbnew.ToMM(bb.GetBottom()) - 100.0]
        if not xs:
            return None
        return (min(xs), min(ys), max(xs), max(ys))

    def anchor(self, ref):
        """Preferred spot and side: where the pins we connect to already are."""
        part = design.PARTS[ref]
        pts, votes = [], {False: 0, True: 0}
        nets = design.nets()
        for pin, net in part.pins.items():
            if net.startswith(('NC', 'ND')):
                continue
            fan = nets[net]
            if len(fan) > 8:          # power rails say nothing about position
                continue
            for oref, opin in fan:
                if oref == ref or oref not in self.fps:
                    continue
                fp = self.fps[oref]
                for pad in fp.Pads():
                    if pad.GetNumber() == opin:
                        p = pad.GetPosition()
                        pts.append((pcbnew.ToMM(p.x) - 150.0,
                                    pcbnew.ToMM(p.y) - 100.0))
                        votes[self.placed[oref][3]] += 1
        if not pts:
            return None, None
        side = None
        if votes[True] != votes[False]:
            side = votes[True] > votes[False]
        return ((sum(p[0] for p in pts) / len(pts),
                 sum(p[1] for p in pts) / len(pts)), side)

    def auto(self, ref, prefer=None, side=None, flipped=False):
        part = design.PARTS[ref]
        a, vote = self.anchor(ref)
        hint = LO.NEAR.get(ref)
        if hint and hint in self.placed:
            hx, hy, _, hs = self.placed[hint]
            a, vote = (hx, hy), hs
        a = prefer or a or (0.0, 0.0)
        if side is None:
            side = vote
        sides = [False, True] if side is None else [side]
        # the footprint's size does not depend on where it lands, and asking
        # for it inside the search meant re-measuring every pad of it once
        # per candidate position
        shapes = []
        for angle in (0.0, 90.0):
            w, h, cx, cy = self.size_of(part, angle)
            shapes.append((angle, cx, cy, w / 2.0 + CLR, h / 2.0 + CLR))
        best = None
        for radius in range(0, 260):
            rr = radius * GRID * 2
            for (x, y) in ring(a[0], a[1], rr):
                for angle, cx, cy, hw, hh in shapes:
                    for bottom in sides:
                        px, py = x - cx, y - cy
                        if not self.grid.free(bottom, px - hw, py - hh,
                                              px + hw, py + hh):
                            continue
                        d = (x - a[0]) ** 2 + (y - a[1]) ** 2
                        if best is None or d < best[0]:
                            best = (d, px, py, angle, bottom)
            if best is not None:
                break
        if best is None and side is not None and not flipped:
            # preferred side is full, take the other one -- once.  Handing the
            # flipped side back without remembering that is an infinite
            # recursion when the part fits on neither.
            return self.auto(ref, prefer=a, side=not side, flipped=True)
        if best is None:
            raise SystemExit('no room left for %s (%s, %s)'
                             % (ref, part.fp, part.value))
        _, px, py, angle, bottom = best
        return self.put(ref, round(px, 3), round(py, 3), angle, bottom)

    def verify(self):
        """No pad may leave the board or touch another footprint's pads."""
        errs = []
        boxes = []
        lim = HALF - LO.EDGE_CLR + 0.001
        for ref, (x, y, ang, bottom) in self.placed.items():
            hole = design.PARTS[ref].sym == 'HOLE'
            x0, y0, x1, y1 = self.abs_extent(ref)
            if min(x0, y0) < -lim or max(x1, y1) > lim:
                errs.append('%s sticks out of the board: %.2f..%.2f, '
                            '%.2f..%.2f' % (ref, x0, x1, y0, y1))
            # a mounting hole goes through the board, so it is an obstacle on
            # both sides; skipping it here is how a MOSFET array ended up
            # sitting on top of one
            if hole:
                boxes.append((ref, False, x0, y0, x1, y1))
                boxes.append((ref, True, x0, y0, x1, y1))
                continue
            boxes.append((ref, bottom, x0, y0, x1, y1))
            for box in self.through_boxes(ref):
                boxes.append((ref, not bottom) + box)
        for i in range(len(boxes)):
            r1, s1, ax0, ay0, ax1, ay1 = boxes[i]
            for j in range(i + 1, len(boxes)):
                r2, s2, bx0, by0, bx1, by1 = boxes[j]
                if s1 != s2:
                    continue
                if (ax0 < bx1 and bx0 < ax1 and ay0 < by1 and by0 < ay1):
                    errs.append('%s overlaps %s' % (r1, r2))
        return errs


# Passives whose side is dictated by the block they belong to rather than
# by whatever happens to be placed first.
FORCED_SIDE = {
    'gate': False,      # gate resistors, bootstrap and VCC caps: with the FETs
    'escmcu': True,     # ESC micro support parts: with the micro
    'power': False,     # battery-rail bulk and clamps: with the power stage
}


def side_key(ref):
    if ref.startswith(('RG', 'CBS', 'CVCC')):
        return 'gate'
    if ref.startswith(('RB', 'RN', 'RC', 'RVDA', 'RRST', 'RBT', 'RSIG',
                       'CVDD', 'CVDA', 'CRST')):
        return 'escmcu'
    if ref in ('C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C44', 'D1', 'D2'):
        return 'power'
    return None


def local_pad(pl, frame, ref, number):
    for pad in pl.fps[ref].Pads():
        if pad.GetNumber() == number:
            p = pad.GetPosition()
            return frame.inv(pcbnew.ToMM(p.x) - 150.0,
                             pcbnew.ToMM(p.y) - 100.0)
    return None


def face_drain_inwards(pl, frame, ref):
    """Turn a MOSFET so its drain tab looks towards the middle of the board.

    A footprint does not land the same way round in every channel: positions
    rotate in the mathematical sense, KiCad's orientation turns the other way,
    and the two agree only for half of the frames.  Left alone, channels 2 and
    3 came out with the transistors end for end -- drain towards the board
    edge, gate pad buried under the array -- which is a power-stage defect,
    not just a routing nuisance.  So check where the pads actually are.
    """
    fp = pl.fps[ref]
    drain = local_pad(pl, frame, ref, '5')
    source = local_pad(pl, frame, ref, '1')
    if drain is None or source is None or drain[1] > source[1]:
        return False
    fp.SetOrientationDegrees((fp.GetOrientationDegrees() + 180.0) % 360)
    x, y, ang, bottom = pl.placed[ref]
    pl.placed[ref] = (x, y, (ang + 180.0) % 360, bottom)
    return True


def match_channel_one(pl, frames, refs, num, tol=0.02):
    """Turn a part so it lands where channel 1's equivalent landed.

    Channel 1 is the reference; every other channel's copy of the same part
    must have the named pad at the same place in its own frame, or the four
    power stages are not really identical.  They were not: the MOSFETs and
    the drivers matched after face_drain_inwards(), but the ESC micros came
    out turned by 180 degrees in channels 2 and 3, and every two-pad passive
    was mirrored -- which is what a fixed orientation gives you when the
    position rotates one way and KiCad's orientation the other.

    Returns the number of parts it had to turn.
    """
    ref1 = refs[1]
    want = local_pad(pl, frames[1], ref1, num)
    if want is None:
        return 0
    turned = 0
    for ch in (2, 3, 4):
        ref = refs[ch]
        got = local_pad(pl, frames[ch], ref, num)
        if got is None:
            continue
        if math.hypot(want[0] - got[0], want[1] - got[1]) <= tol:
            continue
        fp = pl.fps[ref]
        fp.SetOrientationDegrees((fp.GetOrientationDegrees() + 180.0) % 360)
        x, y, ang, bottom = pl.placed[ref]
        pl.placed[ref] = (x, y, (ang + 180.0) % 360, bottom)
        turned += 1
    return turned


def gate_pad_x(pl, frame, fet_ref, gate_net):
    """Where the MOSFET's gate pad really is, along the channel's local x."""
    for pad in pl.fps[fet_ref].Pads():
        if pad.GetNetname() != gate_net:
            continue
        p = pad.GetPosition()
        lx, _ = frame.inv(pcbnew.ToMM(p.x) - 150.0, pcbnew.ToMM(p.y) - 100.0)
        return lx
    raise SystemExit('%s has no pad on %s' % (fet_ref, gate_net))


def ring(cx, cy, r):
    if r <= 0:
        return [(cx, cy)]
    out = []
    n = max(8, int(2 * math.pi * r / (GRID * 4)))
    for i in range(n):
        a = 2 * math.pi * i / n
        out.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    return out


def board_poly(inset=0.35):
    r = LO.CORNER_R
    h = HALF - inset
    pts = []
    for cx, cy, a0, a1 in ((h - r, -h + r, 270, 360), (h - r, h - r, 0, 90),
                           (-h + r, h - r, 90, 180),
                           (-h + r, -h + r, 180, 270)):
        for k in range(7):
            a = math.radians(a0 + (a1 - a0) * k / 6.0)
            pts.append((cx + r * math.cos(a), cy + r * math.sin(a)))
    return pts


# No copper pours are laid down here.  Exporting the ground and battery
# planes to the router looked like the obvious way to save it work, but
# freerouting then treats those layers as unusable and gives up on most of
# the board: with the planes present it routed 75 nets out of 279 in
# seventeen minutes, without them it routes every net in about seven.  The
# pours are added afterwards, by finish_pcb.py.


# --------------------------------------------------------------------- main --

def main():
    bd = Board(LIBS)
    stackup_and_rules(bd)
    outline(bd)
    pl = Placer(bd)

    # mounting holes and their keep-out
    for i, (sx, sy) in enumerate(((1, 1), (1, -1), (-1, 1), (-1, -1))):
        ref = 'H%d' % (i + 1)
        pl.put(ref, sx * LO.MOUNT_XY, sy * LO.MOUNT_XY)
        pl.grid.block_circle(sx * LO.MOUNT_XY, sy * LO.MOUNT_XY,
                             LO.MOUNT_D / 2.0 + 0.5)

    # ---- top side: four ESC power blocks
    for ch, (ox, oy, ang) in sorted(LO.CHANNEL_FRAME.items()):
        f = Frame(ox, oy, ang)
        for ph, lx in sorted(LO.FET_X.items()):
            for side, ly in (('L', LO.FET_Y_LOW), ('H', LO.FET_Y_HIGH)):
                x, y = f.xy(lx, ly)
                pl.put('Q%s%s%d' % (ph, side, ch), x, y,
                       f.ang(LO.FET_ANGLE))
        for ph in sorted(LO.FET_X):
            for side in ('L', 'H'):
                face_drain_inwards(pl, f, 'Q%s%s%d' % (ph, side, ch))

        dx, dy, da = LO.DRIVER_LOCAL
        x, y = f.xy(dx, dy)
        drv = 'U%d1' % (ch + 1)
        pl.put(drv, x, y, f.ang(da))
        # and the driver the same way: its low-side gate outputs belong on the
        # side facing the MOSFETs, not on the far side of the package
        gla = local_pad(pl, f, drv, '11')
        centre = local_pad(pl, f, drv, '25')
        if gla and centre and gla[1] > centre[1]:
            fp = pl.fps[drv]
            fp.SetOrientationDegrees((fp.GetOrientationDegrees() + 180.0) % 360)
            px, py, pa, pb = pl.placed[drv]
            pl.placed[drv] = (px, py, (pa + 180.0) % 360, pb)

        # the gate network, in the three free bands of the channel.  Each gate
        # resistor lines up with the gate pad as it actually landed, read back
        # from the placed MOSFET: assuming a fixed offset put the resistors on
        # the wrong side of the transistor in channels 2 and 3, and their gate
        # nets came out 4.23 mm long against 0.95 mm in the other two.
        for ph, lx in sorted(LO.FET_X.items()):
            for side, band in (('L', LO.GATE_R_LOW_Y),
                               ('H', LO.GATE_R_HIGH_Y)):
                gx = gate_pad_x(pl, f, 'Q%s%s%d' % (ph, side, ch),
                                'G%s%s_%d' % (ph, side, ch))
                x, y = f.xy(gx, band)
                pl.put('RG%s%s%d' % (ph, side, ch), x, y,
                       f.ang(90.0 if side == 'L' else 0.0))
            x, y = f.xy(lx, LO.BOOTSTRAP_Y)
            pl.put('CBS%s%d' % (ph, ch), x, y, f.ang(0.0))
        vx, vy, va = LO.VCC_CAP_LOCAL
        x, y = f.xy(vx, vy)
        pl.put('CVCC%d' % ch, x, y, f.ang(va))

        # the channel's micro and its SWD pads, on the other face
        x, y = f.xy(0.0, LO.MICRO_LOCAL_Y)
        pl.put('U%d0' % (ch + 1), x, y, f.ang(0.0), bottom=True)
        for k, (sx, sy) in enumerate(LO.ESC_SWD_LOCAL):
            x, y = f.xy(sx, sy)
            pl.put('TP%d' % (5 + 2 * ch + k), x, y, f.ang(90.0), bottom=True)

        # motor pads, rotated into this channel's corner.  The rotation is
        # the channel frame's own angle relative to channel 1, otherwise
        # channels 3 and 4 land in each other's corners.
        rotdeg = ang - LO.CHANNEL_FRAME[1][2]
        for k, (px, py, pa) in enumerate(LO.MOTOR_PADS):
            ca, sa = (math.cos(math.radians(rotdeg)),
                      math.sin(math.radians(rotdeg)))
            X = px * ca - py * sa
            Y = px * sa + py * ca
            pl.put('J%d' % (10 + 3 * (ch - 1) + k), round(X, 3), round(Y, 3),
                   (pa + rotdeg) % 360)

    # Make the four channels genuinely identical, pad for pad, in their own
    # frames.  Two thirds of the nets on this board live inside one channel;
    # if the channels match, a routing done once can be stamped four times.
    frames = dict((ch, Frame(ox, oy, ang))
                  for ch, (ox, oy, ang) in LO.CHANNEL_FRAME.items())
    families = [(dict((c, 'U%d0' % (c + 1)) for c in (1, 2, 3, 4)), '20'),
                (dict((c, 'U%d1' % (c + 1)) for c in (1, 2, 3, 4)), '19'),
                (dict((c, 'CVCC%d' % c) for c in (1, 2, 3, 4)), '1')]
    for ph in sorted(LO.FET_X):
        for side in ('L', 'H'):
            families.append((dict((c, 'Q%s%s%d' % (ph, side, c))
                                  for c in (1, 2, 3, 4)), '4'))
            families.append((dict((c, 'RG%s%s%d' % (ph, side, c))
                                  for c in (1, 2, 3, 4)), '1'))
        families.append((dict((c, 'CBS%s%d' % (ph, c))
                              for c in (1, 2, 3, 4)), '1'))
    turned = sum(match_channel_one(pl, frames, refs, num)
                 for refs, num in families)
    if turned:
        print('  turned %d parts to match channel 1' % turned)

    for ref, (x, y, a) in sorted(LO.TOP.items()):
        pl.put(ref, x, y, a)

    # ---- bottom side
    for ref, (x, y, a) in sorted(LO.BOTTOM.items()):
        pl.put(ref, x, y, a, bottom=True)
    for ref, x, y, a in LO.PADS:
        pl.put(ref, x, y, a, bottom=True)
    for ref, (x, y, a) in sorted(LO.TEST_PADS.items()):
        pl.put(ref, x, y, a, bottom=True)

    # ---- everything else, placed next to what it connects to.
    # Order matters: take the part with the most already-placed neighbours
    # first, so decoupling lands on the pin it decouples.
    nets = design.nets()
    rest = set(r for r in design.PARTS if r not in pl.placed)

    def neighbours(ref):
        n = 0
        for pin, net in design.PARTS[ref].pins.items():
            if net.startswith(('NC', 'ND')) or len(nets[net]) > 8:
                continue
            n += sum(1 for o, _ in nets[net] if o in pl.placed)
        return n

    def footprint_area(ref):
        w, h, _, _ = pl.size_of(design.PARTS[ref], 0.0)
        return round(w * h, 2)

    def order_key(ref):
        """Big parts first, then the best-connected ones.

        Left purely to neighbour count, a lone SOT-23 is placed last and by
        then the free copper is all 0.6 mm alleys between 0201s: 240 mm2
        free on the top side and not one 3.5 x 3 mm hole in it.
        """
        return (footprint_area(ref), neighbours(ref))

    # anything a hint points at has to exist before the hint can be used
    for ref in sorted(r for r in rest if r in set(LO.NEAR.values())):
        rest.discard(ref)
        pl.auto(ref, side=FORCED_SIDE.get(side_key(ref)))
    # parts with an explicit "sit next to X" hint go next, otherwise the
    # ring around each chip is already taken by the time they are placed
    for ref in sorted(rest):
        if ref in LO.NEAR and LO.NEAR[ref] in pl.placed:
            rest.discard(ref)
            pl.auto(ref, side=FORCED_SIDE.get(side_key(ref)))
    while rest:
        ref = max(sorted(rest), key=order_key)
        rest.discard(ref)
        pl.auto(ref, side=FORCED_SIDE.get(side_key(ref)))

    bd.save(OUT)
    print('placed %d footprints -> %s' % (len(pl.placed), OUT))
    # save first, then complain: a board that can be looked at is easier to
    # fix than an exception
    errs = pl.verify()
    for e in errs:
        print('  PLACEMENT', e)
    if errs:
        raise SystemExit('%d placement problems' % len(errs))
    return pl


if __name__ == '__main__':
    main()
