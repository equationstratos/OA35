/**
 * PIÈCE 04 — Top-plate.
 *
 * Contour et perçages extraits directement du fichier topplate.stl fourni
 * (déjà en millimètres réels). Épaisseur mesurée : 2,0 mm, conforme à la
 * fiche technique du châssis (Top Plate Thickness: 2.0 mm).
 */

import { TRACE } from './contour-top-plate.js';
import { plateFromSTL } from './plate-from-stl.js';

export const THICKNESS_MM = 2.0;

const part = plateFromSTL({
  trace: TRACE,
  id: 'top-plate',
  index: 4,
  name: 'Top-plate',
  thickness: THICKNESS_MM,
  source: 'contour extrait du fichier topplate.stl fourni',
});

export const { trace, build, buildFromTrace, blueprint, meta } = part;
