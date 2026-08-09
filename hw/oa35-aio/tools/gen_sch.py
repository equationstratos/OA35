#!/usr/bin/env python3
"""Generate the KiCad schematic from tools/design.py.

The schematic is drawn in net-label style: every symbol pin carries a short
stub ending in a global label with the net name.  That is unusual for a
hand-drawn schematic but it is unambiguous, it survives regeneration, and it
produces exactly the netlist the PCB is built from.

One hierarchical sheet per functional block, plus a root sheet.
"""

import hashlib
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import design                                                   # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, '..'))
PROJECT = 'oa35-aio'
VERSION = '20230121'

GRID = 1.27


def uid(*parts):
    """Deterministic UUID so regenerating the project produces no churn."""
    h = hashlib.sha1(('oa35:' + ':'.join(str(p) for p in parts))
                     .encode()).hexdigest()
    return '%s-%s-4%s-8%s-%s' % (h[0:8], h[8:12], h[13:16], h[17:20], h[20:32])


def snap(v):
    return round(round(v / GRID) * GRID, 4)


# ------------------------------------------------------------ symbol shapes --

def _pin(x, y, ang, name, number, length=2.54, etype='passive'):
    return ('        (pin %s line (at %.4f %.4f %d) (length %.2f)\n'
            '          (name "%s" (effects (font (size 1.27 1.27))))\n'
            '          (number "%s" (effects (font (size 1.27 1.27))))\n'
            '        )\n' % (etype, x, y, ang, length, name, number))


def _rect(x0, y0, x1, y1, fill='none'):
    return ('        (rectangle (start %.4f %.4f) (end %.4f %.4f)\n'
            '          (stroke (width 0.254) (type default))\n'
            '          (fill (type %s))\n        )\n' % (x0, y0, x1, y1, fill))


def _poly(pts, width=0.254, fill='none'):
    s = '        (polyline (pts %s)\n' % ' '.join(
        '(xy %.4f %.4f)' % p for p in pts)
    s += ('          (stroke (width %.3f) (type default))\n'
          '          (fill (type %s))\n        )\n' % (width, fill))
    return s


class Sym(object):
    """A symbol definition: graphics plus pin geometry."""

    def __init__(self, name, body, pins, w, h):
        self.name = name        # library symbol name
        self.body = body        # s-expression body of the drawing unit
        self.pins = pins        # {number: (x, y, side)}  side in 'L','R'
        self.w, self.h = w, h   # bounding box of the graphics


def sym_two_pin(name, kind):
    """Horizontal two-pin passive, pin 1 left, pin 2 right."""
    g = ''
    if kind == 'R':
        g += _rect(-2.032, -0.762, 2.032, 0.762)
    elif kind == 'C':
        g += _poly([(-0.508, -1.27), (-0.508, 1.27)], 0.4)
        g += _poly([(0.508, -1.27), (0.508, 1.27)], 0.4)
        g += _poly([(-2.54, 0), (-0.508, 0)], 0.254)
        g += _poly([(0.508, 0), (2.54, 0)], 0.254)
    elif kind == 'L':
        g += _rect(-2.54, -0.762, 2.54, 0.762, 'outline')
    elif kind in ('D', 'LED', 'TVS'):
        g += _poly([(-1.27, -1.27), (-1.27, 1.27), (1.27, 0), (-1.27, -1.27)],
                   0.254, 'outline')
        g += _poly([(1.27, -1.27), (1.27, 1.27)], 0.4)
        g += _poly([(-2.54, 0), (-1.27, 0)], 0.254)
        g += _poly([(1.27, 0), (2.54, 0)], 0.254)
        if kind == 'LED':
            g += _poly([(1.0, 1.6), (2.2, 2.6)], 0.15)
            g += _poly([(1.8, 1.2), (3.0, 2.2)], 0.15)
    elif kind == 'PAD':
        g += _rect(-1.27, -1.27, 1.27, 1.27, 'outline')
    pins = {}
    if kind == 'PAD':
        pins['1'] = (-5.08, 0.0, 'L')
        return Sym(name, g + _pin(-5.08, 0, 0, '~', '1'), pins, 2.54, 2.54)
    body = g + _pin(-5.08, 0, 0, '~', '1') + _pin(5.08, 0, 180, '~', '2')
    pins['1'] = (-5.08, 0.0, 'L')
    pins['2'] = (5.08, 0.0, 'R')
    return Sym(name, body, pins, 5.08, 2.54)


