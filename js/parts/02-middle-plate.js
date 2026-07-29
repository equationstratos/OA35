/**
 * PIÈCE 02 — Middle-plate.
 *
 * C'est la toute première pièce du projet : à l'origine tracée depuis une
 * photo (voir l'historique de contour-piece-01.js), puis elle avait pris par
 * erreur le nom « bottom-plate ». Le fichier middleplate.stl fourni plus
 * tard, une fois comparé (mêmes perçages à 0,22 mm près de la version
 * tracée), s'est révélé être la même pièce physique — mais c'est bien la
 * middle-plate du châssis, pas la bottom. Le contour vient maintenant
 * directement de ce fichier, en remplacement du tracé photo.
 */

import { TRACE } from './contour-middle-plate.js';
import { plateFromSTL } from './plate-from-stl.js';

export const THICKNESS_MM = 2.5;

const part = plateFromSTL({
  trace: TRACE,
  id: 'middle-plate',
  index: 2,
  name: 'Middle-plate',
  thickness: THICKNESS_MM,
  source: 'contour extrait du fichier middleplate.stl fourni',
});

export const { trace, build, buildFromTrace, blueprint, meta } = part;
