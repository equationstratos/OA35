/**
 * Détection des features circulaires d'un maillage importé : perçages de
 * fixation (là où passeront les vis) et arcs partiels d'accrochage.
 *
 * Une plaque plane livre ses perçages par le contour de sa face supérieure
 * (js/lib/trace.js) ; un maillage quelconque n'a pas de « face supérieure »,
 * il faut donc reconnaître les surfaces cylindriques dans la soupe de
 * triangles.
 *
 * DEUX PASSES, parce qu'aucune méthode seule ne couvre les deux besoins :
 *
 *  1. Adjacence — on regroupe les facettes cylindriques qui se touchent, puis
 *     on valide le groupe par un ajustement de cercle. Précis au centième sur
 *     un perçage traversant, mais aveugle à un arc noyé dans une paroi
 *     continue : la paroi entière ne forme qu'un seul groupe, qui échoue à la
 *     validation et disparaît.
 *
 *  2. Vote de normales (Hough) — sur un cylindre, la normale de chaque
 *     facette pointe radialement, donc la droite qu'elle porte passe par
 *     l'axe. Un arc concentre ses votes sur un point là où une paroi plane
 *     les disperse : c'est ce qui isole un demi-cercle d'accrochage. Mais les
 *     grandes features écrasent le vote, et un perçage de vis — quelques
 *     dizaines de facettes — n'y ressort pas.
 *
 * La passe 1 fournit donc les perçages, la passe 2 les arcs, et le résultat
 * est classé perçages d'abord : c'est là que passeront les vis.
 */

/** Axes testés : les pièces imprimées sont modélisées axe par axe. */
const AXES = [
  { name: 'X', i: 0, u: 1, w: 2 },
  { name: 'Y', i: 1, u: 2, w: 0 },
  { name: 'Z', i: 2, u: 0, w: 1 },
];

function normalOf(a, b, c) {
  const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const w = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  const n = [
    u[1] * w[2] - u[2] * w[1],
    u[2] * w[0] - u[0] * w[2],
    u[0] * w[1] - u[1] * w[0],
  ];
  const l = Math.hypot(n[0], n[1], n[2]) || 1;
  return [n[0] / l, n[1] / l, n[2] / l];
}

/** Cercle 2D par moindres carrés, avec écart maximal et couverture angulaire. */
function fitCircle(pts) {
  const N = pts.length;
  if (N < 6) return null;
  let Sx = 0, Sy = 0, Sxx = 0, Syy = 0, Sxy = 0, Sxxx = 0, Syyy = 0, Sxyy = 0, Sxxy = 0;
  for (const [x, y] of pts) {
    Sx += x; Sy += y; Sxx += x * x; Syy += y * y; Sxy += x * y;
    Sxxx += x * x * x; Syyy += y * y * y; Sxyy += x * y * y; Sxxy += x * x * y;
  }
  const C = N * Sxx - Sx * Sx, D = N * Sxy - Sx * Sy;
  const E = N * Sxxx + N * Sxyy - (Sxx + Syy) * Sx;
  const G = N * Syy - Sy * Sy, H = N * Sxxy + N * Syyy - (Sxx + Syy) * Sy;
  const det = C * G - D * D;
  if (Math.abs(det) < 1e-9) return null;
  const cx = (E * G - D * H) / det / 2;
  const cy = (C * H - D * E) / det / 2;

  let r = 0;
  for (const [x, y] of pts) r += Math.hypot(x - cx, y - cy);
  r /= N;
  let err = 0;
  for (const [x, y] of pts) err = Math.max(err, Math.abs(Math.hypot(x - cx, y - cy) - r));

  const angles = pts.map(([x, y]) => Math.atan2(y - cy, x - cx)).sort((a, b) => a - b);
  let gap = angles[0] + 2 * Math.PI - angles[angles.length - 1];
  for (let i = 1; i < angles.length; i++) gap = Math.max(gap, angles[i] - angles[i - 1]);

  return { cx, cy, r, err, coverage: (2 * Math.PI - gap) / (2 * Math.PI) };
}