def sym_box(name, pinlist, width=None):
    """Generic IC box.  pinlist is [(number, label)] in datasheet order."""
    n = len(pinlist)
    nl = (n + 1) // 2
    left, right = pinlist[:nl], pinlist[nl:]
    rows = max(len(left), len(right))
    label_w = max([len(p[1]) for p in pinlist] + [4])
    w = width or max(12.7, snap(label_w * 1.6 + 6))
    h = (rows + 1) * 2.54
    body = _rect(-w / 2, -h / 2, w / 2, h / 2, 'background')
    pins = {}
    y0 = h / 2 - 2.54
    for i, (num, lbl) in enumerate(left):
        y = y0 - i * 2.54
        body += _pin(-w / 2 - 2.54, y, 0, lbl, num)
        pins[num] = (-w / 2 - 2.54, y, 'L')
    for i, (num, lbl) in enumerate(right):
        y = y0 - i * 2.54
        body += _pin(w / 2 + 2.54, y, 180, lbl, num)
        pins[num] = (w / 2 + 2.54, y, 'R')
    return Sym(name, body, pins, w + 5.08, h)


PIN_LABELS = {
    'STM32F722': {
        1: 'VBAT', 2: 'PC13', 3: 'PC14', 4: 'PC15', 5: 'PH0/OSC_IN',
        6: 'PH1/OSC_OUT', 7: 'NRST', 8: 'PC0', 9: 'PC1', 10: 'PC2',
        11: 'PC3', 12: 'VSSA', 13: 'VDDA', 14: 'PA0', 15: 'PA1', 16: 'PA2',
        17: 'PA3', 18: 'VSS', 19: 'VDD', 20: 'PA4', 21: 'PA5', 22: 'PA6',
        23: 'PA7', 24: 'PC4', 25: 'PC5', 26: 'PB0', 27: 'PB1', 28: 'PB2',
        29: 'PB10', 30: 'VCAP_1', 31: 'VSS', 32: 'VDD', 33: 'PB12',
        34: 'PB13', 35: 'PB14', 36: 'PB15', 37: 'PC6', 38: 'PC7', 39: 'PC8',
        40: 'PC9', 41: 'PA8', 42: 'PA9', 43: 'PA10', 44: 'PA11', 45: 'PA12',
        46: 'PA13/SWDIO', 47: 'VSS', 48: 'VDD', 49: 'PA14/SWCLK', 50: 'PA15',
        51: 'PC10', 52: 'PC11', 53: 'PC12', 54: 'PD2', 55: 'PB3', 56: 'PB4',
        57: 'PB5', 58: 'PB6', 59: 'PB7', 60: 'BOOT0', 61: 'PB8', 62: 'PB9',
        63: 'VSS', 64: 'VDD',
    },
    'AT32F421': {
        1: 'BOOT0', 2: 'PF0', 3: 'PF1', 4: 'NRST', 5: 'VDDA', 6: 'PA0',
        7: 'PA1', 8: 'PA2', 9: 'PA3', 10: 'PA4', 11: 'PA5', 12: 'PA6',
        13: 'PA7', 14: 'PB0', 15: 'PB1', 16: 'VSS', 17: 'VDD', 18: 'PA8',
        19: 'PA9', 20: 'PA10', 21: 'PA13', 22: 'PA14', 23: 'PA15', 24: 'PB3',
        25: 'PB4', 26: 'PB5', 27: 'PB6', 28: 'PB7', 29: 'EP/VSS',
    },
    'NSG2065': {
        1: 'LIN1', 2: 'LIN2', 3: 'LIN3', 4: 'VCC', 5: 'NC', 6: 'COM',
        7: 'NC', 8: 'NC', 9: 'LO3', 10: 'LO2', 11: 'LO1', 12: 'VS3',
        13: 'HO3', 14: 'VB3', 15: 'VS2', 16: 'HO2', 17: 'VB2', 18: 'VS1',
        19: 'HO1', 20: 'VB1', 21: 'NC', 22: 'HIN1', 23: 'HIN2', 24: 'HIN3',
        25: 'EP/COM',
    },
    'ICM42688': {
        1: 'SDO', 2: 'RESV', 3: 'RESV', 4: 'INT1', 5: 'VDDIO', 6: 'GND',
        7: 'RESV', 8: 'VDD', 9: 'INT2/CLKIN', 10: 'RESV', 11: 'RESV',
        12: 'nCS', 13: 'SCLK', 14: 'SDI',
    },
    'BMP280': {1: 'GND', 2: 'CSB', 3: 'SDI', 4: 'SCK', 5: 'SDO',
               6: 'VDDIO', 7: 'GND', 8: 'VDD'},
    'W25Q': {1: 'nCS', 2: 'DO', 3: 'nWP', 4: 'GND', 5: 'DI', 6: 'CLK',
             7: 'nHOLD', 8: 'VCC'},
    'LMR51430': {1: 'GND', 2: 'SW', 3: 'VIN', 4: 'FB', 5: 'EN', 6: 'BOOT'},
    'LDO6': {1: 'OUT', 2: 'OUT', 3: 'GND', 4: 'IN', 5: 'EN', 6: 'IN',
             7: 'EP/GND'},
    'INA186': {1: 'GND', 2: 'REF', 3: 'VS', 4: 'IN-', 5: 'IN+', 6: 'OUT'},
    'USBLC6': {1: 'IO1', 2: 'GND', 3: 'IO2', 4: 'IO2', 5: 'VBUS', 6: 'IO1'},
    'NMOS': {1: 'G', 2: 'S', 3: 'D'},
    'NMOS3': {1: 'S', 2: 'G', 3: 'D'},
    'XTAL': {1: 'X1', 2: 'GND', 3: 'X2', 4: 'GND'},
    'CONN6': {1: '1', 2: '2', 3: '3', 4: '4', 5: '5', 6: '6',
              'MP1': 'SHIELD', 'MP2': 'SHIELD'},
}

