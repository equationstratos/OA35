#!/bin/sh
# Rebuild the whole project from tools/design.py.
#
#   ./build.sh            regenerate library, schematic, PCB, route, export
#   ./build.sh noroute    everything except the autorouting step
#
# Needs KiCad 7 (kicad-cli plus the pcbnew python module), java and xvfb.
set -e
cd "$(dirname "$0")"
PY=/usr/bin/python3          # the interpreter that has pcbnew

echo "== footprint library"
python3 tools/gen_lib.py

echo "== schematic"
python3 tools/gen_sch.py
python3 tools/check_netlist.py

echo "== placement"
$PY tools/gen_pcb.py

if [ "$1" != "noroute" ]; then
  echo "== autorouting"
  $PY tools/route.py "${2:-10}"
fi

echo "== copper pours and checks"
$PY tools/finish_pcb.py

echo "== production files"
$PY tools/export.py

echo "done"
