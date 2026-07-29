/**
 * PIÈCE 01 — Bottom-plate.
 *
 * Contour et perçages extraits directement du fichier bottomplate.stl fourni
 * (déjà en millimètres réels — rien à calibrer, contrairement aux pièces
 * tracées depuis une photo). Voir js/parts/contour-bottom-plate.js.
 *
 * Épaisseur mesurée sur le fichier fourni : 1,5 mm, conforme à la fiche
 * technique du châssis (Bottom Plate Thickness: 1.5 mm).
 */

import { TRACE } from './contour-bottom-plate.js';
import { plateFromSTL } from './plate-from-stl.js';

export const THICKNESS_MM = 1.5;

const part = plateFromSTL({
  trace: TRACE,
  id: 'bottom-plate',
  index: 1,
  name: 'Bottom-plate',
  thickness: THICKNESS_MM,
  source: 'contour extrait du fichier bottomplate.stl fourni',
});

export const { trace, build, buildFromTrace, blueprint, meta } = part;
