/**
 * Traçage automatique d'une pièce à partir de sa photo.
 *
 * La photo (pièce sombre sur fond clair) est binarisée, puis les contours sont
 * suivis au pixel près : contour extérieur + un contour par perçage. Le modèle
 * n'est donc plus « dessiné à l'œil », il est calculé sur les pixels réels.
 *
 * Repère de travail : pixels de l'image, origine en haut à gauche, Y vers le bas.
 */

/* ------------------------------------------------------------------ *
 * Binarisation
 * ------------------------------------------------------------------ */

/** Histogramme des luminances (0-255). */
function luminanceHistogram(data) {
  const h = new Uint32Array(256);
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3];
    // un pixel transparent compte comme fond clair
    const l = a < 128
      ? 255
      : (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) | 0;
    h[l]++;
  }
  return h;
}

/** Seuil automatique d'Otsu. */
export function otsuThreshold(imageData) {
  const hist = luminanceHistogram(imageData.data);
  const total = imageData.width * imageData.height;

  let sum = 0;
  for (let t = 0; t < 256; t++) sum += t * hist[t];

  let sumB = 0, wB = 0, best = 0, bestVar = -1;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > bestVar) { bestVar = between; best = t; }
  }
  return best;
}

/**
 * Masque binaire : 1 = matière (pixel sombre), 0 = fond.
 * @returns {{mask: Uint8Array, w: number, h: number}}
 */
export function buildMask(imageData, threshold) {
  const { width: w, height: h, data } = imageData;
  const mask = new Uint8Array(w * h);
  for (let i = 0, p = 0; i < data.length; i += 4, p++) {
    if (data[i + 3] < 128) continue; // transparent -> fond
    const l = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
    mask[p] = l < threshold ? 1 : 0;
  }
  return { mask, w, h };
}

/** Nettoyage morphologique : supprime le bruit isolé (ouverture 3x3). */
export function denoise({ mask, w, h }, passes = 1) {
  let cur = mask;
  for (let p = 0; p < passes; p++) {
    cur = morph(cur, w, h, 0); // érosion
    cur = morph(cur, w, h, 1); // dilatation
  }
  return { mask: cur, w, h };
}

function morph(src, w, h, mode) {
  const dst = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let acc = mode === 0 ? 1 : 0;
      for (let dy = -1; dy <= 1 && (mode === 0 ? acc : !acc); dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx, ny = y + dy;
          const v = nx < 0 || ny < 0 || nx >= w || ny >= h ? 0 : src[ny * w + nx];
          if (mode === 0) { if (!v) { acc = 0; break; } }
          else if (v) { acc = 1; break; }
        }
      }
      dst[y * w + x] = acc;
    }
  }
  return dst;
}

/* ------------------------------------------------------------------ *
 * Séparation fond / perçages
 * ------------------------------------------------------------------ */

/**
 * Les pixels de fond atteignables depuis le bord = extérieur.
 * Les autres pixels non-matière = perçages internes.
 * @returns {{holeLabels: Int32Array, count: number}}
 */
export function findHoles({ mask, w, h }) {
  const outside = new Uint8Array(w * h);
  const stack = [];

  const pushIfFree = (x, y) => {
    const i = y * w + x;
    if (!mask[i] && !outside[i]) { outside[i] = 1; stack.push(i); }
  };
  for (let x = 0; x < w; x++) { pushIfFree(x, 0); pushIfFree(x, h - 1); }
  for (let y = 0; y < h; y++) { pushIfFree(0, y); pushIfFree(w - 1, y); }

  while (stack.length) {
    const i = stack.pop();
    const x = i % w, y = (i / w) | 0;
    if (x > 0) pushIfFree(x - 1, y);
    if (x < w - 1) pushIfFree(x + 1, y);
    if (y > 0) pushIfFree(x, y - 1);
    if (y < h - 1) pushIfFree(x, y + 1);
  }

  // étiquetage des poches internes
  const labels = new Int32Array(w * h).fill(-1);
  let count = 0;
  for (let start = 0; start < labels.length; start++) {
    if (mask[start] || outside[start] || labels[start] >= 0) continue;
    const id = count++;
    labels[start] = id;
    const st = [start];
    while (st.length) {
      const i = st.pop();
      const x = i % w, y = (i / w) | 0;
      const nb = [];
      if (x > 0) nb.push(i - 1);
      if (x < w - 1) nb.push(i + 1);
      if (y > 0) nb.push(i - w);
      if (y < h - 1) nb.push(i + w);
      for (const n of nb) {
        if (!mask[n] && !outside[n] && labels[n] < 0) { labels[n] = id; st.push(n); }
      }
    }
  }
  return { holeLabels: labels, count };
}

