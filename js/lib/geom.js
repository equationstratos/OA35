/**
 * Outils de géométrie 2D -> 3D.
 *
 * Toutes les pièces sont décrites en COORDONNÉES PIXEL de l'image source
 * (origine en haut à gauche, Y vers le bas), exactement comme on les mesure
 * sur la photo. La conversion en millimètres se fait ici, en un seul endroit.
 */

import * as THREE from 'three';

/* ------------------------------------------------------------------ *
 * Conversion pixel -> millimètre
 * ------------------------------------------------------------------ */

/**
 * Crée un convertisseur pixel -> mm.
 * @param {object} o
 * @param {number} o.axisPx   abscisse (px) de l'axe de symétrie de la pièce
 * @param {number} o.centerPx ordonnée (px) du centre de la pièce
 * @param {number} o.mmPerPx  échelle
 */
export function makeScale({ axisPx, centerPx, mmPerPx }) {
  return {
    mmPerPx,
    axisPx,
    centerPx,
    x: (px) => (px - axisPx) * mmPerPx,
    y: (py) => (centerPx - py) * mmPerPx, // Y image (bas) -> Y modèle (haut)
    len: (p) => p * mmPerPx,
    pt: (px, py) => new THREE.Vector2((px - axisPx) * mmPerPx, (centerPx - py) * mmPerPx),
  };
}

/* ------------------------------------------------------------------ *
 * Congés (fillets) sur polyligne fermée
 * ------------------------------------------------------------------ */

const ARC_STEPS = 18;

/**
 * Transforme une polyligne fermée [{x, y, r}] en polygone échantillonné,
 * chaque sommet portant un rayon de congé `r` (0 = angle vif).
 * Fonctionne pour les angles convexes ET concaves.
 * @param {{x:number,y:number,r?:number}[]} pts
 * @returns {THREE.Vector2[]}
 */
export function roundPolygon(pts) {
  const n = pts.length;
  const out = [];

  for (let i = 0; i < n; i++) {
    const A = pts[(i - 1 + n) % n];
    const B = pts[i];
    const C = pts[(i + 1) % n];
    const r = B.r || 0;

    if (r <= 0) {
      out.push(new THREE.Vector2(B.x, B.y));
      continue;
    }

    const v1 = new THREE.Vector2(A.x - B.x, A.y - B.y);
    const v2 = new THREE.Vector2(C.x - B.x, C.y - B.y);
    const l1 = v1.length();
    const l2 = v2.length();
    if (l1 < 1e-6 || l2 < 1e-6) {
      out.push(new THREE.Vector2(B.x, B.y));
      continue;
    }
    v1.divideScalar(l1);
    v2.divideScalar(l2);

    let cos = THREE.MathUtils.clamp(v1.dot(v2), -1, 1);
    const angle = Math.acos(cos);
    // sommets alignés -> pas de congé possible
    if (angle < 1e-4 || Math.abs(Math.PI - angle) < 1e-4) {
      out.push(new THREE.Vector2(B.x, B.y));
      continue;
    }

    const half = angle / 2;
    // longueur de tangente, bornée par la moitié des segments voisins
    let tanLen = r / Math.tan(half);
    tanLen = Math.min(tanLen, l1 * 0.5, l2 * 0.5);
    const rr = tanLen * Math.tan(half);

    const P1 = new THREE.Vector2(B.x + v1.x * tanLen, B.y + v1.y * tanLen);
    const P2 = new THREE.Vector2(B.x + v2.x * tanLen, B.y + v2.y * tanLen);

    // bissectrice -> centre du congé
    const bis = new THREE.Vector2(v1.x + v2.x, v1.y + v2.y).normalize();
    const dist = rr / Math.sin(half);
    const O = new THREE.Vector2(B.x + bis.x * dist, B.y + bis.y * dist);

    let a1 = Math.atan2(P1.y - O.y, P1.x - O.x);
    let a2 = Math.atan2(P2.y - O.y, P2.x - O.x);
    let d = a2 - a1;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;

    for (let s = 0; s <= ARC_STEPS; s++) {
      const a = a1 + (d * s) / ARC_STEPS;
      out.push(new THREE.Vector2(O.x + rr * Math.cos(a), O.y + rr * Math.sin(a)));
    }
  }
  return out;
}

/**
 * Construit un contour fermé symétrique à partir d'un demi-profil.
 * Le demi-profil va du haut (sur l'axe) vers le bas (sur l'axe), côté X positif.
 * @param {{x:number,y:number,r?:number}[]} half
 * @returns {{x:number,y:number,r?:number}[]} contour complet
 */
