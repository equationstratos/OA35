#!/usr/bin/env python3
"""Generate the project-local footprint library lib/oa35.pretty.

Everything the design needs that KiCad 7 does not ship: the NSG2065Q land
pattern, the ICM-42688-P land pattern, the shielded 3 x 3 mm inductor, the
solder pads for motor / battery / signal wires, and the mounting holes.
"""

import os

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', 'lib', 'oa35.pretty')

HDR = '''(footprint "%(name)s" (version 20221018) (generator oa35)
  (layer "F.Cu")
  (attr %(attr)s)
  (fp_text reference "REF**" (at 0 %(refy).3f) (layer "F.SilkS")
    (effects (font (size 0.8 0.8) (thickness 0.12))))
  (fp_text value "%(name)s" (at 0 %(valy).3f) (layer "F.Fab") hide
    (effects (font (size 0.8 0.8) (thickness 0.12))))
'''


def rect(layer, x0, y0, x1, y1, w=0.12):
    return ('  (fp_rect (start %.3f %.3f) (end %.3f %.3f) (layer "%s") '
            '(width %.3f) (fill none))\n' % (x0, y0, x1, y1, layer, w))


def line(layer, x0, y0, x1, y1, w=0.12):
    return ('  (fp_line (start %.3f %.3f) (end %.3f %.3f) (layer "%s") '
            '(width %.3f))\n' % (x0, y0, x1, y1, layer, w))


def circle(layer, cx, cy, r, w=0.12):
    return ('  (fp_circle (center %.3f %.3f) (end %.3f %.3f) (layer "%s") '
            '(width %.3f) (fill none))\n' % (cx, cy, cx + r, cy, layer, w))


def smd(num, x, y, w, h, rot=0, layers='"F.Cu" "F.Paste" "F.Mask"',
        roundrect=True):
    shape = 'roundrect' if roundrect else 'rect'
    extra = ' (roundrect_rratio 0.25)' if roundrect else ''
    return ('  (pad "%s" smd %s (at %.4f %.4f %g) (size %.4f %.4f) '
            '(layers %s)%s)\n' % (num, shape, x, y, rot, w, h, layers, extra))


def npth(num, x, y, d):
    return ('  (pad "%s" np_thru_hole circle (at %.3f %.3f) (size %.3f %.3f) '
            '(drill %.3f) (layers *.Cu *.Mask))\n'
            % (num, x, y, d, d, d))


def write(name, body, attr='smd', refy=None, valy=None, extent=2.0):
    refy = refy if refy is not None else -(extent + 0.8)
    valy = valy if valy is not None else (extent + 0.8)
    txt = HDR % dict(name=name, attr=attr, refy=refy, valy=valy) + body + ')\n'
    with open(os.path.join(OUT, name + '.kicad_mod'), 'w') as fh:
        fh.write(txt)
    return name


# --------------------------------------------------------------------------
def nsg2065q():
    """QFN-24, 4 x 4 mm, 0.5 mm pitch, 2.8 x 2.8 mm exposed pad.

    KiCad pin order: 1-6 left top->bottom, 7-12 bottom left->right,
    13-18 right bottom->top, 19-24 top right->left.  No thermal vias: the
    flight controller sits directly underneath on this board, so the exposed
    pad reaches ground through the surrounding pour instead.
    """
    b = ''
    pl, pw = 0.775, 0.25         # pad length (outward), pad width
    c = 1.9875                   # pad centre distance from package centre
    off = [-1.25, -0.75, -0.25, 0.25, 0.75, 1.25]
    for i, o in enumerate(off):                        # 1..6 left
        b += smd(str(i + 1), -c, o, pl, pw)
    for i, o in enumerate(off):                        # 7..12 bottom
        b += smd(str(i + 7), o, c, pw, pl)
    for i, o in enumerate(reversed(off)):              # 13..18 right
        b += smd(str(i + 13), c, o, pl, pw)
    for i, o in enumerate(reversed(off)):              # 19..24 top
        b += smd(str(i + 19), o, -c, pw, pl)
    # exposed pad, split into 4 paste windows, with thermal vias
    b += smd('25', 0, 0, 2.8, 2.8, layers='"F.Cu" "F.Mask"')
    for sx in (-0.7, 0.7):
        for sy in (-0.7, 0.7):
            b += smd('25', sx, sy, 1.2, 1.2, layers='"F.Paste"')
    b += rect('F.CrtYd', -2.5, -2.5, 2.5, 2.5, 0.05)
    b += rect('F.Fab', -2.0, -2.0, 2.0, 2.0)
    b += circle('F.SilkS', -2.35, -2.35, 0.12, 0.2)
    return write('QFN-24-1EP_4x4mm_P0.5mm_EP2.8x2.8mm', b, extent=2.5)