/* ------------------------------------------------------------------ *
 * Suivi de contour (crack following, précision au pixel)
 * ------------------------------------------------------------------ */

const FWD = [[1, 0], [0, 1], [-1, 0], [0, -1]]; // droite, bas, gauche, haut

/**
 * Suit la frontière de la région définie par `isSet`, en partant du pixel
 * (sx, sy) qui doit être le premier de la région en balayage ligne par ligne.
 * @returns {number[][]} polygone en coordonnées de coins (donc entiers)
 */
function traceBoundary(isSet, sx, sy, maxSteps = 4e6) {
  const pts = [];
  let cx = sx, cy = sy, d = 0;
  let first = null; // première arête orientée : sert de critère de fermeture

  for (let n = 0; n < maxSteps; n++) {
    const [fx, fy] = FWD[d];
    const lx = fy, ly = -fx;   // normale gauche (repère Y vers le bas)
    const rx = -fy, ry = fx;   // normale droite

    // pixels des quadrants avant-gauche / avant-droit du coin courant
    const qlx = fx + lx, qly = fy + ly;
    const qrx = fx + rx, qry = fy + ry;
    const pL = isSet(cx + (qlx > 0 ? 0 : -1), cy + (qly > 0 ? 0 : -1));
    const pR = isSet(cx + (qrx > 0 ? 0 : -1), cy + (qry > 0 ? 0 : -1));

    if (pL) d = (d + 3) % 4;        // virage à gauche
    else if (!pR) d = (d + 1) % 4;  // virage à droite

    const nx = cx + FWD[d][0];
    const ny = cy + FWD[d][1];

    // le contour est bouclé dès qu'on reparcourt la première arête
    if (first) {
      if (first[0] === cx && first[1] === cy && first[2] === nx && first[3] === ny) break;
    } else {
      first = [cx, cy, nx, ny];
    }

    pts.push([cx, cy]);
    cx = nx; cy = ny;
  }
  return pts;
}

/** Aire signée (positive = sens trigonométrique dans un repère Y vers le haut). */
export function signedArea(pts) {
  let a = 0;
  for (let i = 0, n = pts.length; i < n; i++) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[(i + 1) % n];
    a += x1 * y2 - x2 * y1;
  }
  return a / 2;
}

/* ------------------------------------------------------------------ *
 * Simplification / lissage
 * ------------------------------------------------------------------ */

/** Douglas-Peucker sur polygone fermé. */
export function simplify(pts, epsilon) {
  if (epsilon <= 0 || pts.length < 4) return pts.slice();

  const rdp = (list) => {
    if (list.length < 3) return list;
    let maxD = 0, idx = 0;
    const [ax, ay] = list[0];
    const [bx, by] = list[list.length - 1];
    const dx = bx - ax, dy = by - ay;
    const len = Math.hypot(dx, dy) || 1;
    for (let i = 1; i < list.length - 1; i++) {
      const d = Math.abs((list[i][0] - ax) * dy - (list[i][1] - ay) * dx) / len;
      if (d > maxD) { maxD = d; idx = i; }
    }
    if (maxD <= epsilon) return [list[0], list[list.length - 1]];
    const left = rdp(list.slice(0, idx + 1));
    const right = rdp(list.slice(idx));
    return left.slice(0, -1).concat(right);
  };

  // on coupe le polygone en deux chaînes pour éviter le biais du point de départ
  const half = Math.floor(pts.length / 2);
  const a = rdp(pts.slice(0, half + 1));
  const b = rdp(pts.slice(half).concat([pts[0]]));
  return a.slice(0, -1).concat(b.slice(0, -1));
}

