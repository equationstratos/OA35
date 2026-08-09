#!/usr/bin/env python3
"""Autoroute the board: KiCad -> Specctra DSN -> freerouting -> tracks.

GND and VBAT are planes already, so the router only has to reach them with
vias.  Everything else is routed as copper, with wider traces for the motor
phases and the supply rails.  The session file is parsed here rather than
handed to pcbnew's importer, which only works inside the GUI.
"""

import os
import re
import subprocess
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import pcbnew                                                    # noqa: E402
import design                                                    # noqa: E402
from sexpr import parse, find_all, Sym                           # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, '..'))
PCB = os.path.join(ROOT, 'oa35-aio.kicad_pcb')
JAR = os.path.join(HERE, 'freerouting.jar')
WORK = os.path.join(ROOT, 'build')

# net -> (trace width um, clearance um)
WIDE = 800          # motor phases and the battery feed
MID = 500           # supply rails
THIN = 200          # signals


def net_class(name):
    if name.startswith('PH_') or name in ('VBAT', 'VBAT_IN'):
        return 'phase'
    if name in ('+5V', '+5V_BUCK', '+10V', '+3V3', '+3V3E', '+3V3A', 'VBUS',
                'SW_5V', 'SW_GD'):
        return 'supply'
    return 'kicad_default'


CLASS_WIDTH = {'phase': WIDE, 'supply': MID, 'kicad_default': THIN}


def rewrite_classes(path):
    """Split the single exported net class into three, by trace width."""
    txt = open(path).read()
    m = re.search(r'\n(    \(class kicad_default .*?\n    \)\n)  \)\n',
                  txt, re.S)
    if not m:
        raise SystemExit('could not find the class block in the DSN')
    block = m.group(1)
    names = re.findall(r'[^\s()"]+|"[^"]*"', block.split('(circuit')[0])
    names = [n for n in names[3:] if n not in ('class', 'kicad_default', '""')]
    groups = {}
    for n in names:
        groups.setdefault(net_class(n.strip('"')), []).append(n)

    out = []
    for cls in ('kicad_default', 'supply', 'phase'):
        members = groups.get(cls, [])
        if not members:
            continue
        body = []
        line = '    (class %s "" ' % cls
        for n in members:
            if len(line) > 90:
                body.append(line)
                line = '      '
            line += n + ' '
        body.append(line)
        body.append('      (circuit')
        body.append('        (use_via Via[0-5]_500:250_um)')
        body.append('      )')
        body.append('      (rule')
        body.append('        (width %d)' % CLASS_WIDTH[cls])
        body.append('        (clearance 150.1)')
        body.append('      )')
        body.append('    )')
        out.append('\n'.join(body))
    new = '\n'.join(out) + '\n  )\n'
    txt = txt[:m.start()] + '\n' + new + txt[m.end():]
    open(path, 'w').write(txt)
    return dict((c, len(v)) for c, v in groups.items())


def run_freerouting(dsn, ses, passes=10):
    cmd = ['xvfb-run', '-a', 'java', '-jar', JAR,
           '-de', dsn, '-do', ses, '-mp', str(passes)]
    print('  ' + ' '.join(cmd))
    p = subprocess.run(cmd, capture_output=True, text=True, timeout=7200)
    for line in (p.stdout + p.stderr).splitlines():
        if ('Auto-routing' in line or 'optimization' in line
                or 'Saving' in line or 'unrouted' in line.lower()):
            print('  ' + line.split('] ')[-1])
    if not os.path.exists(ses):
        print(p.stdout[-3000:])
        print(p.stderr[-3000:])
        raise SystemExit('freerouting produced no session file')