/** Facettes dont la normale est perpendiculaire à l'axe, avec leur centroïde. */
function candidates(position, ax) {
  const triCount = position.length / 9;
  const out = [];
  for (let t = 0; t < triCount; t++) {
    const o = t * 9;
    const a = [position[o], position[o + 1], position[o + 2]];
    const b = [position[o + 3], position[o + 4], position[o + 5]];
    const c = [position[o + 6], position[o + 7], position[o + 8]];
    const n = normalOf(a, b, c);
    if (Math.abs(n[ax.i]) > 0.15) continue;
    const nu = n[ax.u], nw = n[ax.w];
    const nl = Math.hypot(nu, nw);
    if (nl < 1e-6) continue;
    out.push({
      tri: [a, b, c],
      u: (a[ax.u] + b[ax.u] + c[ax.u]) / 3,
      w: (a[ax.w] + b[ax.w] + c[ax.w]) / 3,
      nu: nu / nl, nw: nw / nl,
      along: (a[ax.i] + b[ax.i] + c[ax.i]) / 3,
    });
  }
  return out;
}

function makeResult(ax, cx, cy, radius, coverage, alongs, support) {
  const lo = Math.min(...alongs), hi = Math.max(...alongs);
  const center = [0, 0, 0];
  center[ax.u] = cx; center[ax.w] = cy; center[ax.i] = (lo + hi) / 2;
  return { center, axis: ax.name, radius, coverage, extent: hi - lo, support };
}

/** Passe 1 — perçages : regroupement par adjacence, validation stricte. */
function byAdjacency(position, ax, cand, minRadius, maxRadius) {
  // La profondeur fait partie de la clé : sans elle, des features distinctes
  // mais coaxiales fusionnent et l'ajustement de cercle échoue (essayé — on
  // perdait 3 perçages sur 4 du support caméra). En contrepartie un perçage
  // profond se retrouve découpé en tranches ; la profondeur réelle est donc
  // remesurée après coup, sinon le repère se placerait au milieu d'une
  // tranche au lieu du milieu du trou.
  const key = (p) => `${Math.round(p[ax.u] * 50)},${Math.round(p[ax.w] * 50)},${Math.round(p[ax.i] * 20)}`;
  const parent = new Map();
  const find = (x) => {
    while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x))); x = parent.get(x); }
    return x;
  };
  const union = (a, b) => { a = find(a); b = find(b); if (a !== b) parent.set(a, b); };

  for (const c of cand) for (const p of c.tri) { const k = key(p); if (!parent.has(k)) parent.set(k, k); }
  for (const c of cand) {
    const ks = c.tri.map(key);
    union(ks[0], ks[1]); union(ks[1], ks[2]);
  }

  const groups = new Map();
  for (const c of cand) {
    const root = find(key(c.tri[0]));
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(c);
  }

  const out = [];
  for (const list of groups.values()) {
    if (list.length < 6) continue;
    const pts = [];
    for (const c of list) for (const p of c.tri) pts.push([p[ax.u], p[ax.w]]);
    const fit = fitCircle(pts);
    if (!fit) continue;
    if (fit.r < minRadius || fit.r > maxRadius) continue;
    // validation stricte : c'est ce qui écarte une paroi entière prise pour
    // un cercle géant, au prix de rater les arcs — d'où la passe 2
    if (fit.err > Math.max(0.15, fit.r * 0.05)) continue;
    if (fit.coverage < 0.55) continue;

    // Profondeur réelle : on recolle les tranches voisines du même perçage.
    // La reprise se limite aux facettes CONTIGUËS en profondeur avec le
    // groupe d'origine — ramasser tout ce qui tombe sur le cercle happerait
    // une autre feature coaxiale plus loin dans la pièce et déporterait le
    // centre (constaté sur le support caméra : un perçage donné pour 23 mm de
    // long alors qu'il en fait 3).
    const tol = Math.max(0.15, fit.r * 0.06);
    const onCircle = cand
      .filter((c) => Math.abs(Math.hypot(c.u - fit.cx, c.w - fit.cy) - fit.r) <= tol)
      .map((c) => c.along)
      .sort((a, b) => a - b);

    const seedLo = Math.min(...list.map((c) => c.along));
    const seedHi = Math.max(...list.map((c) => c.along));
    const MAX_GAP = 0.8; // mm : au-delà, c'est une autre feature
    let lo = seedLo, hi = seedHi;
    for (const a of onCircle) {
      if (a < lo && lo - a <= MAX_GAP) lo = a;
      else if (a > hi && a - hi <= MAX_GAP) hi = a;
    }
    // seconde passe : l'extension peut avoir rapproché de nouveaux voisins
    for (const a of onCircle) {
      if (a >= lo - MAX_GAP && a <= hi + MAX_GAP) { lo = Math.min(lo, a); hi = Math.max(hi, a); }
    }

    out.push(makeResult(ax, fit.cx, fit.cy, fit.r, fit.coverage, [lo, hi], list.length));
  }
  return out;
}