TWO_PIN = {'R': 'R', 'C': 'C', 'L': 'L', 'D': 'D', 'LED': 'LED', 'TVS': 'TVS'}


def symbol_for(part):
    """Build (and cache) the library symbol for a part."""
    kind = part.sym
    if kind in TWO_PIN:
        return sym_two_pin('oa35:' + kind, TWO_PIN[kind])
    if kind == 'PAD':
        return sym_two_pin('oa35:PAD', 'PAD')
    if kind == 'HOLE':
        return Sym('oa35:HOLE', _rect(-1.27, -1.27, 1.27, 1.27, 'outline'),
                   {}, 2.54, 2.54)
    labels = PIN_LABELS.get(kind, {})
    numbers = sorted(part.pins, key=lambda s: (len(s), s))
    pinlist = [(nu, str(labels.get(int(nu), nu)) if nu.isdigit()
                else str(labels.get(nu, nu))) for nu in numbers]
    return sym_box('oa35:' + kind, pinlist)


# ------------------------------------------------------------------ sheets --

BLOCKS = [
    ('POWER', 'Power input, current sense, 9.6 V gate rail, 5 V BEC, LDOs'),
    ('MCU', 'STM32F722RET6 flight controller'),
    ('SENSORS', 'IMU, barometer, blackbox flash'),
    ('USB', 'USB-C and ESD protection'),
    ('IO', 'Pads, connectors, mounting'),
    ('ESC1', 'ESC channel 1'),
    ('ESC2', 'ESC channel 2'),
    ('ESC3', 'ESC channel 3'),
    ('ESC4', 'ESC channel 4'),
]


def sheet_file(block):
    return block.lower() + '.kicad_sch'


def is_nc(net):
    return net.startswith('NC') or net.startswith('ND')


