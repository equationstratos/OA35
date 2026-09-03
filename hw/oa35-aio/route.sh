#!/bin/sh
# Route the board, in one command.
#
#   ./route.sh            place the board and route it
#   ./route.sh import     bring back a session file you routed elsewhere
#
# Needs KiCad 7's python (for pcbnew) and java, both of which the build
# already needs.  Everything it writes goes to oa35-aio.kicad_pcb.
set -e
cd "$(dirname "$0")"
PY=${PY:-/usr/bin/python3}

case "${1:-route}" in

import)
    # A .ses that came back from freerouting, or from anything else that
    # speaks Specctra.  Drop it in build/oa35-aio.ses first.
    test -f build/oa35-aio.ses || {
        echo "put the session file in build/oa35-aio.ses first" >&2
        exit 1
    }
    $PY tools/route.py --import-only
    ;;

route)
    echo "== placement"
    $PY tools/gen_pcb.py

    echo
    echo "== routage automatique (freerouting), 2 manches"
    $PY tools/route.py 1 2 || true

    echo
    echo "== finition (routeur maison, legal par construction)"
    $PY tools/finish_route.py || true

    echo
    echo "== bilan"
    $PY - <<'EOF'
import sys
sys.path.insert(0, 'tools')
import pcbnew, finish_route as FR
b = pcbnew.LoadBoard('oa35-aio.kicad_pcb')
left = FR.in_pieces(b)
seg = sum(1 for t in b.GetTracks() if t.Type() != pcbnew.PCB_VIA_T)
via = sum(1 for t in b.GetTracks() if t.Type() == pcbnew.PCB_VIA_T)
print('  %d segments, %d vias' % (seg, via))
print('  nets encore incomplets : %d' % len(left))
if left:
    print('  ' + ', '.join(n for n, _c, _s in left[:20]))
EOF
    echo
    echo "Il reste des nets ? Voir docs/ROUTER-SOI-MEME.md :"
    echo "freerouting 2.x sur votre machine fait mieux que la 1.9 embarquee."
    ;;

*)
    echo "usage: $0 [route|import]" >&2
    exit 1
    ;;
esac