def import_ses(board, path):
    """Add the routed wires and vias from a Specctra session file."""
    doc = parse(open(path).read())
    routes = None
    for x in doc:
        if isinstance(x, list) and x and x[0] == Sym('routes'):
            routes = x
    if routes is None:
        raise SystemExit('no routes in the session file')
    netout = [x for x in routes if isinstance(x, list)
              and x and x[0] == Sym('network_out')][0]

    layer_of = {}
    for i in range(board.GetCopperLayerCount()):
        lid = board.GetLayerID(board.GetLayerName(i if i else 0))
    for lid in (pcbnew.F_Cu, pcbnew.In1_Cu, pcbnew.In2_Cu, pcbnew.In3_Cu,
                pcbnew.In4_Cu, pcbnew.B_Cu):
        layer_of[board.GetLayerName(lid)] = lid

    nets = board.GetNetsByName()
    ntrack = nvia = 0
    for net in find_all(netout, Sym('net')):
        name = str(net[1]).strip('"')
        ni = nets[name] if name in nets else None
        code = ni.GetNetCode() if ni else 0
        for wire in find_all(net, Sym('wire')):
            for path in find_all(wire, Sym('path')):
                lname = str(path[1])
                width = float(path[2]) / 10000.0
                nums = [float(v) for v in path[3:]]
                pts = [(nums[i] / 10000.0, -nums[i + 1] / 10000.0)
                       for i in range(0, len(nums), 2)]
                for a, b in zip(pts, pts[1:]):
                    if a == b:
                        continue
                    t = pcbnew.PCB_TRACK(board)
                    t.SetStart(pcbnew.VECTOR2I(pcbnew.FromMM(a[0]),
                                               pcbnew.FromMM(a[1])))
                    t.SetEnd(pcbnew.VECTOR2I(pcbnew.FromMM(b[0]),
                                             pcbnew.FromMM(b[1])))
                    t.SetWidth(pcbnew.FromMM(width))
                    t.SetLayer(layer_of[lname])
                    t.SetNetCode(code)
                    board.Add(t)
                    ntrack += 1
        for via in find_all(net, Sym('via')):
            padstack = str(via[1])
            x = float(via[2]) / 10000.0
            y = -float(via[3]) / 10000.0
            m = re.search(r'_(\d+):(\d+)_um', padstack)
            dia, drill = (0.5, 0.25) if not m else (int(m.group(1)) / 1000.0,
                                                    int(m.group(2)) / 1000.0)
            v = pcbnew.PCB_VIA(board)
            v.SetPosition(pcbnew.VECTOR2I(pcbnew.FromMM(x), pcbnew.FromMM(y)))
            v.SetWidth(pcbnew.FromMM(dia))
            v.SetDrill(pcbnew.FromMM(drill))
            v.SetLayerPair(pcbnew.F_Cu, pcbnew.B_Cu)
            v.SetNetCode(code)
            board.Add(v)
            nvia += 1
    return ntrack, nvia


def main(passes=10):
    if not os.path.isdir(WORK):
        os.makedirs(WORK)
    dsn = os.path.join(WORK, 'oa35-aio.dsn')
    ses = os.path.join(WORK, 'oa35-aio.ses')
    for f in (dsn, ses):
        if os.path.exists(f):
            os.remove(f)

    board = pcbnew.LoadBoard(PCB)
    # start from a clean slate: drop anything previously routed
    for t in list(board.GetTracks()):
        board.Remove(t)
    board.Save(PCB)

    if not pcbnew.ExportSpecctraDSN(board, dsn):
        raise SystemExit('DSN export failed')
    print('classes:', rewrite_classes(dsn))
    run_freerouting(dsn, ses, passes)

    board = pcbnew.LoadBoard(PCB)
    ntrack, nvia = import_ses(board, ses)
    print('imported %d track segments, %d vias' % (ntrack, nvia))
    board.Save(PCB)

    conn = board.GetConnectivity()
    conn.RecalculateRatsnest()
    print('unconnected pads after routing: %d' % conn.GetUnconnectedCount())
    return conn.GetUnconnectedCount()


if __name__ == '__main__':
    n = int(sys.argv[1]) if len(sys.argv) > 1 else 10
    sys.exit(0 if main(n) == 0 else 1)
