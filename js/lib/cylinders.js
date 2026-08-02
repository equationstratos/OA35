/**
 * Détection des features circulaires d'un maillage importé : trous
 * traversants, mais aussi ARCS PARTIELS — les covers du châssis s'accrochent
 * sur un demi-cercle ouvert, pas sur un trou fermé, et c'est justement là que
 * la fixation se fait.
 *
 * Une plaque plane livre ses perçages directement par le contour de sa face
 * supérieure (js/lib/trace.js) ; un maillage quelconque n'a pas de « face
 * supérieure », il faut donc reconnaître les surfaces cylindriques dans la
 * soupe de triangles.
 *
 * Méthode : sur un cylindre d'axe A, la normale de chaque facette est
 * perpendiculaire à A et pointe radialement — la droite portée par la normale
 * passe donc par l'axe. On projette perpendiculairement à A, on fait voter
 * les intersections de ces droites dans une grille (transformée de Hough),
 * et chaque pic est un centre de cercle. Les points sont ensuite ramassés
 * autour du centre pour mesurer rayon, couverture angulaire et étendue.
 *
 * Le vote par normales, plutôt qu'un regroupement par adjacence, est ce qui
 * permet d'isoler un arc noyé dans une paroi continue : une paroi plane vote
 * pour des centres dispersés, un arc concentre ses votes sur un point.
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

/**
 * @param {Float32Array} position sommets, 3 par triangle
 * @param {object} [opts]
 * @param {number} [opts.minRadius] rayon minimal retenu, en mm
 * @param {number} [opts.maxRadius] rayon maximal retenu, en mm
 * @param {number} [opts.minCoverage] fraction de cercle minimale (0-1) :
 *        0,3 laisse passer un tiers de tour, de quoi attraper un demi-cercle
 *        d'accrochage sans retenir le moindre congé
 * @returns {{center:number[], axis:string, radius:number, coverage:number,
 *            extent:number}[]}
 */
export function findCylinders(position, opts = {}) {
  const minRadius = opts.minRadius ?? 0.8;
  const maxRadius = opts.maxRadius ?? 22;
  const minCoverage = opts.minCoverage ?? 0.3;
  const cell = 0.4; // pas de la grille de vote, en mm

  const triCount = position.length / 9;
  const results = [];

  for (const ax of AXES) {
    // --- facettes dont la normale est perpendiculaire à l'axe
    const pts = [];   // [u, w, nu, nw, along]
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
      // centroïde de la facette : un point par facette suffit et lisse le bruit
      const cu = (a[ax.u] + b[ax.u] + c[ax.u]) / 3;
      const cw = (a[ax.w] + b[ax.w] + c[ax.w]) / 3;
      const along = (a[ax.i] + b[ax.i] + c[ax.i]) / 3;
      pts.push([cu, cw, nu / nl, nw / nl, along]);
    }
    if (pts.length < 8) continue;

    // --- vote : le centre est à distance r le long de la normale, des deux
    // côtés (trou = matière autour, bossage = matière dedans)
    const votes = new Map();
    const step = Math.max(0.25, cell / 2);
    for (const [u, w, nu, nw] of pts) {
      for (let r = minRadius; r <= maxRadius; r += step) {
        for (const s of [1, -1]) {
          const cu = u + s * r * nu;
          const cw = w + s * r * nw;
          const k = `${Math.round(cu / cell)},${Math.round(cw / cell)}`;
          votes.set(k, (votes.get(k) || 0) + 1);
        }
      }
    }

    // --- pics du vote
    const peaks = [...votes.entries()]
      .filter(([, v]) => v >= 12)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 40)
      .map(([k]) => k.split(',').map((x) => Number(x) * cell));

    for (const [cu, cw] of peaks) {
      // points dont la normale pointe vers ce centre (ou à l'opposé)
      const ring = [];
      for (const [u, w, nu, nw, along] of pts) {
        const du = cu - u, dw = cw - w;
        const d = Math.hypot(du, dw);
        if (d < minRadius * 0.7 || d > maxRadius * 1.3) continue;
        const dot = (du / d) * nu + (dw / d) * nw;
        if (Math.abs(dot) < 0.94) continue; // normale non radiale : paroi plane
        ring.push([u, w, d, along]);
      }
      if (ring.length < 8) continue;

      // rayon = médiane, plus robuste qu'une moyenne aux points parasites
      const radii = ring.map((p) => p[2]).sort((a, b) => a - b);
      const radius = radii[radii.length >> 1];
      if (radius < minRadius || radius > maxRadius) continue;

      const tol = Math.max(0.18, radius * 0.06);
      const inliers = ring.filter((p) => Math.abs(p[2] - radius) <= tol);
      if (inliers.length < 8) continue;

      const angles = inliers.map((p) => Math.atan2(p[1] - cw, p[0] - cu)).sort((a, b) => a - b);
      let gap = angles[0] + 2 * Math.PI - angles[angles.length - 1];
      for (let i = 1; i < angles.length; i++) gap = Math.max(gap, angles[i] - angles[i - 1]);
      const coverage = (2 * Math.PI - gap) / (2 * Math.PI);
      if (coverage < minCoverage) continue;

      const alongs = inliers.map((p) => p[3]);
      const lo = Math.min(...alongs), hi = Math.max(...alongs);

      const center = [0, 0, 0];
      center[ax.u] = cu; center[ax.w] = cw; center[ax.i] = (lo + hi) / 2;
      results.push({
        center, axis: ax.name, radius, coverage, extent: hi - lo,
        support: inliers.length,
      });
    }
  }

  // --- dédoublonnage : une même feature peut ressortir sur deux axes
  results.sort((a, b) => b.support - a.support);
  const kept = [];
  for (const r of results) {
    const near = kept.some((k) => {
      const d = Math.hypot(
        k.center[0] - r.center[0], k.center[1] - r.center[1], k.center[2] - r.center[2],
      );
      return d < Math.max(1.5, Math.min(k.radius, r.radius));
    });
    if (!near) kept.push(r);
  }
  return kept;
}
