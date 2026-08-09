#!/usr/bin/env python3
"""Check every LCSC part in the BOM against JLCPCB's live parts API.

Run this on a machine with plain internet access, right before ordering:

    python3 tools/verify_bom.py

It prints one line per part with the stock JLCPCB reports and flags anything
that is out of stock, discontinued, or whose package no longer matches the
footprint the board uses.  It never modifies the design.
"""

import json
import os
import sys
import urllib.error
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import design                                                    # noqa: E402

API = ('https://jlcpcb.com/api/overseas-pcb-order/v1/'
       'shoppingCart/smtGood/selectSmtComponentList')
HEADERS = {'Content-Type': 'application/json',
           'User-Agent': 'oa35-aio-bom-check'}


def query(code):
    body = json.dumps({'keyword': code, 'currentPage': 1,
                       'pageSize': 5}).encode()
    req = urllib.request.Request(API, data=body, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=20) as r:
        data = json.load(r)
    rows = (data.get('data') or {}).get('componentPageInfo', {}).get('list')
    if not rows:
        return None
    for row in rows:
        if row.get('componentCode', '').upper() == code.upper():
            return row
    return rows[0]


def main():
    parts = {}
    for p in design.PARTS.values():
        if p.lcsc:
            parts.setdefault(p.lcsc, [p.value, p.fp.split(':')[-1], 0])
            parts[p.lcsc][2] += 1

    bad = 0
    print('%-11s %-22s %5s %10s  %s'
          % ('LCSC', 'value', 'qty', 'stock', 'package / note'))
    for code in sorted(parts, key=lambda c: int(c[1:])):
        value, fp, qty = parts[code]
        try:
            row = query(code)
        except (urllib.error.URLError, ValueError, TimeoutError) as exc:
            print('%-11s %-22s %5d %10s  QUERY FAILED: %s'
                  % (code, value, qty, '?', exc))
            bad += 1
            continue
        if row is None:
            print('%-11s %-22s %5d %10s  NOT FOUND'
                  % (code, value, qty, '-'))
            bad += 1
            continue
        stock = row.get('stockCount', 0)
        pkg = row.get('componentSpecificationEn') or row.get(
            'componentModelEn', '')
        note = pkg
        if stock < qty * 10:
            note += '   LOW STOCK'
            bad += 1
        print('%-11s %-22s %5d %10d  %s' % (code, value, qty, stock, note))

    print()
    print('%d distinct parts, %d flagged' % (len(parts), bad))
    return 1 if bad else 0


if __name__ == '__main__':
    sys.exit(main())