def emit_sheet(block, parts, sheet_uuid, root_uuid):
    syms = {}
    for p in parts:
        s = symbol_for(p)
        syms.setdefault(s.name, s)

    # ---- pack symbols into a grid
    placed = []
    label_pad = 30.0
    cell_w = max(s.w for s in (symbol_for(p) for p in parts)) + label_pad
    cell_w = snap(cell_w)
    cell_h = snap(max(s.h for s in (symbol_for(p) for p in parts)) + 12.7)
    cols = max(1, int(round((len(parts) ** 0.5) * 1.4)))
    cols = min(cols, 10)
    rows = (len(parts) + cols - 1) // cols
    page_w = snap(cols * cell_w + 40)
    page_h = snap(rows * cell_h + 50)

    for i, p in enumerate(parts):
        cx = 25 + (i % cols) * cell_w + cell_w / 2
        cy = 30 + (i // cols) * cell_h + cell_h / 2
        placed.append((p, snap(cx), snap(cy)))

    out = ['(kicad_sch (version %s) (generator oa35)' % VERSION]
    out.append('  (uuid "%s")' % sheet_uuid)
    out.append('  (paper "User" %.2f %.2f)' % (page_w, page_h))
    out.append('  (title_block (title "OA35-AIO - %s") (rev "A")'
               ' (company "OA35"))' % block)
    out.append('  (lib_symbols')
    for name, s in sorted(syms.items()):
        out.append('    (symbol "%s" (pin_names (offset 0.508)) (in_bom yes)'
                   ' (on_board yes)' % name)
        out.append('      (property "Reference" "U" (at 0 0 0) (effects'
                   ' (font (size 1.27 1.27))))')
        out.append('      (property "Value" "%s" (at 0 0 0) (effects'
                   ' (font (size 1.27 1.27))))' % name.split(':')[-1])
        out.append('      (property "Footprint" "" (at 0 0 0) (effects'
                   ' (font (size 1.27 1.27)) hide))')
        out.append('      (property "Datasheet" "" (at 0 0 0) (effects'
                   ' (font (size 1.27 1.27)) hide))')
        out.append('      (symbol "%s_0_1"' % name.split(':')[-1])
        out.append(s.body.rstrip())
        out.append('      )')
        out.append('    )')
    out.append('  )')

    for p, cx, cy in placed:
        s = symbol_for(p)
        out.append('  (symbol (lib_id "%s") (at %.4f %.4f 0) (unit 1)'
                   % (s.name, cx, cy))
        out.append('    (in_bom yes) (on_board yes) (dnp %s)'
                   % ('yes' if p.dnp else 'no'))
        out.append('    (uuid "%s")' % uid('sym', p.ref))
        out.append('    (property "Reference" "%s" (at %.4f %.4f 0)'
                   ' (effects (font (size 1.27 1.27)) (justify left)))'
                   % (p.ref, cx - s.w / 2, cy - s.h / 2 - 2.0))
        out.append('    (property "Value" "%s" (at %.4f %.4f 0)'
                   ' (effects (font (size 1.27 1.27)) (justify left)))'
                   % (p.value, cx - s.w / 2, cy + s.h / 2 + 2.0))
        out.append('    (property "Footprint" "%s" (at %.4f %.4f 0)'
                   ' (effects (font (size 1.27 1.27)) hide))'
                   % (p.fp, cx, cy))
        out.append('    (property "Datasheet" "" (at %.4f %.4f 0)'
                   ' (effects (font (size 1.27 1.27)) hide))' % (cx, cy))
        out.append('    (property "LCSC" "%s" (at %.4f %.4f 0)'
                   ' (effects (font (size 1.27 1.27)) hide))'
                   % (p.lcsc, cx, cy))
        if p.desc:
            out.append('    (property "Description" "%s" (at %.4f %.4f 0)'
                       ' (effects (font (size 1.27 1.27)) hide))'
                       % (p.desc, cx, cy))
        for num in sorted(s.pins):
            out.append('    (pin "%s" (uuid "%s"))'
                       % (num, uid('pin', p.ref, num)))
        out.append('    (instances (project "%s" (path "/%s/%s"'
                   ' (reference "%s") (unit 1))))'
                   % (PROJECT, root_uuid, sheet_uuid, p.ref))
        out.append('  )')

        # stubs and labels
        for num, (px, py, side) in sorted(s.pins.items()):
            net = p.pins.get(num)
            if net is None:
                continue
            ax, ay = cx + px, cy - py
            d = -3.81 if side == 'L' else 3.81
            bx, by = ax + d, ay
            out.append('  (wire (pts (xy %.4f %.4f) (xy %.4f %.4f))'
                       ' (stroke (width 0) (type default))'
                       ' (uuid "%s"))'
                       % (ax, ay, bx, by, uid('w', p.ref, num)))
            if is_nc(net):
                out.append('  (no_connect (at %.4f %.4f) (uuid "%s"))'
                           % (bx, by, uid('nc', p.ref, num)))
            else:
                ang = 180 if side == 'L' else 0
                just = 'right' if side == 'L' else 'left'
                out.append('  (global_label "%s" (shape passive) (at %.4f'
                           ' %.4f %d) (effects (font (size 1.27 1.27))'
                           ' (justify %s)) (uuid "%s"))'
                           % (net, bx, by, ang, just,
                              uid('gl', p.ref, num)))

    out.append('  (sheet_instances (path "/" (page "1")))')
    out.append(')')
    return '\n'.join(out) + '\n'


def emit_root(root_uuid, sheet_uuids):
    per_col = 5
    out = ['(kicad_sch (version %s) (generator oa35)' % VERSION]
    out.append('  (uuid "%s")' % root_uuid)
    out.append('  (paper "A3")')
    out.append('  (title_block (title "OA35-AIO") (rev "A")'
               ' (company "OA35 open hardware"))')
    out.append('  (lib_symbols)')
    for i, (block, descr) in enumerate(BLOCKS):
        x = 25.4 + (i // per_col) * 165.0
        y = 30.0 + (i % per_col) * 45.0
        out.append('  (sheet (at %.2f %.2f) (size 120.0 25.0)' % (x, y))
        out.append('    (stroke (width 0.1524) (type solid))')
        out.append('    (fill (color 0 0 0 0.0000))')
        out.append('    (uuid "%s")' % sheet_uuids[block])
        out.append('    (property "Sheetname" "%s" (id 0) (at %.2f %.2f 0)'
                   ' (effects (font (size 1.6 1.6)) (justify left bottom)))'
                   % (block, x, y - 0.7))
        out.append('    (property "Sheetfile" "%s" (id 1) (at %.2f %.2f 0)'
                   ' (effects (font (size 1.27 1.27)) (justify left top)))'
                   % (sheet_file(block), x, y + 25.7))
        out.append('    (instances (project "%s" (path "/%s" (page "%d"))))'
                   % (PROJECT, root_uuid, i + 2))
        out.append('  )')
        out.append('  (text "%s" (at %.2f %.2f 0) (effects (font'
                   ' (size 1.27 1.27)) (justify left)))'
                   % (descr.replace('"', "'"), x + 2, y + 12))
    out.append('  (sheet_instances')
    out.append('    (path "/" (page "1"))')
    for i, (block, _) in enumerate(BLOCKS):
        out.append('    (path "/%s" (page "%d"))' % (sheet_uuids[block], i + 2))
    out.append('  )')
    out.append(')')
    return '\n'.join(out) + '\n'


def main():
    root_uuid = uid('root')
    sheet_uuids = dict((b, uid('sheet', b)) for b, _ in BLOCKS)

    by_block = {}
    for p in design.PARTS.values():
        by_block.setdefault(p.block, []).append(p)

    known = set(b for b, _ in BLOCKS)
    missing = set(by_block) - known
    if missing:
        raise SystemExit('blocks with no sheet: %s' % sorted(missing))

    with open(os.path.join(ROOT, PROJECT + '.kicad_sch'), 'w') as fh:
        fh.write(emit_root(root_uuid, sheet_uuids))
    total = 0
    for block, _ in BLOCKS:
        parts = by_block.get(block, [])
        total += len(parts)
        with open(os.path.join(ROOT, sheet_file(block)), 'w') as fh:
            fh.write(emit_sheet(block, parts, sheet_uuids[block], root_uuid))
        print('%-8s %3d symbols -> %s' % (block, len(parts),
                                          sheet_file(block)))
    print('%d symbols total' % total)


if __name__ == '__main__':
    main()
