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

/**
 * DEUX MAILLAGES, PAS UN. Les moteurs sont identiques, mais pas leurs fils :
 * le brin qui court sur le bras jusqu'au châssis est plus long à l'arrière,
 * où les bras le sont aussi (101,7 mm contre 79,6 à l'avant). Un brin unique
 * pendait dans le vide d'un côté ou s'arrêtait à mi-bras de l'autre.
 *
 * Les longueurs sont mesurées sur les bras : du bord de la cloche jusqu'au
 * châssis, sous le cover, là où les fils plongent dans les deux fentes de la
 * plaque inférieure.
 */
const ARRIERE = buildMotor({ wireRun: 62 });
const AVANT = buildMotor({ wireRun: 44 });

/** Emplacements, nommés d'après le bras qui les porte. */
const SLOTS = [
  { id: 'motor-ar-l', index: 25, name: 'Moteur arrière gauche', jeu: ARRIERE },
  { id: 'motor-ar-r', index: 26, name: 'Moteur arrière droit', jeu: ARRIERE },
  { id: 'motor-av-l', index: 27, name: 'Moteur avant gauche', jeu: AVANT },
  { id: 'motor-av-r', index: 28, name: 'Moteur avant droit', jeu: AVANT },
];

function motorPart({ id, index, name, jeu }) {
  const { geometry, materials, anchors, dims } = jeu;
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
      /**
       * VISSÉ PAR LE DESSOUS. La vis moteur monte à travers le bras et se
       * visse dans la semelle : sa tête est SOUS le bras, pas sur le moteur.
       * Sans ce drapeau, le détecteur de visserie — qui ne connaît que la vis
       * posée par le dessus — plantait une tête de vis au sommet de la cloche.
       */
      underslung: true,
      /**
       * SES VIS NE SORTENT PAS DU SACHET DU CHÂSSIS — ni les quatre de sa
       * semelle, ni les deux qui tiennent l'hélice sur son moyeu. Le sachet
       * saute d'ailleurs de M2×8 à M2×12, sans rien entre les deux, alors
       * qu'il faut ici du M2×10 : ces vis-là viennent avec le moteur.
       *
       * Les deux taraudages, eux, sont déclarés sur les ANCRES (js/lib/motor.js) :
       * celui de la semelle et celui du moyeu ne sont ni à la même hauteur ni
       * de la même profondeur, une déclaration unique pour toute la pièce les
       * aurait confondus.
       */
      ownFasteners: true,
      missingAsset: null,
      source: `${MOTOR.designation} ${MOTOR.kv} KV — dessiné d'après les photos du fabricant`,
      rides: null,
      dims,
    },
  };
}

export const MOTORS = SLOTS.map(motorPart);
export { MOTOR, motorHeight };
