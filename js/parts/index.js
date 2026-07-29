/**
 * Registre des pièces du build.
 * Chaque nouvelle pièce fournie sera ajoutée ici (un module = une pièce).
 */

import * as bottomPlate from './01-bottom-plate.js';
import * as flancGauche from './09-flanc-gauche.js';
import * as flancDroit from './10-flanc-droit.js';
import * as clampPlate from './11-clamp-plate.js';

export const PARTS = [bottomPlate, flancGauche, flancDroit, clampPlate];

/** Emplacements réservés — remplis au fur et à mesure des pièces envoyées. */
export const PLANNED = [
  { index: 2, name: 'Bras arrière (longs)' },
  { index: 3, name: 'Bras avant (courts)' },
  { index: 4, name: 'Moteurs' },
  { index: 5, name: 'Hélices' },
  { index: 6, name: 'Contrôleur de vol (FC)' },
  { index: 7, name: 'Caméra FPV' },
  { index: 8, name: 'VTX + antenne' },
  { index: 9, name: 'Canopy / support caméra' },
  { index: 10, name: 'Batterie' },
];