def icm42688():
    """ICM-42688-P LGA-14, 2.5 x 3.0 mm, land pattern from a shipping board."""
    b = ''
    for i, y in enumerate((0.75, 0.25, -0.25, -0.75)):        # 1..4 left
        b += smd(str(i + 1), -1.165, y, 0.59, 0.35)
    for i, x in enumerate((-0.5, 0.0, 0.5)):                  # 5..7 bottom
        b += smd(str(i + 5), x, -0.915, 0.35, 0.59)
    for i, y in enumerate((-0.75, -0.25, 0.25, 0.75)):        # 8..11 right
        b += smd(str(i + 8), 1.165, y, 0.59, 0.35)
    for i, x in enumerate((0.5, 0.0, -0.5)):                  # 12..14 top
        b += smd(str(i + 12), x, 0.915, 0.35, 0.59)
    b += rect('F.CrtYd', -1.65, -1.75, 1.65, 1.75, 0.05)
    b += rect('F.Fab', -1.25, -1.5, 1.25, 1.5)
    b += circle('F.SilkS', -1.55, 1.1, 0.12, 0.2)
    return write('LGA-14_2.5x3mm_P0.5mm_ICM42688', b, extent=1.75)


def inductor():
    """Shielded 3.0 x 3.0 x 2.0 mm power inductor (XRTC303020 class)."""
    b = smd('1', -1.15, 0, 1.10, 2.60, roundrect=False)
    b += smd('2', 1.15, 0, 1.10, 2.60, roundrect=False)
    b += rect('F.CrtYd', -1.85, -1.75, 1.85, 1.75, 0.05)
    b += rect('F.Fab', -1.5, -1.5, 1.5, 1.5)
    b += line('F.SilkS', -1.6, -1.6, 1.6, -1.6)
    b += line('F.SilkS', -1.6, 1.6, 1.6, 1.6)
    return write('L_3.0x3.0mm', b, extent=1.8)


def wire_pad(name, w, h):
    """Bare solder pad for a wire: mask open, no paste, no silk over it."""
    b = smd('1', 0, 0, w, h, layers='"F.Cu" "F.Mask"', roundrect=False)
    b += rect('F.CrtYd', -w / 2 - 0.15, -h / 2 - 0.15,
              w / 2 + 0.15, h / 2 + 0.15, 0.05)
    return write(name, b, extent=max(w, h) / 2 + 0.2)


def mounting_hole():
    b = npth('', 0, 0, 3.0)
    b += circle('F.CrtYd', 0, 0, 1.75, 0.05)
    b += circle('F.SilkS', 0, 0, 1.75, 0.15)
    return write('MountingHole_3.0mm', b,
                 attr='exclude_from_pos_files exclude_from_bom', extent=1.9)


def main():
    if not os.path.isdir(OUT):
        os.makedirs(OUT)
    made = [nsg2065q(), icm42688(), inductor(), mounting_hole(),
            wire_pad('Pad_1.6x1.2mm', 1.6, 1.2),
            wire_pad('Pad_2.2x1.6mm', 2.2, 1.6),
            wire_pad('Pad_2.8x2.0mm', 2.8, 2.0),
            wire_pad('Pad_4.0x3.0mm', 4.0, 3.0)]
    print('wrote %d footprints to %s' % (len(made), os.path.normpath(OUT)))
    for m in made:
        print('  ', m)


if __name__ == '__main__':
    main()