/** Ré-échantillonne un contour fermé à pas constant. */
export function resampleClosed(pts, step) {
  const n = pts.length;
  if (n < 3 || step <= 0) return pts.slice();

  let perim = 0;
  for (let i = 0; i < n; i++) {
    perim += Math.hypot(pts[(i + 1) % n][0] - pts[i][0], pts[(i + 1) % n][1] - pts[i][1]);
  }
  const count = Math.max(8, Math.round(perim / step));
  const d = perim / count;

  const out = [];
  let i = 0, acc = 0, target = 0;
  let [cx, cy] = pts[0];
  while (out.length < count) {
    const [nx, ny] = pts[(i + 1) % n];
    const segLen = Math.hypot(nx - cx, ny - cy);
    if (acc + segLen >= target - 1e-9 && segLen > 1e-12) {
      const t = (target - acc) / segLen;
      out.push([cx + (nx - cx) * t, cy + (ny - cy) * t]);
      target += d;
    } else {
      acc += segLen;
      cx = nx; cy = ny;
      i++;
      if (i >= n * 2) break; // garde-fou
    }
  }
  return out;
}

/** Filtre passe-bas gaussien sur un contour fermé (convolution périodique). */
export function lowPassClosed(pts, sigma) {
  const n = pts.length;
  if (n < 5 || sigma <= 0) return pts.map((p) => [p[0], p[1]]);

  const radius = Math.max(1, Math.ceil(sigma * 3));
  const kernel = [];
  let sum = 0;
  for (let k = -radius; k <= radius; k++) {
    const w = Math.exp(-(k * k) / (2 * sigma * sigma));
    kernel.push(w);
    sum += w;
  }

  const out = new Array(n);
  for (let i = 0; i < n; i++) {
    let x = 0, y = 0;
    for (let k = -radius, j = 0; k <= radius; k++, j++) {
      const p = pts[(((i + k) % n) + n) % n];
      x += p[0] * kernel[j];
      y += p[1] * kernel[j];
    }
    out[i] = [x / sum, y / sum];
  }
  return out;
}

/** Distance d'un point à une polyligne fermée. */
function distanceToPolygon(p, poly) {
  let best = Infinity;
  for (let i = 0, n = poly.length; i < n; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % n];
    const vx = b[0] - a[0], vy = b[1] - a[1];
    const wx = p[0] - a[0], wy = p[1] - a[1];
    const len = vx * vx + vy * vy;
    let t = len ? (wx * vx + wy * vy) / len : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const dx = wx - t * vx, dy = wy - t * vy;
    const d = dx * dx + dy * dy;
    if (d < best) best = d;
  }
  return Math.sqrt(best);
}

export function maxDistanceToPolygon(pts, poly) {
  let max = 0;
  for (const p of pts) max = Math.max(max, distanceToPolygon(p, poly));
  return max;
}

/**
 * Lissage sous contrainte de tolérance : on cherche le filtre le plus fort
 * dont le résultat reste à moins de `tolerance` du tracé d'origine.
 *
 * Un filtre à force fixe (Taubin, Chaikin) ne répond pas au besoin : il
 * converge vers un lissage donné, indépendant de la tolérance demandée. Ici
 * la force est le résultat d'une recherche, donc le réglage agit vraiment et
 * l'écart à la forme réelle reste borné et connu.
 *
 * @param {number[][]} pts contour fermé, ré-échantillonné à pas constant
 * @param {number[][]} reference tracé d'origine servant de référence d'écart
 * @param {number} tolerance écart maximal autorisé
 */
export function smoothToTolerance(pts, reference, tolerance) {
  if (tolerance <= 0 || pts.length < 8) return pts.map((p) => [p[0], p[1]]);

  let best = pts.map((p) => [p[0], p[1]]);
  let lo = 0;
  let hi = Math.max(2, pts.length / 8); // au-delà, la forme n'a plus de sens

  // recherche dichotomique sur l'écart-type du filtre
  for (let it = 0; it < 12; it++) {
    const mid = (lo + hi) / 2;
    const candidate = lowPassClosed(pts, mid);
    if (maxDistanceToPolygon(candidate, reference) <= tolerance) {
      best = candidate;
      lo = mid;
    } else {
      hi = mid;
    }
  }
  return best;
}

/**
 * Chaîne complète de nettoyage d'un contour tracé au pixel :
 * simplification -> pas constant -> relaxation bornée -> décimation.
 */
