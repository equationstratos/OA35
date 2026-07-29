/**
 * Registre des pièces du build.
 * Chaque nouvelle pièce fournie sera ajoutée ici (un module = une pièce).
 */

import * as bottomPlate from './01-bottom-plate.js';
import * as flancGauche from './09-flanc-gauche.js';
import * as flancDroit from './10-flanc-droit.js';

export const PARTS = [bottomPlate, flancGauche, flancDroit];

/** Emplacements réservés — remplis au fur et à mesure des pièces envoyées. */
export const PLANNED = [
  { index: 2, name: 'Moteurs' },
  { index: 3, name: 'Hélices' },
  { index: 4, name: 'Contrôleur de vol (FC)' },
  { index: 5, name: 'Caméra FPV' },
  { index: 6, name: 'VTX + antenne' },
  { index: 7, name: 'Canopy / support caméra' },
  { index: 8, name: 'Batterie' },
];
