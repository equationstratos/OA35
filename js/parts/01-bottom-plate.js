/**
 * PIÈCE 01 — Plaque intermédiaire du châssis carbone.
 * Base du build "TinyHoop MK1".
 *
 * La géométrie n'est pas saisie à la main : elle vient du tracé de la photo
 * de la pièce, figé dans ./contour-piece-01.js (coordonnées en pixels de
 * l'image source, générées par l'onglet Calibration).
 *
 * Pour la mettre à jour : onglet Calibration -> Tracer -> Exporter le contour,
 * puis remplacer contour-piece-01.js. Ce fichier-ci n'a pas à changer.
 */

import * as CONTOUR from './contour-piece-01.js';
import { traceToMm } from '../lib/trace.js';
import { plateFromTrace, blueprintFromTrace } from '../lib/plate.js';

/** Longueur hors-tout réelle de la plaque, en mm : seul réglage d'échelle. */
export const REF_LENGTH_MM = CONTOUR.REF_LENGTH_MM;

/** Épaisseur du carbone, en mm. */
export const THICKNESS_MM = CONTOUR.THICKNESS_MM;

/** Tracé converti en millimètres, pièce centrée sur l'origine. */
const TRACE = traceToMm(
  { bbox: CONTOUR.BBOX, outline: CONTOUR.OUTLINE_PX, holes: CONTOUR.HOLES_PX },
  REF_LENGTH_MM,
);

/** Tracé en millimètres, exposé pour l'export. */
export const trace = TRACE;

/** Objet 3D prêt à poser dans la scène (plaque à plat, avant vers -Z). */
export function build(mirrored = false) {
  return plateFromTrace(TRACE, THICKNESS_MM, mirrored);
}

/** Reconstruction depuis un nouveau tracé, sans toucher au fichier de contour. */
export function buildFromTrace(traceMm) {
  return plateFromTrace(traceMm, THICKNESS_MM);
}

/** Données 2D en mm, pour le plan coté. */
export function blueprint() {
  return blueprintFromTrace(TRACE);
}

export const meta = {
  id: 'bottom-plate',
  index: 1,
  // porte les deux motifs de fixation du contrôleur de vol, donc la plaque
  // intermédiaire d'après la fiche technique (le nom de fichier est d'origine)
  name: 'Plaque intermédiaire châssis',
  material: 'Carbone 3K sergé, ' + THICKNESS_MM.toFixed(1) + ' mm',
  stackHeight: 0,        // altitude Y dans le build, en mm
  traced: true,          // contour issu de la photo, pas d'une saisie manuelle
  source: `photo ${CONTOUR.BBOX.width} x ${CONTOUR.BBOX.height} px`,
  dims: {
    length: TRACE.height,
    width: TRACE.width,
    thickness: THICKNESS_MM,
    mmPerPx: TRACE.mmPerPx,
    holes: TRACE.holes.length,
  },
};
