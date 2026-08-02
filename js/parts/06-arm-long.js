/**
 * PIÈCES 06 — Bras arrière (les longs).
 *
 * Sur ce châssis dead-cat, ce sont les bras ARRIÈRE qui sont les plus longs
 * (101,5 mm contre 79,4 mm à l'avant). Les fichiers arm-long1 et arm-long2
 * sont le miroir exact l'un de l'autre en X (vérifié sommet par sommet) :
 * un seul contour est donc extrait, le second bras est son miroir.
 *
 * Épaisseur 3,5 mm, conforme à la fiche technique (Arm Thickness: 3.5 mm).
 */

import { TRACE } from './contour-arm-long.js';
import { plateFromSTL } from './plate-from-stl.js';

export const THICKNESS_MM = 3.5;

const common = {
  trace: TRACE,
  thickness: THICKNESS_MM,
  source: 'contour extrait du fichier arm-long1.stl fourni',
};

export const gauche = plateFromSTL({
  ...common, id: 'arm-long-l', index: 6, name: 'Bras arrière gauche (long)',
});

export const droit = plateFromSTL({
  ...common, id: 'arm-long-r', index: 7, name: 'Bras arrière droit (long)',
  mirrored: true,
});
