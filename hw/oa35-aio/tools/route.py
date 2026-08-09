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

PLANE_NETS = ('GND', 'VBAT')


def strip_plane_nets(path, names=PLANE_NETS):
    """Take the plane nets out of the DSN before handing it to the router.

    GND alone has 177 pads; asked to route it as a tree, freerouting spends
    most of its time there and still leaves a third of the board bare.  The
    pads stay in the file as obstacles, only their net membership goes, so
    the router works on signals alone -- and GND and VBAT get their copper
    from the planes, the pours and the stitching vias instead.
    """
    txt = open(path).read()
    removed = 0
    for name in names:
        pat = re.compile(r'\n    \(net %s\n(?:.*?\n)*?    \)' % re.escape(name))
        txt, n = pat.subn('', txt)
        removed += n
        txt = re.sub(r'(?<=[\s])%s(?=[\s])' % re.escape(name), '', txt, count=0)
    open(path, 'w').write(txt)
    return removed


def check_classes(path):
    """Report the class split KiCad exported, without touching it.

    Rewriting this block to give the phases and the supply rails wider
    traces looked harmless and was not: with the rewritten classes
    freerouting silently gave up on most of the board (85 nets routed out of
    279), while the block KiCad writes itself routes all of them.  Trace
    width for the high-current nets comes from the pours added by
    finish_pcb.py and from widen_supplies() below, not from the router.
    """
    txt = open(path).read()
    m = re.search(r'\(class (\S+) ""(.*?)\(circuit', txt, re.S)
    if not m:
        return {}
    names = re.findall(r'[^\s()"]+|"[^"]*"', m.group(2))
    return {m.group(1): len(names)}


def run_freerouting(dsn, ses, passes=10):
    """Run the router, echoing its progress as it goes.

    Buffering the whole run and printing at the end makes a twenty minute
    autoroute look like a hang, so the interesting lines are streamed.
    """
    cmd = ['xvfb-run', '-a', 'java', '-jar', JAR,
           '-de', dsn, '-do', ses, '-mp', str(passes)]
    print('  ' + ' '.join(cmd), flush=True)
    tail = []
    p = subprocess.Popen(cmd, stdout=subprocess.PIPE,
                         stderr=subprocess.STDOUT, text=True, bufsize=1)
    for line in p.stdout:
        tail.append(line)
        del tail[:-200]
        if any(k in line for k in ('Auto-routing', 'optimization', 'Saving',
                                   'pass', 'unrouted', 'Routing')):
            print('  ' + line.rstrip().split('] ')[-1], flush=True)
    p.wait(timeout=7200)
    if not os.path.exists(ses):
        print(''.join(tail))
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


def clear_tracks():
    """Drop anything previously routed, in its own process.

    BOARD.Remove() leaves pcbnew's python proxies broken for the rest of the
    interpreter, so this cannot share a process with the import that follows.
    """
    subprocess.check_call([sys.executable, os.path.abspath(__file__),
                           '--clear'])


def _clear_here():
    board = pcbnew.LoadBoard(PCB)
    tracks = list(board.GetTracks())
    if not tracks:
        return
    for t in tracks:
        board.Remove(t)
    board.Save(PCB)


def main(passes=10, ses_only=False, keep=False):
    """One routing round.

    With keep=True the tracks already on the board are exported into the DSN
    as ordinary routed wires, so the round picks up where the last one left
    off.  freerouting only reports progress once every pass it was asked for
    is done, and a twenty-pass run takes over an hour with nothing on the
    console; a chain of short rounds costs the same and can be watched.
    """
    if not os.path.isdir(WORK):
        os.makedirs(WORK)
    dsn = os.path.join(WORK, 'oa35-aio.dsn')
    ses = os.path.join(WORK, 'oa35-aio.ses')
    if not ses_only:
        for f in (dsn, ses):
            if os.path.exists(f):
                os.remove(f)

    if not ses_only:
        if not keep:
            clear_tracks()
        board = pcbnew.LoadBoard(PCB)
        if not pcbnew.ExportSpecctraDSN(board, dsn):
            raise SystemExit('DSN export failed')
        print('removed %d plane nets from the DSN' % strip_plane_nets(dsn))
        print('classes:', check_classes(dsn))
        run_freerouting(dsn, ses, passes)

    if keep:
        clear_tracks()          # the session file carries the old wires too
    board = pcbnew.LoadBoard(PCB)
    ntrack, nvia = import_ses(board, ses)
    print('imported %d track segments, %d vias' % (ntrack, nvia))
    board.Save(PCB)

    conn = board.GetConnectivity()
    conn.RecalculateRatsnest()
    un = conn.GetUnconnectedCount(False)
    import finish_pcb
    bare = finish_pcb.bare_nets(board)
    print('unconnected pads: %d, nets with no copper: %d' % (un, len(bare)))
    return un


if __name__ == '__main__':
    if '--clear' in sys.argv:
        _clear_here()
        sys.exit(0)
    only = '--import-only' in sys.argv
    cont = '--continue' in sys.argv
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    n = int(args[0]) if args else 10
    rounds = int(args[1]) if len(args) > 1 else 1
    rc = 0
    for i in range(rounds):
        if rounds > 1:
            print('--- round %d/%d' % (i + 1, rounds), flush=True)
        rc = main(n, ses_only=only, keep=cont or i > 0)
        if rc == 0:
            break
    sys.exit(0 if rc == 0 else 1)
