/**
 * Registre des pièces du build.
 * Chaque nouvelle pièce fournie sera ajoutée ici (un module = une pièce).
 */

import * as bottomPlate from './01-bottom-plate.js';
import * as middlePlate from './02-middle-plate.js';
import * as clampPlate from './03-clamp-plate.js';
import * as topPlate from './04-top-plate.js';
import * as flancGauche from './05-flanc-gauche.js';
import * as flancDroit from './06-flanc-droit.js';

export const PARTS = [bottomPlate, middlePlate, clampPlate, topPlate, flancGauche, flancDroit];

/** Emplacements réservés — remplis au fur et à mesure des pièces envoyées. */
export const PLANNED = [
  { index: 7, name: 'Bras arrière (longs)' },
  { index: 8, name: 'Bras avant (courts)' },
  { index: 9, name: 'Moteurs' },
  { index: 10, name: 'Hélices' },
  { index: 11, name: 'Contrôleur de vol (FC)' },
  { index: 12, name: 'Caméra FPV' },
  { index: 13, name: 'VTX + antenne' },
  { index: 14, name: 'Canopy / support caméra' },
  { index: 15, name: 'Batterie' },
];