export function cleanContour(pts, { epsilon = 0.7, tolerance = 1, step = 0.5 } = {}) {
  const reference = simplify(pts, Math.min(epsilon, 0.5));
  if (tolerance <= 0) return simplify(pts, epsilon);

  let out = resampleClosed(reference, step);
  out = smoothToTolerance(out, reference, tolerance);
  // décimation finale : le contour lissé n'a plus besoin d'un point tous les 0,5 px
  return simplify(out, Math.min(0.15, tolerance / 8));
}

/* ------------------------------------------------------------------ *
 * Reconnaissance de perçages circulaires
 * ------------------------------------------------------------------ */

/**
 * Un petit perçage rond tracé au pixel est un polygone en escalier : sur un
 * Ø2 mm, le crénelage pèse plus lourd que la forme réelle, donc on le remplace
 * par un cercle parfait de même aire.
 *
 * Au-delà de `maxRadius`, on garde le tracé brut : sur une grande découpe
 * (octogone, lumière), les pixels décrivent fidèlement la forme et un
 * ajustement en cercle détruirait justement ce qu'on cherche à reproduire.
 */
function circleFit(pts, maxRadius, tolerance = 0.14) {
  const area = Math.abs(signedArea(pts));
  if (area < 3) return null;

  let cx = 0, cy = 0;
  for (const [x, y] of pts) { cx += x; cy += y; }
  cx /= pts.length; cy /= pts.length;

  const r = Math.sqrt(area / Math.PI);
  if (r > maxRadius) return null;

  let maxDev = 0;
  for (const [x, y] of pts) {
    maxDev = Math.max(maxDev, Math.abs(Math.hypot(x - cx, y - cy) - r));
  }
  // 1 px de crénelage est normal, on l'ignore dans la tolérance
  if (maxDev - 0.75 > r * tolerance) return null;
  return { cx, cy, r };
}

function circlePolygon(cx, cy, r, segments = 64) {
  const pts = [];
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return pts;
}

/* ------------------------------------------------------------------ *
 * Symétrisation
 * ------------------------------------------------------------------ */

/**
 * Force la symétrie gauche/droite : on garde la moitié droite et on la
 * recopie en miroir. Corrige les défauts de prise de vue sur une pièce
 * qui est symétrique par conception.
 */
function symmetrizePolygon(pts, axis) {
  // ré-échantillonnage par angle autour du centroïde : robuste et simple
  let cy = 0;
  for (const p of pts) cy += p[1];
  cy /= pts.length;

  const N = 720;
  const right = new Array(N).fill(null);
  const cxA = axis;

  for (let i = 0; i < pts.length; i++) {
    const [x, y] = pts[i];
    const a = Math.atan2(y - cy, x - cxA);
    const k = Math.round(((a + Math.PI) / (2 * Math.PI)) * N) % N;
    const d = Math.hypot(x - cxA, y - cy);
    if (right[k] === null || d > right[k]) right[k] = d;
  }
  // moyenne du rayon avec son symétrique
  const out = [];
  for (let k = 0; k < N; k++) {
    const a = -Math.PI + (k / N) * 2 * Math.PI;
    const km = (N - k) % N; // angle miroir par rapport à l'axe vertical
    const d1 = right[k], d2 = right[km];
    const d = d1 !== null && d2 !== null ? (d1 + d2) / 2 : (d1 ?? d2);
    if (d === null || d === undefined) continue;
    out.push([cxA + d * Math.cos(a), cy + d * Math.sin(a)]);
  }
  return out.length > 8 ? out : pts;
}

/* ------------------------------------------------------------------ *
 * Pipeline complet
 * ------------------------------------------------------------------ */

/**
 * @param {ImageData} imageData
 * @param {object} opts
 * @param {number} [opts.threshold]      seuil manuel (sinon Otsu)
 * @param {number} [opts.epsilon=0.7]    tolérance de simplification, en px
 * @param {number} [opts.toleranceMm=0.4] lissage : écart max toléré, en mm
 *        (exprimé sur la pièce, donc indépendant de la résolution de la photo)
 * @param {number} [opts.refLengthMm=105] longueur réelle, pour convertir
 *        la tolérance en pixels
 * @param {number} [opts.minHoleArea=6]  aire mini d'un perçage, en px²
 * @param {number} [opts.circleMaxRadius=14] rayon max, en px, d'un perçage
 *        assimilé à un cercle parfait ; au-delà le tracé brut est conservé
 * @param {boolean} [opts.symmetric]     forcer la symétrie gauche/droite
 * @returns {{outline:number[][], holes:object[], bbox:object, threshold:number}}
 */
