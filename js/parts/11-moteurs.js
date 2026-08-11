/**
 * PIÈCES 25 à 28 — Les quatre moteurs.
 *
 * Contrairement à toutes les autres pièces du build, le moteur n'est ni
 * importé d'un STL ni tracé sur une photo : il est DESSINÉ, cote par cote,
 * d'après les photos du fabricant (js/lib/motor.js). Ce qui s'y voit — les six
 * ouvertures cerclées de turquoise, le moyeu à quatre perçages, le fût gravé,
 * le stator bobiné, l'embase en croix, les trois fils — est reproduit ; le
 * reste, roulements et circlip, est enfermé dans la cloche et ne se voit pas.
 *
 * QUATRE PIÈCES, UN SEUL MAILLAGE. Les quatre moteurs sont identiques : la
 * géométrie est construite une fois et partagée. Seules les matières sont
 * dupliquées, pour que teinter un moteur ne teinte pas les trois autres.
 *
 * PAS DE MIROIR. Le bouton reste sans effet ici, et c'est voulu : un moteur
 * n'a pas de côté gauche ni de côté droit — les quatre exemplaires sont la
 * même référence, c'est le sens de rotation programmé dans l'ESC qui les
 * distingue, pas leur géométrie. Un miroir retournerait aussi le lettrage du
 * fût, qui se lirait à l'envers.
 */

import { meshPartObject } from '../lib/mesh-part.js';
import { buildMotor, MOTOR, motorHeight } from '../lib/motor.js';

const MATERIAL = 'Moteur brushless';

// construit UNE fois : quatre appels donneraient quatre fois le même maillage
const { geometry, materials, anchors, dims } = buildMotor();

/** Emplacements, nommés d'après le bras qui les porte. */
const SLOTS = [
  { id: 'motor-ar-l', index: 25, name: 'Moteur arrière gauche' },
  { id: 'motor-ar-r', index: 26, name: 'Moteur arrière droit' },
  { id: 'motor-av-l', index: 27, name: 'Moteur avant gauche' },
  { id: 'motor-av-r', index: 28, name: 'Moteur avant droit' },
];

function motorPart({ id, index, name }) {
  // matières propres à cet exemplaire : la géométrie est partagée, pas la
  // teinte. `clone()` recopie aussi userData, donc `fixedTint` et `baseTint`
  // suivent — sans quoi le cuivre redeviendrait repeignable.
  const mats = materials.map((m) => m.clone());

  return {
    build() {
      const group = meshPartObject(geometry, mats, anchors);
      // le moteur est dessiné en repère Z haut, comme un export CAO
      group.rotation.x = -Math.PI / 2;
      return group;
    },
    meta: {
      id,
      index,
      name,
      material: MATERIAL,
      stackHeight: 0,
      isMesh: true,
      missingAsset: null,
      source: `${MOTOR.designation} ${MOTOR.kv} KV — dessiné d'après les photos du fabricant`,
      rides: null,
      dims,
    },
  };
}

export const MOTORS = SLOTS.map(motorPart);
export { MOTOR, motorHeight };