/**
 * Bandes de rayon explorées séparément.
 *
 * Un seul accumulateur couvrant toute la plage laisse les grandes features
 * écraser le vote : un perçage de vis, quelques dizaines de facettes, ne
 * ressort jamais dans les pics face à une coque de 30 mm de diamètre. C'est
 * ce qui faisait manquer les trous de fixation des covers (Ø 3,5-4 mm bien
 * présents) au profit d'arcs de carrosserie. Une bande par ordre de grandeur
 * met chaque feature en concurrence avec ses semblables.
 */
const RADIUS_BANDS = [[0.7, 2.6], [2.4, 6.5], [6, 12], [11, 18]];

/** Une passe de vote des normales, sur une bande de rayon donnée. */
function voteBand(ax, cand, rMin, rMax, minCoverage) {
  const cell = Math.min(0.4, Math.max(0.2, rMin / 3));
  const votes = new Map();
  const step = Math.max(0.125, (rMax - rMin) / 16);
  for (const c of cand) {
    for (let r = rMin; r <= rMax; r += step) {
      for (const s of [1, -1]) {
        const k = `${Math.round((c.u + s * r * c.nu) / cell)},${Math.round((c.w + s * r * c.nw) / cell)}`;
        votes.set(k, (votes.get(k) || 0) + 1);
      }
    }
  }

  // Les votes d'une même feature se répartissent sur les cellules voisines
  // quand elle tombe à cheval sur une frontière. Sans ce cumul 3x3, une simple
  // translation de la pièce — le recentrage à l'import en est une — pouvait
  // faire disparaître un perçage pourtant bien détecté avant.
  const score = (kx, ky) => {
    let s = 0;
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      s += votes.get(`${kx + dx},${ky + dy}`) || 0;
    }
    return s;
  };

  const peaks = [...votes.keys()]
    .map((k) => {
      const [kx, ky] = k.split(',').map(Number);
      return { kx, ky, s: score(kx, ky) };
    })
    .filter((p) => p.s >= 10)
    .sort((a, b) => b.s - a.s)
    .slice(0, 30);

  const out = [];
  const seen = [];
  for (const pk of peaks) {
    let cu = pk.kx * cell;
    let cw = pk.ky * cell;
    // un pic voisin décrit la même feature : inutile de la réajuster 9 fois
    if (seen.some((s) => Math.hypot(s[0] - cu, s[1] - cw) < cell * 1.5)) continue;
    seen.push([cu, cw]);

    let ring = null;
    let radius = 0;
    // Le centre issu du vote est quantifié au pas de la grille : on le
    // réajuste par moindres carrés sur les facettes retenues. Sans ça le
    // repère se posait jusqu'à une demi-cellule à côté du perçage réel, ce qui
    // se voit tout de suite sur un Ø2.
    for (let pass = 0; pass < 3; pass++) {
      const found = [];
      for (const c of cand) {
        const du = cu - c.u, dw = cw - c.w;
        const d = Math.hypot(du, dw);
        if (d < rMin * 0.7 || d > rMax * 1.3) continue;
        const dot = (du / d) * c.nu + (dw / d) * c.nw;
        if (Math.abs(dot) < 0.94) continue; // normale non radiale : paroi plane
        found.push({ d, along: c.along, u: c.u, w: c.w });
      }
      if (found.length < 8) { ring = null; break; }

      const radii = found.map((p) => p.d).sort((a, b) => a - b);
      radius = radii[radii.length >> 1]; // médiane : robuste aux parasites
      const tol = Math.max(0.15, radius * 0.06);
      ring = found.filter((p) => Math.abs(p.d - radius) <= tol);
      if (ring.length < 8) { ring = null; break; }

      const fit = fitCircle(ring.map((p) => [p.u, p.w]));
      if (!fit) break;
      const moved = Math.hypot(fit.cx - cu, fit.cy - cw);
      cu = fit.cx; cw = fit.cy; radius = fit.r;
      if (moved < 0.01) break; // convergé
    }
    if (!ring) continue;
    if (radius < rMin || radius > rMax) continue;

    const angles = ring.map((p) => Math.atan2(p.w - cw, p.u - cu)).sort((a, b) => a - b);
    let gap = angles[0] + 2 * Math.PI - angles[angles.length - 1];
    for (let i = 1; i < angles.length; i++) gap = Math.max(gap, angles[i] - angles[i - 1]);
    const coverage = (2 * Math.PI - gap) / (2 * Math.PI);
    if (coverage < minCoverage) continue;

    out.push(makeResult(ax, cu, cw, radius, coverage, ring.map((p) => p.along), ring.length));
  }
  return out;
}

