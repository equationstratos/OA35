/**
 * PIÈCE 05 — Flanc gauche.
 *
 * Importée telle quelle depuis le fichier STEP fourni (Creo Parametric),
 * pas tracée depuis une photo : ce n'est pas une plaque plane, mais une
 * coque qui vient se caler sur les entretoises latérales.
 *
 * L'assemblage par clic sur perçage (js/assembly.js) suppose un contour de
 * plaque et ne s'applique pas ici : la pièce se positionne par les boutons
 * Dessus/Dessous une fois calée manuellement, ou reste sur l'établi en
 * attendant un mécanisme de calage dédié aux entretoises.
 */

import { GEOMETRY, BOUNDS } from './side-panel-asset.js';
import { meshPartObject } from '../lib/mesh-part.js';
import { printedMaterial } from '../lib/materials.js';
import { mirrorGeometryX } from '../lib/stl-loader.js';

/**
 * Le fichier Creo est en repère Z "haut" ; la scène est Y "haut", -Z vers
 * l'avant — la même rotation que js/lib/plate.js applique aux plaques
 * tracées, pour que toutes les pièces du build partagent une orientation.
 */
function orient(group) {
  group.rotation.x = -Math.PI / 2;
  return group;
}

export function build(mirrored = false) {
  const geo = mirrored ? mirrorGeometryX(GEOMETRY) : GEOMETRY;
  return orient(meshPartObject(geo, printedMaterial()));
}

export const meta = {
  id: 'flanc-gauche',
  index: 5,
  name: 'Flanc gauche',
  material: 'Plastique imprimé (import STEP)',
  stackHeight: 0,
  isMesh: true,      // panneau importé : pas de contour de perçages exploitable
  source: 'fichier STEP importé (Creo Parametric)',
  dims: {
    length: BOUNDS.size[0],
    width: BOUNDS.size[1],
    thickness: BOUNDS.size[2],
  },
};
