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
import * as gpsMount from './10-gps-mount.js';
import { MOTORS } from './11-moteurs.js';
import { PROPS } from './12-helices.js';
import { DJI_PARTS } from './13-dji.js';

export const PARTS = [
  bottomPlate, middlePlate, clampPlate, topPlate,
  armLong.gauche, armLong.droit,
  armShort.gauche, armShort.droit,
  // les covers latéraux viennent en tête des accessoires, à la place qu'ils
  // occupaient quand 08-accessoires.js les montait encore
  sideGuard.gauche, sideGuard.droit,
  // le support GPS vient à la place qu'il occupait dans les accessoires
  gpsMount.support,
  ...ACCESSORIES,
  ...MOTORS,
  ...PROPS,
  ...DJI_PARTS,
];

/** Emplacements réservés — remplis au fur et à mesure des pièces envoyées. */
export const PLANNED = [
  // Moteurs et hélices ne sont plus des emplacements réservés : ils sont
  // modélisés (11-moteurs.js, 12-helices.js). Leurs anciens numéros, 20 et 21,
  // étaient d'ailleurs déjà pris par les covers 02.
  // La caméra, l'émetteur et les deux antennes ne sont plus des emplacements
  // réservés : ils sont modélisés (13-dji.js), d'après les fichiers STEP du
  // constructeur. Restent le contrôleur de vol et la batterie.
  { index: 22, name: 'Contrôleur de vol (FC)' },
  { index: 25, name: 'Batterie' },
];
