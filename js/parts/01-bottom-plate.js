/**
 * PIÈCE 01 — Plaque inférieure (bottom plate) du châssis carbone.
 * Base du build "TinyHoop MK1".
 *
 * ===================================================================
 *  TOUTES LES COTES SONT EN PIXELS DE LA PHOTO SOURCE (268 x 371 px),
 *  origine en haut à gauche, Y vers le bas.
 *  -> pour corriger le modèle, on ne touche QU'À CE FICHIER.
 * ===================================================================
 *
 * Échelle : la photo est une vue de dessus orthogonale. On calibre avec
 * la longueur hors-tout de la plaque (REF_LENGTH_MM). Toutes les autres
 * cotes en découlent, donc le rapport de forme reste exact au pixel près.
 */

import {
  makeScale, roundPolygon, mirrorHalf,
  circlePath, roundedRectPath, regularPolyPath, bbox2d,
} from '../lib/geom.js';
import { plateObject, plateFromTrace } from '../lib/plate.js';

/* ------------------------------------------------------------------ *
 * 1. Calibration
 * ------------------------------------------------------------------ */

export const PX = {
  imageWidth: 268,
  imageHeight: 371,
  axis: 134,        // axe de symétrie gauche/droite
  top: 22,          // arête avant (haut de la photo)
  bottom: 348,      // arête arrière
  get centerY() { return (this.top + this.bottom) / 2; },
  get lengthPx() { return this.bottom - this.top; },
};

/** Longueur hors-tout réelle de la plaque, en mm. Seul réglage d'échelle. */
export const REF_LENGTH_MM = 105.0;

/** Épaisseur du carbone, en mm. */
export const THICKNESS_MM = 2.0;

const MM_PER_PX = REF_LENGTH_MM / PX.lengthPx;

const S = makeScale({
  axisPx: PX.axis,
  centerPx: PX.centerY,
  mmPerPx: MM_PER_PX,
});

/* ------------------------------------------------------------------ *
 * 2. Contour extérieur — demi-profil droit (axe -> droite -> axe)
 *    r = rayon de congé en px (0 = angle vif)
 * ------------------------------------------------------------------ */

const HALF_OUTLINE_PX = [
  { px: 134, py: 72,  r: 9,  note: 'fond de l\'échancrure avant (sur l\'axe)' },
  { px: 152, py: 40,  r: 20, note: 'flanc interne de l\'oreille avant droite' },
  { px: 190, py: 28,  r: 12, note: 'bord avant de l\'oreille droite' },
  { px: 211, py: 48,  r: 20, note: 'coin extérieur avant droit (arrondi)' },
  { px: 212, py: 124, r: 14, note: 'flanc droit de la partie large' },
  { px: 200, py: 150, r: 26, note: 'taille : amorce concave' },
  { px: 186, py: 182, r: 26, note: 'taille : retour vers la verticale' },
  { px: 183, py: 200, r: 14, note: 'raccord sur le flanc de la queue' },
  { px: 183, py: 338, r: 0,  note: 'flanc droit de la queue' },
  { px: 172, py: 348, r: 11, note: 'coin arrière droit' },
  { px: 134, py: 348, r: 0,  note: 'bord arrière (sur l\'axe)' },
];

/* ------------------------------------------------------------------ *
 * 3. Perçages et découpes
 * ------------------------------------------------------------------ */

/** Ø7 mm — 4 gros trous (silent-blocs / passage de vis moteur). */
const BIG_HOLES_PX = [
  { px: 82,  py: 50,  r: 11 },
  { px: 186, py: 50,  r: 11 },
  { px: 78,  py: 104, r: 11 },
  { px: 190, py: 104, r: 11 },
];

/** Ø2,3 mm — trous M2 de fixation (FC, caméra, standoffs). */
const M2_HOLES_PX = [
  // groupe avant, autour de la découpe carrée
  { px: 120, py: 64,  r: 3.5 },
  { px: 148, py: 64,  r: 3.5 },
  { px: 110, py: 100, r: 3.5 },
  { px: 158, py: 100, r: 3.5 },
  // entretoises 20x20 (pattern FC)
  { px: 108, py: 140, r: 3.5 },
  { px: 160, py: 140, r: 3.5 },
  { px: 108, py: 192, r: 3.5 },
  { px: 160, py: 192, r: 3.5 },
  // fixations arrière (batterie / VTX)
  { px: 100, py: 288, r: 3.5 },
  { px: 168, py: 288, r: 3.5 },
  { px: 100, py: 320, r: 3.5 },
  { px: 168, py: 320, r: 3.5 },
  { px: 116, py: 338, r: 3.5 },
  { px: 152, py: 338, r: 3.5 },
];

