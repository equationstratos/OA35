/**
 * PIÈCES 29 à 32 — Les quatre hélices.
 *
 * Dessinées, comme les moteurs (js/lib/prop.js). Tripale de 3,5 pouces au pas
 * de 2,5 : la taille vient du châssis — un OasisFly**35** de 175 mm
 * d'empattement —, pas d'une photo. C'est la seule pièce du build qui n'ait
 * pas de référence sous les yeux, et c'est dit dans sa fiche.
 *
 * DEUX SENS DE ROTATION. Sur un quadricoptère, les hélices d'une diagonale
 * tournent dans un sens et celles de l'autre dans l'autre, sinon l'appareil
 * part en toupie. Les deux versions ne sont pas la même pièce retournée : le
 * vrillage et la flèche changent de signe, ce qui donne une vraie pale gauche.
 * Un miroir de maillage aurait retourné les normales, et l'hélice serait
 * sortie noire à l'écran.
 *
 * DEUX MAILLAGES, QUATRE PIÈCES : un par sens, partagé par les deux hélices
 * qui l'utilisent. Seules les matières sont dupliquées, pour que teinter une
 * hélice ne teinte pas sa jumelle.
 */

import { meshPartObject } from '../lib/mesh-part.js';
import { buildProp, PROP } from '../lib/prop.js';

const MATERIAL = 'Polycarbonate';

// un maillage par sens de rotation, construit une seule fois
const HORAIRE = buildProp(1);
const ANTIHORAIRE = buildProp(-1);

/**
 * Diagonales opposées, sens opposés — la convention habituelle : avant droit
 * et arrière gauche d'un côté, avant gauche et arrière droit de l'autre.
 */
const SLOTS = [
  { id: 'prop-ar-l', index: 29, name: 'Hélice arrière gauche', sens: 1 },
  { id: 'prop-ar-r', index: 30, name: 'Hélice arrière droite', sens: -1 },
  { id: 'prop-av-l', index: 31, name: 'Hélice avant gauche', sens: -1 },
  { id: 'prop-av-r', index: 32, name: 'Hélice avant droite', sens: 1 },
];

function propPart({ id, index, name, sens }) {
  const source = HORAIRE === null ? null : (sens > 0 ? HORAIRE : ANTIHORAIRE);
  const mats = source.materials.map((m) => m.clone());
  const rotation = sens > 0 ? 'horaire' : 'antihoraire';

  return {
    build() {
      const group = meshPartObject(source.geometry, mats, source.anchors);
      // dessinée en repère Z haut, comme les autres pièces construites
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
      source: `tripale 3,5" × 2,5, rotation ${rotation}`
        + ' — dessinée d’après le format du châssis, pas d’une photo',
      rides: null,
      dims: source.dims,
    },
  };
}

export const PROPS = SLOTS.map(propPart);
export { PROP };
