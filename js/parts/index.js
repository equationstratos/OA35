/**
 * Registre des pièces du build.
 * Chaque nouvelle pièce fournie sera ajoutée ici (un module = une pièce).
 *
 * Les flancs (05-flancs.js) ont été retirés du build : ils venaient d'un
 * fichier STEP d'essai, ne se montent sur rien dans ce châssis, et
 * revenaient dans la liste à chaque reconstruction. Le module et son STL
 * restent dans le dépôt, simplement plus référencés ici.
 */

import * as bottomPlate from './01-bottom-plate.js';
import * as middlePlate from './02-middle-plate.js';
import * as clampPlate from './03-clamp-plate.js';
import * as topPlate from './04-top-plate.js';
import * as armLong from './06-arm-long.js';
import * as armShort from './07-arm-short.js';
import { ACCESSORIES } from './08-accessoires.js';
import * as sideGuard from './09-side-guard.js';

export const PARTS = [
  bottomPlate, middlePlate, clampPlate, topPlate,
  armLong.gauche, armLong.droit,
  armShort.gauche, armShort.droit,
  // les covers latéraux viennent en tête des accessoires, à la place qu'ils
  // occupaient quand 08-accessoires.js les montait encore
  sideGuard.gauche, sideGuard.droit,
  ...ACCESSORIES,
];

/** Emplacements réservés — remplis au fur et à mesure des pièces envoyées. */
export const PLANNED = [
  { index: 20, name: 'Moteurs' },
  { index: 21, name: 'Hélices' },
  { index: 22, name: 'Contrôleur de vol (FC)' },
  { index: 23, name: 'Caméra FPV' },
  { index: 24, name: 'VTX + antenne' },
  { index: 25, name: 'Batterie' },
];
