#!/usr/bin/env python3
"""Route the board by negotiated congestion.

A greedy router treats an occupied cell as a wall: the first net through
wins and the rest go round, so the order nets are taken in decides the
result.  On this board that plateaus at about two thirds, whatever the
order, whatever the layer count, and whatever is done about the pin escapes.

Negotiated congestion -- PathFinder, McMurchie and Ebeling 1995 -- turns the
wall into a price.  Nets are allowed to share a cell, but sharing costs, and
the cost of a contested cell rises every iteration.  Every net is ripped up
and rerouted each iteration, so a net that grabbed a corridor early has to
bid for it again against whoever else needs it, and the one with an
alternative eventually goes elsewhere.  After enough iterations nobody is
willing to share and the routing is legal.

Two prices, as in the paper:

  present  what a cell costs right now, given how many nets are on it.
           Raised each iteration, so early iterations explore freely and
           later ones are forced to separate.
  history  what a cell has cost over all past iterations.  This is what
           stops two nets swapping places forever: a cell that keeps being
           contested becomes expensive for good and both nets leave.

The geometry, the search and the board writing come from finish_route.py.
"""

import heapq
import math
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import pcbnew                                                    # noqa: E402
import finish_route as FR                                        # noqa: E402

N = FR.N
GRID = FR.GRID
ROUTABLE = FR.ROUTABLE
LAYERS = FR.LAYERS
VIA_COST = FR.VIA_COST
LAYER_COST = FR.LAYER_COST
PCB = FR.PCB

# The schedule.  present_factor multiplies the cost of every net beyond the
# first on a cell; it starts gentle so the first iterations find natural
# routes, and doubles until sharing is unaffordable.
PRESENT_START = 0.5
# Tripling, not the textbook 1.5-2x.  At 1.8 the shared-cell count fell 4%
# an iteration and slowing, with each iteration costing longer than the last:
# forty of them would have run overnight without arriving.  Tripling makes a
# shared cell cost a thousand times a free one by the eighth iteration, which
# is the point where what is left sharing is sharing because it has no
# alternative -- and that is the number worth knowing.
PRESENT_GROWTH = 3.0
HISTORY_GROWTH = 4.0            # added per iteration per overused cell
BASE = GRID                     # cost of one straight step, mm

# A net does not occupy its centre line, it occupies a disc around it: two
# tracks 0.13 mm wide with 0.13 mm between them need their centres 0.26 mm
# apart, so each claims everything within half of that.  Counting only the
# cells a path passes through would let two nets run a cell apart and call it
# legal.  Vias claim more, and on every layer.
def _disc(radius_mm):
    r = radius_mm / GRID
    rr = r * r
    out = []
    span = int(math.ceil(r))
    for dy in range(-span, span + 1):
        for dx in range(-span, span + 1):
            if dx * dx + dy * dy <= rr:
                out.append((dx, dy))
    return tuple(out)


# What a net forbids to others, as a radius around its centre line.  Two
# track centres must be a track width plus a clearance apart, so that whole
# distance is what a net keeps for itself -- not half of it.
#
# Claiming only half was the bug that made the negotiation useless: a net paid
# for congestion on the cells its centre line crossed, but conflicts start as
# soon as another centre line comes within 0.26 mm.  Everything between 0.14
# and 0.28 mm was illegal and free at the same time, which is most conflicts,
# and the shared-cell count sat flat at 74000 while the price of sharing was
# multiplied by nine.
TRACK_KEEP = _disc(FR.TRACK_W + FR.CLEAR + FR.MARGIN)
VIA_KEEP = _disc(FR.VIA_DIA / 2.0 + FR.CLEAR + FR.TRACK_W / 2.0 + FR.MARGIN)


class Field(object):
    """Per-cell occupancy count, plus the two prices."""

    def __init__(self, space):
        self.sp = space
        self.count = [bytearray(N * N) for _ in LAYERS]
        self.hist = [[0.0] * (N * N) for _ in LAYERS]
        self.present = PRESENT_START

    def usable(self, li, ix, iy, net):
        """Hard geometry only: pads and the board edge still cannot be used."""
        if not (0 <= ix < N and 0 <= iy < N):
            return False
        k = iy * N + ix
        if self.sp.shut[li][k]:
            return False
        own = self.sp.owner[li][k]
        return own == 0 or own == net

    def price(self, li, ix, iy, net):
        k = iy * N + ix
        n = self.count[li][k]
        # a cell this net already occupies is free to it
        share = max(0, n - 1) if self.sp.owner[li][k] == net else n
        return (1.0 + self.hist[li][k]) * (1.0 + self.present * share)

    def add(self, li, ix, iy):
        k = iy * N + ix
        if self.count[li][k] < 255:
            self.count[li][k] += 1

    def drop(self, li, ix, iy):
        k = iy * N + ix
        if self.count[li][k]:
            self.count[li][k] -= 1

    def hot_cells(self, centres):
        """Where copper actually sits on ground another net has claimed.

        Counting every claimed cell instead answers a different and useless
        question: two nets a legal 0.3 mm apart have overlapping claims and
        are perfectly fine.  What matters is a net's own centre line landing
        inside somebody else's clearance.
        """
        out = set()
        for cells in centres:
            for (li, ix, iy) in cells:
                if self.count[li][iy * N + ix] > 1:
                    out.add((li, ix, iy))
        return out

    def bump_history(self, hot):
        for (li, ix, iy) in hot:
            k = iy * N + ix
            self.hist[li][k] += HISTORY_GROWTH * (self.count[li][k] - 1)


