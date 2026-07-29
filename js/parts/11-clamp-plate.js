/**
 * PIÈCE 11 — Clamp-plate.
 *
 * Contrairement à la plaque intermédiaire, le contour ne vient pas d'une
 * photo tracée : le fichier fourni (clampplate.stl) est déjà une géométrie
 * 3D en millimètres réels. Le contour et les perçages sont donc extraits
 * directement de son maillage (js/parts/contour-clamp-plate.js), sans passer
 * par js/lib/trace.js — il n'y a rien à calibrer, l'échelle est déjà la
 * bonne.
 *
 * L'épaisseur (2,5 mm) est celle mesurée sur le fichier fourni ; la fiche
 * technique du châssis ne donne pas de valeur propre au clamp, ce n'est donc
 * pas une cote de la spec mais une cote relevée.
 */

import { TRACE } from './contour-clamp-plate.js';
import { plateFromTrace, blueprintFromTrace } from '../lib/plate.js';

export const THICKNESS_MM = 2.5;

export const trace = TRACE;

export function build(mirrored = false) {
  return plateFromTrace(TRACE, THICKNESS_MM, mirrored);
}

export function buildFromTrace(traceMm) {
  return plateFromTrace(traceMm, THICKNESS_MM);
}

export function blueprint() {
  return blueprintFromTrace(TRACE);
}

export const meta = {
  id: 'clamp-plate',
  index: 11,
  name: 'Clamp-plate',
  material: 'Carbone, ' + THICKNESS_MM.toFixed(1) + ' mm',
  stackHeight: 0,
  traced: true,
  source: 'contour extrait du fichier clampplate.stl fourni',
  dims: {
    length: TRACE.height,
    width: TRACE.width,
    thickness: THICKNESS_MM,
    mmPerPx: TRACE.mmPerPx,
    holes: TRACE.holes.length,
  },
};
