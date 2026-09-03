"""Thin helpers over the pcbnew API, in board-local millimetres.

Board-local coordinates have their origin at the centre of the board,
X to the right and Y downwards (the same sense as the KiCad canvas).
"""

import math
import os
import sys

import pcbnew

ORIGIN = (150.0, 100.0)          # where the board centre sits on the sheet

LAYER = {
    'F': pcbnew.F_Cu,
    'In1': pcbnew.In1_Cu,
    'In2': pcbnew.In2_Cu,
    'In3': pcbnew.In3_Cu,
    'In4': pcbnew.In4_Cu,
    'B': pcbnew.B_Cu,
}
CU_ORDER = ['F', 'In1', 'In2', 'In3', 'In4', 'B']


def mm(v):
    return pcbnew.FromMM(float(v))


def vec(x, y):
    return pcbnew.VECTOR2I(mm(ORIGIN[0] + x), mm(ORIGIN[1] + y))


def rot(x, y, deg):
    a = math.radians(deg)
    return (x * math.cos(a) - y * math.sin(a),
            x * math.sin(a) + y * math.cos(a))


class Frame(object):
    """A placement frame: local coordinates -> board coordinates."""

    def __init__(self, ox=0.0, oy=0.0, angle=0.0, flip=False):
        self.ox, self.oy, self.angle, self.flip = ox, oy, angle, flip

    def xy(self, x, y):
        if self.flip:
            x = -x
        rx, ry = rot(x, y, self.angle)
        return (self.ox + rx, self.oy + ry)

    def ang(self, a):
        return (self.angle + (-a if self.flip else a)) % 360

    def inv(self, X, Y):
        """Board coordinates back to local ones.

        Needed because a footprint's pads do not land where the local layout
        says they will: positions here rotate in the mathematical sense while
        KiCad's SetOrientationDegrees turns the other way, so a frame at 0 or
        180 degrees comes out mirrored end to end against one at 90 or 270.
        Rather than reason about that, read where a pad actually is.
        """
        a = math.radians(self.angle)
        dx, dy = X - self.ox, Y - self.oy
        x = dx * math.cos(a) + dy * math.sin(a)
        y = -dx * math.sin(a) + dy * math.cos(a)
        return (-x if self.flip else x, y)


