/**
 * Registre des pièces du build.
 * Chaque nouvelle pièce fournie sera ajoutée ici (un module = une pièce).
 */

import * as bottomPlate from './01-bottom-plate.js';
import * as middlePlate from './02-middle-plate.js';
import * as clampPlate from './03-clamp-plate.js';
import * as topPlate from './04-top-plate.js';
import * as flancs from './05-flancs.js';
import * as armLong from './06-arm-long.js';
import * as armShort from './07-arm-short.js';
import { ACCESSORIES } from './08-accessoires.js';

export const PARTS = [
  bottomPlate, middlePlate, clampPlate, topPlate,
  flancs.gauche, flancs.droit,
  armLong.gauche, armLong.droit,
  armShort.gauche, armShort.droit,
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