# Weighting the heuristic makes the search greedier: paths come out a few
# percent longer, but it stops fanning out over half the board when the cost
# field is bumpy, which is what made the long nets run out of budget and come
# back unroutable.
HEUR = 2.0


def search(field, sources, targets, net, budget=300000, weight=None):
    """Cheapest path under the current prices, not the shortest one."""
    if not sources or not targets:
        return None
    tset = set(targets)
    tx = sum(t[1] for t in targets) / float(len(targets))
    ty = sum(t[2] for t in targets) / float(len(targets))
    hypot = math.hypot
    counts, hists = field.count, field.hist
    shuts, owners = field.sp.shut, field.sp.owner
    present = field.present
    STEPS = FR.STEPS
    w = HEUR if weight is None else weight

    open_q = []
    best = {}
    for s in sources:
        if s in tset:
            return [s]
        best[s] = 0.0
        heapq.heappush(open_q, (hypot(s[1] - tx, s[2] - ty) * GRID * w,
                                0.0, s, None))
    came = {}
    seen = 0
    while open_q:
        f, g, cur, prev = heapq.heappop(open_q)
        if cur in came:
            continue
        came[cur] = prev
        if cur in tset:
            path = []
            while cur is not None:
                path.append(cur)
                cur = came[cur]
            path.reverse()
            return path
        seen += 1
        if seen > budget:
            return None
        li, ix, iy = cur
        mult = LAYER_COST[li]
        # The next twenty lines are usable() and price() written out by hand.
        # They are called ten times per node expanded and several million
        # times per iteration; as method calls they were most of the run.
        count = counts[li]
        hist = hists[li]
        shut = shuts[li]
        owner = owners[li]
        for dx, dy, step in STEPS:
            jx, jy = ix + dx, iy + dy
            if jx < 0 or jy < 0 or jx >= N or jy >= N:
                continue
            nxt = (li, jx, jy)
            if nxt in came:
                continue
            k = jy * N + jx
            if shut[k]:
                continue
            own = owner[k]
            if own and own != net:
                continue
            n = count[k]
            share = (n - 1 if n else 0) if own == net else n
            ng = g + step * mult * (1.0 + hist[k]) * (1.0 + present * share)
            if best.get(nxt, 1e18) <= ng:
                continue
            best[nxt] = ng
            heapq.heappush(open_q, (ng + hypot(jx - tx, jy - ty) * GRID * w,
                                    ng, nxt, cur))
        k0 = iy * N + ix
        for lj in ROUTABLE:
            if lj == li:
                continue
            nxt = (lj, ix, iy)
            if nxt in came or shuts[lj][k0]:
                continue
            own = owners[lj][k0]
            if own and own != net:
                continue
            n = counts[lj][k0]
            share = (n - 1 if n else 0) if own == net else n
            ng = g + VIA_COST * (1.0 + hists[lj][k0]) * (1.0 + present * share)
            if best.get(nxt, 1e18) <= ng:
                continue
            if not FR.via_ok(field.sp, ix, iy, net):
                continue
            best[nxt] = ng
            heapq.heappush(open_q, (ng + hypot(ix - tx, iy - ty) * GRID * w,
                                    ng, nxt, cur))
    return None


def terminals(board, sp, code):
    """The pad clusters of one net, as sets of cells to route between."""
    items = FR.net_items(board, code)
    out = []
    for g in FR.components(items):
        cells = FR.anchor_cells(sp, items, g, code)
        if cells:
            out.append(cells)
    return out


def claimed(paths):
    """(cells this net forbids to others, cells its copper actually runs on).

    The two are different and both are needed: the first is what other nets
    have to pay to enter, the second is where this net is illegal if someone
    entered anyway.
    """
    keep = set()
    centre = set()
    for path in paths:
        prev_layer = None
        for (li, ix, iy) in path:
            centre.add((li, ix, iy))
            for dx, dy in TRACK_KEEP:
                keep.add((li, ix + dx, iy + dy))
            if prev_layer is not None and prev_layer != li:
                for lj in ROUTABLE:
                    centre.add((lj, ix, iy))
                    for dx, dy in VIA_KEEP:
                        keep.add((lj, ix + dx, iy + dy))
            prev_layer = li
    return keep, centre