class Board(object):
    def __init__(self, libdirs):
        self.b = pcbnew.BOARD()
        self.libdirs = libdirs
        self.nets = {}
        self._fp_cache = {}
        self.b.SetCopperLayerCount(6)
        for name in ('In1', 'In2', 'In3', 'In4'):
            pass

    # ---------------------------------------------------------------- nets --
    def net(self, name):
        if name not in self.nets:
            n = pcbnew.NETINFO_ITEM(self.b, name)
            self.b.Add(n)
            self.nets[name] = n
        return self.nets[name]

    def netcode(self, name):
        return self.net(name).GetNetCode()

    # ----------------------------------------------------------- footprints --
    def load_fp(self, libid):
        if libid in self._fp_cache:
            return self._fp_cache[libid]
        lib, name = libid.split(':', 1)
        for d in self.libdirs:
            path = os.path.join(d, lib + '.pretty')
            if os.path.isdir(path):
                fp = pcbnew.FootprintLoad(path, name)
                if fp:
                    self._fp_cache[libid] = fp
                    return fp
        raise KeyError('footprint not found: %s' % libid)

    def place(self, ref, part, x, y, angle=0.0, bottom=False):
        fp = pcbnew.FOOTPRINT(self.load_fp(part.fp))
        fp.SetReference(ref)
        fp.SetValue(part.value)
        fp.SetFPIDAsString(part.fp)
        self.b.Add(fp)
        fp.SetPosition(vec(x, y))
        if bottom:
            fp.Flip(vec(x, y), False)
        fp.SetOrientationDegrees(angle)
        fp.Reference().SetVisible(False)
        fp.Value().SetVisible(False)
        if part.lcsc:
            fp.SetProperty('LCSC', part.lcsc)
        for pad in fp.Pads():
            num = pad.GetNumber()
            net = part.pins.get(num)
            if net:
                pad.SetNet(self.net(net))
        return fp

    # ---------------------------------------------------------------- copper --
    def track(self, net, layer, x0, y0, x1, y1, width=0.25):
        if abs(x0 - x1) < 1e-9 and abs(y0 - y1) < 1e-9:
            return None
        t = pcbnew.PCB_TRACK(self.b)
        t.SetStart(vec(x0, y0))
        t.SetEnd(vec(x1, y1))
        t.SetWidth(mm(width))
        t.SetLayer(LAYER[layer])
        t.SetNet(self.net(net))
        self.b.Add(t)
        return t

    def path(self, net, layer, pts, width=0.25):
        for a, b in zip(pts, pts[1:]):
            self.track(net, layer, a[0], a[1], b[0], b[1], width)

    def via(self, net, x, y, drill=0.3, dia=0.6, top='F', bot='B'):
        v = pcbnew.PCB_VIA(self.b)
        v.SetPosition(vec(x, y))
        v.SetDrill(mm(drill))
        v.SetWidth(mm(dia))
        v.SetLayerPair(LAYER[top], LAYER[bot])
        v.SetNet(self.net(net))
        self.b.Add(v)
        return v

    # ----------------------------------------------------------------- zones --
    def zone(self, net, layers, poly, clearance=0.25, min_width=0.2,
             thermal=False, priority=0):
        z = pcbnew.ZONE(self.b)
        ls = pcbnew.LSET()
        for l in layers:
            ls.addLayer(LAYER[l])
        z.SetLayerSet(ls)
        z.SetNet(self.net(net))
        z.SetLocalClearance(mm(clearance))
        z.SetMinThickness(mm(min_width))
        z.SetAssignedPriority(priority)
        z.SetPadConnection(pcbnew.ZONE_CONNECTION_THERMAL if thermal
                           else pcbnew.ZONE_CONNECTION_FULL)
        z.SetIsFilled(False)
        outline = z.Outline()
        outline.NewOutline()
        for (x, y) in poly:
            outline.Append(mm(ORIGIN[0] + x), mm(ORIGIN[1] + y))
        self.b.Add(z)
        return z

    def keepout(self, layers, poly):
        z = self.zone('GND', layers, poly)
        z.SetIsRuleArea(True)
        z.SetDoNotAllowCopperPour(True)
        z.SetDoNotAllowTracks(False)
        z.SetDoNotAllowVias(False)
        z.SetDoNotAllowPads(False)
        return z

    def fill_zones(self):
        filler = pcbnew.ZONE_FILLER(self.b)
        filler.Fill(self.b.Zones())

    # ------------------------------------------------------------- graphics --
    def seg(self, layer, x0, y0, x1, y1, width=0.15):
        s = pcbnew.PCB_SHAPE(self.b)
        s.SetShape(pcbnew.SHAPE_T_SEGMENT)
        s.SetStart(vec(x0, y0))
        s.SetEnd(vec(x1, y1))
        s.SetWidth(mm(width))
        s.SetLayer(layer)
        self.b.Add(s)
        return s

    def arc(self, layer, cx, cy, r, a0, a1, width=0.15):
        s = pcbnew.PCB_SHAPE(self.b)
        s.SetShape(pcbnew.SHAPE_T_ARC)
        sx, sy = cx + r * math.cos(math.radians(a0)), \
            cy + r * math.sin(math.radians(a0))
        mxa = (a0 + a1) / 2.0
        mx, my = cx + r * math.cos(math.radians(mxa)), \
            cy + r * math.sin(math.radians(mxa))
        ex, ey = cx + r * math.cos(math.radians(a1)), \
            cy + r * math.sin(math.radians(a1))
        s.SetArcGeometry(vec(sx, sy), vec(mx, my), vec(ex, ey))
        s.SetWidth(mm(width))
        s.SetLayer(layer)
        self.b.Add(s)
        return s

    def text(self, layer, s, x, y, size=0.8, thickness=0.12, angle=0,
             mirror=False, justify=None):
        t = pcbnew.PCB_TEXT(self.b)
        t.SetText(s)
        t.SetPosition(vec(x, y))
        t.SetLayer(layer)
        t.SetTextSize(pcbnew.VECTOR2I(mm(size), mm(size)))
        t.SetTextThickness(mm(thickness))
        t.SetTextAngleDegrees(angle)
        t.SetMirrored(mirror)
        if justify is not None:
            t.SetHorizJustify(justify)
        self.b.Add(t)
        return t

    def save(self, path):
        self.b.Save(path)


def unconnected(board):
    conn = board.GetConnectivity()
    conn.RecalculateRatsnest()
    return conn.GetUnconnectedCount()