/** Passe 2 — arcs et petits perçages : vote des normales, bande par bande. */
function byNormalVote(position, ax, cand, minRadius, maxRadius, minCoverage) {
  if (cand.length < 8) return [];
  const out = [];
  for (const [lo, hi] of RADIUS_BANDS) {
    const rMin = Math.max(lo, minRadius);
    const rMax = Math.min(hi, maxRadius);
    if (rMax <= rMin) continue;
    out.push(...voteBand(ax, cand, rMin, rMax, minCoverage));
  }
  return out;
}

/**
 * @param {ArrayLike<number>} position sommets, 3 par triangle
 * @param {object} [opts]
 * @returns {{center:number[], axis:string, radius:number, coverage:number,
 *            extent:number, kind:'hole'|'arc'}[]}
 */
export function findCylinders(position, opts = {}) {
  const minRadius = opts.minRadius ?? 0.7;
  const maxRadius = opts.maxRadius ?? 18;
  const minCoverage = opts.minCoverage ?? 0.3;

  /**
   * Au-delà, la feature est refermée : c'est un perçage, pas un arc.
   * 0,68 plutôt que 0,75 pour attraper les trous de fixation des covers, que
   * la facettisation ne referme qu'à ~70 % alors qu'ils sont bien traversants
   * (paire symétrique, même diamètre, même hauteur).
   */
  const CLOSED = 0.68;

  /**
   * En dessous, un « arc » est un congé d'arête, pas une accroche : un rayon
   * de 1,8 mm qui court sur 30 mm de long est un chanfrein arrondi. Les vrais
   * perçages de cette taille sortent en 'hole', ils ne sont pas perdus.
   */
  const MIN_ARC_RADIUS = 2;

  /**
   * Au-delà, un cercle fermé n'est plus un perçage de fixation mais une
   * ouverture de carrosserie (passage de caméra, de fils…). La distinction
   * n'est pas cosmétique : ces grandes features sont géométriquement
   * ambiguës — vérifié en translatant la pièce, leur centre bougeait de 7 mm
   * alors qu'un Ø2 reste stable au centième. Les classer en arc les garde
   * cliquables sans les faire passer pour des trous de vis.
   */
  const MAX_FASTENER_RADIUS = 6;

  const found = [];
  for (const ax of AXES) {
    const cand = candidates(position, ax);
    // l'adjacence est la mesure la plus fiable quand elle aboutit
    for (const h of byAdjacency(position, ax, cand, minRadius, maxRadius)) {
      found.push({
        ...h,
        kind: h.radius <= MAX_FASTENER_RADIUS ? 'hole' : 'arc',
        exact: true,
      });
    }
    for (const a of byNormalVote(position, ax, cand, minRadius, maxRadius, minCoverage)) {
      const kind = a.coverage >= CLOSED && a.radius <= MAX_FASTENER_RADIUS ? 'hole' : 'arc';
      if (kind === 'arc' && a.radius < MIN_ARC_RADIUS) continue;
      found.push({ ...a, kind, exact: false });
    }
  }

  const dist = (a, b) => Math.hypot(
    a.center[0] - b.center[0], a.center[1] - b.center[1], a.center[2] - b.center[2],
  );

  // Ordre de confiance pour le dédoublonnage : une même feature peut sortir
  // de plusieurs passes ou de plusieurs axes, on garde la description la plus
  // sûre. Un perçage mesuré par adjacence prime sur le même perçage voté.
  const rank = (f) => (f.exact ? 0 : 1) + (f.kind === 'hole' ? 0 : 2);
  found.sort((a, b) => (rank(a) - rank(b)) || (a.radius - b.radius));

  const kept = [];
  for (const f of found) {
    if (!kept.some((k) => dist(k, f) < Math.max(1.2, Math.min(k.radius, f.radius)))) kept.push(f);
  }

  // Les perçages d'abord, du plus petit au plus grand : ce sont eux qui
  // portent les vis, et l'appelant n'en affiche qu'un nombre limité.
  kept.sort((a, b) => {
    if ((a.kind === 'hole') !== (b.kind === 'hole')) return a.kind === 'hole' ? -1 : 1;
    if (a.kind === 'hole') return a.radius - b.radius;
    return b.coverage - a.coverage;
  });
  return kept;
}