export function mirrorHalf(half) {
  const full = half.slice();
  // on repart du bas vers le haut en miroir, sans dupliquer les points d'axe
  for (let i = half.length - 2; i >= 1; i--) {
    const p = half[i];
    full.push({ x: -p.x, y: p.y, r: p.r });
  }
  return full;
}

/* ------------------------------------------------------------------ *
 * Perçages / découpes
 * ------------------------------------------------------------------ */

export function circlePath(cx, cy, r, segments = 48) {
  const p = new THREE.Path();
  p.absarc(cx, cy, r, 0, Math.PI * 2, true);
  void segments;
  return p;
}

export function roundedRectPath(cx, cy, w, h, r = 0) {
  const pts = roundPolygon([
    { x: cx - w / 2, y: cy + h / 2, r },
    { x: cx + w / 2, y: cy + h / 2, r },
    { x: cx + w / 2, y: cy - h / 2, r },
    { x: cx - w / 2, y: cy - h / 2, r },
  ]);
  return new THREE.Path(pts.reverse());
}

/**
 * Polygone régulier (octogone de passage de fils, etc.).
 * @param {number} acrossFlats distance entre deux plats opposés
 */
export function regularPolyPath(cx, cy, sides, acrossFlats, rotation = 0, corner = 0) {
  const R = acrossFlats / 2 / Math.cos(Math.PI / sides);
  const pts = [];
  for (let i = 0; i < sides; i++) {
    const a = rotation + (i * 2 * Math.PI) / sides;
    pts.push({ x: cx + R * Math.cos(a), y: cy + R * Math.sin(a), r: corner });
  }
  return new THREE.Path(roundPolygon(pts).reverse());
}

/* ------------------------------------------------------------------ *
 * Extrusion
 * ------------------------------------------------------------------ */

/** Aire signée d'un polygone : positive dans le sens trigonométrique. */
function signedArea(points) {
  let a = 0;
  for (let i = 0, n = points.length; i < n; i++) {
    const p = points[i];
    const q = points[(i + 1) % n];
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
}

/**
 * Extrude un contour + ses perçages sur une épaisseur donnée, centré en Z.
 *
 * Le sens de parcours est normalisé ici, et ce n'est pas cosmétique :
 * Three.js retourne le contour extérieur s'il n'est pas dans le sens attendu,
 * et ne redresse les perçages QUE dans ce cas. Un contour déjà dans le bon
 * sens laisse donc les perçages tels quels — et s'ils tournent dans le même
 * sens que lui, leurs parois sortent retournées. Le maillage reste fermé, mais
 * une partie pointe vers l'intérieur : un trancheur n'y distingue plus le
 * plein du vide et bouche les trous à l'impression.
 *
 * @param {THREE.Vector2[]} outline contour extérieur
 * @param {THREE.Vector2[][]} holes perçages, en listes de points
 * @param {number} thickness épaisseur en mm
 * @param {number} bevel chanfrein d'arête en mm (réalisme)
 *
 * Chanfrein à ZÉRO par défaut. Le biseau d'ExtrudeGeometry ne mange pas
 * l'arête : il pousse le corps de la pièce vers l'extérieur de la valeur
 * demandée. Mesuré sur la plaque supérieure : 93 mm³ de matière en trop,
 * soit 2 % — contour 0,08 mm trop large et perçages 0,08 mm trop étroits,
 * tout autour. Tant que les contours venaient de la face chanfreinée du STL,
 * les deux erreurs se compensaient ; depuis qu'ils sont relevés à
 * mi-épaisseur, le biseau se voit.
 */
export function extrudePlate(outline, holes, thickness, bevel = 0) {
  // contour extérieur dans le sens trigonométrique, perçages en sens inverse
  const outer = signedArea(outline) < 0 ? outline.slice().reverse() : outline;
  const shape = new THREE.Shape(outer);
  for (const points of holes) {
    const ordered = signedArea(points) > 0 ? points.slice().reverse() : points;
    shape.holes.push(new THREE.Path(ordered));
  }

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: thickness - bevel * 2,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 2,
    // les contours sont déjà fournis échantillonnés (congés ou tracé photo) :
    // re-subdiviser chaque segment ferait exploser le maillage pour rien
    curveSegments: 1,
  });
  geo.translate(0, 0, -thickness / 2 + bevel);
  geo.computeVertexNormals();
  return geo;
}

/** Longueur de contour utile pour l'affichage des cotes. */
export function bbox2d(points) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
  }
  return { minX, maxX, minY, maxY, width: maxX - minX, height: maxY - minY };
}