export function traceImage(imageData, opts = {}) {
  const {
    epsilon = 0.7,
    toleranceMm = 0.4,
    refLengthMm = 105,
    minHoleArea = 6,
    circleMaxRadius = 14,
    symmetric = false,
    denoisePasses = 1,
  } = opts;

  const threshold = opts.threshold ?? otsuThreshold(imageData);
  let m = buildMask(imageData, threshold);
  if (denoisePasses > 0) m = denoise(m, denoisePasses);
  const { mask, w, h } = m;

  const solid = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : mask[y * w + x]);

  // --- contour extérieur : on part du plus gros amas de matière
  let start = -1;
  for (let i = 0; i < mask.length; i++) if (mask[i]) { start = i; break; }
  if (start < 0) throw new Error('Aucune matière détectée : ajuste le seuil.');

  let outline = traceBoundary(solid, start % w, (start / w) | 0);
  const rawOutline = outline;

  // --- échelle : la tolérance est donnée sur la pièce, on la passe en pixels
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const [x, y] of rawOutline) {
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  }
  const bbox = { minX, maxX, minY, maxY, width: maxX - minX, height: maxY - minY };
  const tolerance = toleranceMm * (bbox.height / refLengthMm);

  // --- perçages
  const { holeLabels, count } = findHoles(m);

  // premier pixel et aire de chaque poche, en un seul balayage
  const firstPixel = new Int32Array(count).fill(-1);
  const areas = new Int32Array(count);
  for (let i = 0; i < holeLabels.length; i++) {
    const id = holeLabels[i];
    if (id < 0) continue;
    if (firstPixel[id] < 0) firstPixel[id] = i;
    areas[id]++;
  }

  const holes = [];
  for (let id = 0; id < count; id++) {
    const s = firstPixel[id];
    const area = areas[id];
    if (s < 0 || area < minHoleArea) continue;
    const isHole = (x, y) =>
      (x < 0 || y < 0 || x >= w || y >= h ? 0 : holeLabels[y * w + x] === id ? 1 : 0);
    let poly = traceBoundary(isHole, s % w, (s / w) | 0);

    const fit = circleFit(poly, circleMaxRadius);
    if (fit) {
      holes.push({ kind: 'circle', cx: fit.cx, cy: fit.cy, r: fit.r, points: circlePolygon(fit.cx, fit.cy, fit.r) });
    } else {
      // une découpe est petite : la même tolérance absolue effacerait ses
      // angles (un octogone deviendrait un cercle). On la borne à une
      // fraction de sa propre taille.
      const equivalentRadius = Math.sqrt(area / Math.PI);
      poly = cleanContour(poly, {
        epsilon,
        tolerance: Math.min(tolerance, equivalentRadius * 0.05),
      });
      holes.push({ kind: 'poly', points: poly, area });
    }
  }

  if (symmetric) outline = symmetrizePolygon(simplify(outline, epsilon), (minX + maxX) / 2);
  outline = cleanContour(outline, { epsilon, tolerance });

  return { outline, holes, bbox, threshold, tolerance, imageWidth: w, imageHeight: h };
}

/* ------------------------------------------------------------------ *
 * Passage en millimètres
 * ------------------------------------------------------------------ */

/**
 * Cale le tracé sur une longueur réelle et centre la pièce sur l'origine.
 * Y image (vers le bas) devient Y modèle (vers le haut).
 */
export function traceToMm(trace, refLengthMm) {
  const { bbox } = trace;
  const mmPerPx = refLengthMm / bbox.height;
  const axis = (bbox.minX + bbox.maxX) / 2;
  const center = (bbox.minY + bbox.maxY) / 2;

  const conv = (p) => [(p[0] - axis) * mmPerPx, (center - p[1]) * mmPerPx];

  return {
    mmPerPx,
    axis,
    center,
    outline: trace.outline.map(conv),
    holes: trace.holes.map((hl) => ({
      ...hl,
      points: hl.points.map(conv),
      ...(hl.kind === 'circle'
        ? { cx: (hl.cx - axis) * mmPerPx, cy: (center - hl.cy) * mmPerPx, r: hl.r * mmPerPx }
        : {}),
    })),
    width: bbox.width * mmPerPx,
    height: refLengthMm,
  };
}