/** Découpe carrée centrale (passage nappe caméra). */
const SQUARE_CUT_PX = { px: 134, py: 104, w: 13, h: 13, r: 2 };

/** Lumière rectangulaire (passage strap batterie). */
const SLOT_CUT_PX = { px: 134, py: 163, w: 36, h: 17, r: 5 };

/** Octogone (allègement / passage des fils moteurs). */
const OCTAGON_CUT_PX = { px: 134, py: 240, acrossFlats: 48, corner: 1.5 };

/* ------------------------------------------------------------------ *
 * 4. Construction
 * ------------------------------------------------------------------ */

function outlinePoints() {
  const half = HALF_OUTLINE_PX.map((p) => ({ x: S.x(p.px), y: S.y(p.py), r: S.len(p.r) }));
  return roundPolygon(mirrorHalf(half));
}

function holePaths() {
  const holes = [];
  for (const h of [...BIG_HOLES_PX, ...M2_HOLES_PX]) {
    holes.push(circlePath(S.x(h.px), S.y(h.py), S.len(h.r)));
  }
  holes.push(roundedRectPath(
    S.x(SQUARE_CUT_PX.px), S.y(SQUARE_CUT_PX.py),
    S.len(SQUARE_CUT_PX.w), S.len(SQUARE_CUT_PX.h), S.len(SQUARE_CUT_PX.r),
  ));
  holes.push(roundedRectPath(
    S.x(SLOT_CUT_PX.px), S.y(SLOT_CUT_PX.py),
    S.len(SLOT_CUT_PX.w), S.len(SLOT_CUT_PX.h), S.len(SLOT_CUT_PX.r),
  ));
  holes.push(regularPolyPath(
    S.x(OCTAGON_CUT_PX.px), S.y(OCTAGON_CUT_PX.py),
    8, S.len(OCTAGON_CUT_PX.acrossFlats),
    Math.PI / 8, S.len(OCTAGON_CUT_PX.corner),
  ));
  return holes;
}

/** Données 2D en mm, pour le plan coté. */
export function blueprint() {
  const outline = outlinePoints();
  const box = bbox2d(outline);
  return {
    outline,
    box,
    circles: [...BIG_HOLES_PX, ...M2_HOLES_PX].map((h) => ({
      x: S.x(h.px), y: S.y(h.py), r: S.len(h.r), d: S.len(h.r * 2),
    })),
    rects: [SQUARE_CUT_PX, SLOT_CUT_PX].map((c) => ({
      x: S.x(c.px), y: S.y(c.py), w: S.len(c.w), h: S.len(c.h), r: S.len(c.r),
    })),
    octagon: {
      x: S.x(OCTAGON_CUT_PX.px), y: S.y(OCTAGON_CUT_PX.py),
      acrossFlats: S.len(OCTAGON_CUT_PX.acrossFlats),
    },
    mmPerPx: MM_PER_PX,
  };
}

/** Objet 3D prêt à poser dans la scène (plaque à plat, avant vers -Z). */
export function build() {
  return plateObject(outlinePoints(), holePaths(), THICKNESS_MM);
}

/**
 * Variante construite à partir du tracé automatique de la photo
 * (voir js/lib/trace.js) : la géométrie vient alors des pixels réels.
 */
export function buildFromTrace(traceMm) {
  return plateFromTrace(traceMm, THICKNESS_MM);
}

export const meta = {
  id: 'bottom-plate',
  index: 1,
  name: 'Plaque inférieure châssis',
  material: 'Carbone 3K sergé, ' + THICKNESS_MM.toFixed(1) + ' mm',
  stackHeight: 0,        // altitude Y dans le build, en mm
  source: 'photo 268 x 371 px',
  get dims() {
    const b = blueprint().box;
    return {
      length: b.height,
      width: b.width,
      thickness: THICKNESS_MM,
      mmPerPx: MM_PER_PX,
      holes: BIG_HOLES_PX.length + M2_HOLES_PX.length,
    };
  },
};
