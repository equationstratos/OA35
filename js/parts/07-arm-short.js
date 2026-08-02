/**
 * PIÈCES 07 — Bras avant (les courts).
 *
 * 79,4 mm contre 101,5 mm à l'arrière : c'est ce qui fait la géométrie
 * dead-cat, hélices avant écartées du champ de la caméra. arm-short1 et
 * arm-short2 sont le miroir exact l'un de l'autre en X (vérifié sommet par
 * sommet), un seul contour est donc extrait.
 *
 * Épaisseur 3,5 mm, conforme à la fiche technique (Arm Thickness: 3.5 mm).
 */

import { TRACE } from './contour-arm-short.js';
import { plateFromSTL } from './plate-from-stl.js';

export const THICKNESS_MM = 3.5;

const common = {
  trace: TRACE,
  thickness: THICKNESS_MM,
  source: 'contour extrait du fichier arm-short1.stl fourni',
};

export const gauche = plateFromSTL({
  ...common, id: 'arm-short-l', index: 8, name: 'Bras avant gauche (court)',
});

export const droit = plateFromSTL({
  ...common, id: 'arm-short-r', index: 9, name: 'Bras avant droit (court)',
  mirrored: true,
});
