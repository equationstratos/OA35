/**
 * PIÈCE 03 — Clamp-plate.
 *
 * Contour et perçages extraits directement du fichier clampplate.stl fourni
 * (déjà en millimètres réels). La fiche technique du châssis ne donne pas de
 * cote propre au clamp : l'épaisseur ci-dessous est relevée sur le fichier,
 * pas une valeur de la spec.
 */

import { TRACE } from './contour-clamp-plate.js';
import { plateFromSTL } from './plate-from-stl.js';

export const THICKNESS_MM = 2.5;

const part = plateFromSTL({
  trace: TRACE,
  id: 'clamp-plate',
  index: 3,
  name: 'Clamp-plate',
  thickness: THICKNESS_MM,
  source: 'contour extrait du fichier clampplate.stl fourni',
});

export const { trace, build, buildFromTrace, blueprint, meta } = part;
