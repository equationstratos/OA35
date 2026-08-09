#!/usr/bin/env python3
"""Cross-check: the netlist KiCad reads back must equal tools/design.py.

Exports the netlist with kicad-cli, parses it, and compares component set,
footprints, LCSC fields and net membership against the design definition.
Exits non-zero on any difference, so it can gate the build.
"""

import os
import re
import subprocess
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import design                                                   # noqa: E402
from sexpr import parse, find, find_all, Sym                     # noqa: E402

ROOT = os.path.normpath(os.path.join(os.path.dirname(
    os.path.abspath(__file__)), '..'))
SCH = os.path.join(ROOT, 'oa35-aio.kicad_sch')


def export():
    out = os.path.join(tempfile.mkdtemp(), 'oa35.net')
    subprocess.check_call(['kicad-cli', 'sch', 'export', 'netlist',
                           '--output', out, SCH],
                          stdout=subprocess.DEVNULL,
                          stderr=subprocess.STDOUT)
    return out


def read_netlist(path):
    doc = parse(open(path).read())
    comps = {}
    for c in find_all(find(doc, Sym('components')), Sym('comp')):
        ref = str(find(c, Sym('ref'))[1])
        val = find(c, Sym('value'))
        fp = find(c, Sym('footprint'))
        fields = {}
        fl = find(c, Sym('fields'))
        if fl:
            for f in find_all(fl, Sym('field')):
                nm = find(f, Sym('name'))
                if nm is not None and len(f) > 2:
                    fields[str(nm[1])] = str(f[2])
        comps[ref] = {'value': str(val[1]) if val else '',
                      'fp': str(fp[1]) if fp else '',
                      'lcsc': fields.get('LCSC', '')}
    nets = {}
    for n in find_all(find(doc, Sym('nets')), Sym('net')):
        name = str(find(n, Sym('name'))[1])
        pins = set()
        for node in find_all(n, Sym('node')):
            pins.add((str(find(node, Sym('ref'))[1]),
                      str(find(node, Sym('pin'))[1])))
        nets[name] = pins
    return comps, nets


def canon(name):
    """KiCad prefixes hierarchical local nets; global labels stay bare."""
    return re.sub(r'^/[^/]*/', '', name)


def main():
    path = export()
    comps, nets = read_netlist(path)

    errs = []
    want_refs = set(design.PARTS)
    got_refs = set(comps)
    for r in sorted(want_refs - got_refs):
        errs.append('missing from schematic: %s' % r)
    for r in sorted(got_refs - want_refs):
        errs.append('extra in schematic: %s' % r)

    for r in sorted(want_refs & got_refs):
        p = design.PARTS[r]
        if comps[r]['fp'] != p.fp:
            errs.append('%s footprint %r != %r' % (r, comps[r]['fp'], p.fp))
        if comps[r]['value'] != p.value:
            errs.append('%s value %r != %r' % (r, comps[r]['value'], p.value))
        if comps[r]['lcsc'] != p.lcsc:
            errs.append('%s LCSC %r != %r' % (r, comps[r]['lcsc'], p.lcsc))

    want_nets = design.nets()
    # drop no-connects: they are not nets in the exported netlist
    want = {}
    for name, pins in want_nets.items():
        if name.startswith('NC') or name.startswith('ND'):
            continue
        want[name] = set(pins)

    got = {}
    for name, pins in nets.items():
        got.setdefault(canon(name), set()).update(pins)

    # a net whose pins match is the same net whatever KiCad decided to call it
    got_by_pins = {}
    for name, pins in got.items():
        got_by_pins[frozenset(pins)] = name
    for name, pins in sorted(want.items()):
        key = frozenset(pins)
        if key in got_by_pins:
            continue
        if name in got and got[name] == pins:
            continue
        gp = got.get(name)
        errs.append('net %s: expected %s, schematic has %s'
                    % (name, sorted(pins),
                       sorted(gp) if gp else '<no such net>'))

    print('components: %d  nets checked: %d' % (len(comps), len(want)))
    if errs:
        for e in errs[:40]:
            print('  FAIL', e)
        print('%d differences' % len(errs))
        return 1
    print('schematic netlist matches design.py exactly')
    return 0


if __name__ == '__main__':
    sys.exit(main())
