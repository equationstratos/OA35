#!/usr/bin/env python3
"""Produce the JLCPCB order set: gerbers, drill, BOM, CPL, and a zip.

Everything lands in production/.  The zip is what you upload to JLCPCB's
"Add gerber file" box; the BOM and CPL csv files are uploaded separately in
the assembly step.
"""

import csv
import os
import shutil
import subprocess
import sys
import zipfile
from collections import OrderedDict

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import design                                                    # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, '..'))
PCB = os.path.join(ROOT, 'oa35-aio.kicad_pcb')
OUT = os.path.join(ROOT, 'production')
GERBER = os.path.join(OUT, 'gerber')

LAYERS = ('F.Cu,In1.Cu,In2.Cu,In3.Cu,In4.Cu,B.Cu,'
          'F.Paste,B.Paste,F.SilkS,B.SilkS,F.Mask,B.Mask,Edge.Cuts')

# JLCPCB reads some packages with a different zero-rotation than KiCad; the
# correction below is added to the KiCad angle.  Only well-established
# corrections are applied.  Anything uncertain is left at KiCad's own angle:
# a wrong correction is worse than none, because the preview would look right
# while the part went down backwards.  Add entries here after checking the
# JLCPCB placement preview.
ROTATION_FIX = {
    'SOT-23': 180,
    'SOT-23-6': 180,
    'SOT-363_SC-70-6': 180,
}


def run(*args):
    p = subprocess.run(args, capture_output=True, text=True)
    if p.returncode:
        print(p.stdout, p.stderr)
        raise SystemExit(' '.join(args) + ' failed')
    return p.stdout


def gerbers():
    if os.path.isdir(GERBER):
        shutil.rmtree(GERBER)
    os.makedirs(GERBER)
    run('kicad-cli', 'pcb', 'export', 'gerbers', '--output', GERBER,
        '--layers', LAYERS, '--no-protel-ext', '--subtract-soldermask',
        '--use-drill-file-origin', PCB)
    # the drill exporter insists on a trailing separator, and says only
    # "Output must be a directory" when it does not get one
    run('kicad-cli', 'pcb', 'export', 'drill', '--output', GERBER + os.sep,
        '--format', 'excellon', '--drill-origin', 'absolute',
        '--excellon-separate-th', '--excellon-units', 'mm',
        '--generate-map', '--map-format', 'gerberx2', PCB)
    return sorted(os.listdir(GERBER))


def bom():
    """One line per distinct part, JLCPCB column names."""
    groups = OrderedDict()
    for part in design.PARTS.values():
        if not part.lcsc:
            continue                      # bare pads and holes: not fitted
        key = (part.value, part.fp, part.lcsc)
        groups.setdefault(key, []).append(part.ref)
    path = os.path.join(OUT, 'oa35-aio-bom.csv')
    with open(path, 'w', newline='') as fh:
        w = csv.writer(fh)
        w.writerow(['Comment', 'Designator', 'Footprint', 'LCSC Part #',
                    'Quantity'])
        for (value, fp, lcsc), refs in groups.items():
            value = value.replace('u_', 'uF ').replace('n_', 'nF ')
            refs.sort(key=lambda r: (r.rstrip('0123456789'),
                                     int(r.lstrip(
                                         'ABCDEFGHIJKLMNOPQRSTUVWXYZ') or 0)))
            w.writerow([value, ','.join(refs), fp.split(':')[-1], lcsc,
                        len(refs)])
    return path, len(groups), sum(len(v) for v in groups.values())


def cpl():
    """Pick and place, JLCPCB column names, with the rotation table applied."""
    raw = os.path.join(OUT, '_pos.csv')
    run('kicad-cli', 'pcb', 'export', 'pos', '--output', raw,
        '--format', 'csv', '--units', 'mm', '--side', 'both',
        '--use-drill-file-origin', PCB)
    rows = list(csv.DictReader(open(raw)))
    os.remove(raw)
    fitted = set(r for r, p in design.PARTS.items() if p.lcsc)
    path = os.path.join(OUT, 'oa35-aio-cpl.csv')
    n = 0
    with open(path, 'w', newline='') as fh:
        w = csv.writer(fh)
        w.writerow(['Designator', 'Mid X', 'Mid Y', 'Layer', 'Rotation'])
        for r in rows:
            ref = r['Ref']
            if ref not in fitted:
                continue
            fp = r['Package'].split(':')[-1]
            rot = (float(r['Rot']) + ROTATION_FIX.get(fp, 0)) % 360
            side = 'top' if r['Side'].lower().startswith('t') else 'bottom'
            w.writerow([ref, '%.4f' % float(r['PosX']),
                        '%.4f' % float(r['PosY']), side, '%.1f' % rot])
            n += 1
    return path, n


def zip_gerbers():
    path = os.path.join(OUT, 'oa35-aio-gerber.zip')
    with zipfile.ZipFile(path, 'w', zipfile.ZIP_DEFLATED) as z:
        for name in sorted(os.listdir(GERBER)):
            z.write(os.path.join(GERBER, name), name)
    return path


def schematic_pdf():
    run('kicad-cli', 'sch', 'export', 'pdf', '--output',
        os.path.join(OUT, 'oa35-aio-schematic.pdf'),
        os.path.join(ROOT, 'oa35-aio.kicad_sch'))


def previews():
    for side, layers, extra in (
            ('top', 'F.Cu,F.SilkS,F.Mask,Edge.Cuts', []),
            ('bottom', 'B.Cu,B.SilkS,B.Mask,Edge.Cuts', ['--mirror'])):
        run('kicad-cli', 'pcb', 'export', 'svg', '--output',
            os.path.join(OUT, 'preview-%s.svg' % side), '--layers', layers,
            '--page-size-mode', '2', *(extra + [PCB]))
    run('kicad-cli', 'pcb', 'export', 'pdf', '--output',
        os.path.join(OUT, 'oa35-aio-fab.pdf'), '--layers',
        'F.Cu,B.Cu,F.SilkS,B.SilkS,Edge.Cuts', PCB)


def main():
    if not os.path.isdir(OUT):
        os.makedirs(OUT)
    files = gerbers()
    print('gerber/drill: %d files' % len(files))
    b, kinds, pieces = bom()
    print('BOM: %d distinct parts, %d placements -> %s'
          % (kinds, pieces, os.path.basename(b)))
    c, n = cpl()
    print('CPL: %d placements -> %s' % (n, os.path.basename(c)))
    z = zip_gerbers()
    print('zip: %s' % os.path.basename(z))
    previews()
    schematic_pdf()
    print('previews and schematic pdf written')


if __name__ == '__main__':
    main()