def route_net(field, terms, net):
    """Connect the terminals of one net.  Returns the cells it claims.

    A search that runs out of budget is retried greedier rather than given
    up on.  As the price of sharing climbs the cost field gets bumpy, A*
    fans out further, and nets that were routable at iteration 1 start
    coming back unroutable at iteration 5 -- which is the search giving up,
    not the board being full.
    """
    if len(terms) < 2:
        return set(), []
    tree = set(terms[0])
    paths = []
    for t in terms[1:]:
        path = search(field, tree, t, net)
        if path is None:
            path = search(field, tree, t, net, weight=HEUR * 3.0)
        if path is None:
            return None, None
        paths.append(path)
        tree.update(path)
        tree.update(t)
    keep, centre = claimed(paths)
    return keep, (centre, paths)


def main(iterations=24, seconds=0):
    t0 = time.time()
    board = pcbnew.LoadBoard(PCB)
    sp = FR.paint(board)
    field = Field(sp)

    nets = board.GetNetsByName()
    jobs = []
    for name in nets.keys():
        name = str(name)
        if not name or name in ('GND', 'VBAT') \
                or name.startswith(('NC', 'ND')):
            continue
        code = nets[name].GetNetCode()
        terms = terminals(board, sp, code)
        if len(terms) > 1:
            jobs.append((name, code, terms))
    print('%d nets to route' % len(jobs), flush=True)

    routes = {}                 # code -> (claimed cells, paths)
    kept = {}                   # last route each net had, legal or not
    by_code = dict((code, (name, terms)) for name, code, terms in jobs)
    dirty = [code for _n, code, _t in jobs]
    for it in range(1, iterations + 1):
        # Only the nets sitting on contested ground are rerouted.  Rerouting
        # all two hundred every time costs twenty minutes an iteration and
        # buys nothing for the nets that are already out of everyone's way.
        for code in dirty:
            cells = routes.pop(code, (None, None))[0]
            if cells:
                for (li, ix, iy) in cells:
                    field.drop(li, ix, iy)
        unroutable = []
        for code in dirty:
            name, terms = by_code[code]
            cells, rest = route_net(field, terms, code)
            if cells is None:
                # In PathFinder a net always has a route, even an illegal
                # one.  Dropping it instead frees the cells it was claiming,
                # which flatters the shared-cell count and takes the net out
                # of the negotiation entirely -- so the count stalls while
                # the failures climb.  Keep the last route it had.
                cells, rest = kept.get(code, (None, None))
                if cells is None:
                    unroutable.append(name)
                    continue
            routes[code] = (cells, rest)
            kept[code] = (cells, rest)
            for (li, ix, iy) in cells:
                field.add(li, ix, iy)

        hot = field.hot_cells([r[1][0] for r in routes.values()])
        shared = len(hot)
        print('iteration %2d  present %.2f  rerouted %3d  shared cells %6d  '
              'unroutable %d  (%.0f min)'
              % (it, field.present, len(dirty), shared, len(unroutable),
                 (time.time() - t0) / 60.0), flush=True)
        if shared == 0 and not unroutable:
            print('legal after %d iterations' % it, flush=True)
            break
        field.bump_history(hot)
        field.present *= PRESENT_GROWTH
        dirty = [code for code, (_cells, rest) in routes.items()
                 if rest[0] & hot]
        dirty += [c for c in by_code
                  if c not in routes and c not in dirty]
        if seconds and time.time() - t0 > seconds:
            print('time limit reached', flush=True)
            break

    # write whatever we have
    board = pcbnew.LoadBoard(PCB)
    sp2 = FR.paint(board)
    written = 0
    for name, code, terms in jobs:
        entry = routes.get(code)
        if not entry or not entry[1][1]:
            continue
        for path in entry[1][1]:
            FR.commit(board, sp2, path, code)
        written += 1
    board.Save(PCB)
    conn = board.GetConnectivity()
    conn.RecalculateRatsnest()
    print('wrote %d nets, unconnected pads: %d'
          % (written, conn.GetUnconnectedCount(False)))
    return conn.GetUnconnectedCount(False)


if __name__ == '__main__':
    args = [a for a in sys.argv[1:] if not a.startswith('--')]
    n = int(args[0]) if args else 24
    secs = int(args[1]) if len(args) > 1 else 0
    sys.exit(0 if main(n, secs) == 0 else 1)
