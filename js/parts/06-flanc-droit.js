/**
 * PIÈCE 06 — Flanc droit.
 *
 * Symétrique du flanc gauche (js/parts/05-flanc-gauche.js) : même maillage,
 * miroir en X. Les deux flancs sont posés en même temps — contrairement au
 * bouton Miroir du panneau latéral, qui remplace l'orientation d'UNE pièce,
 * un châssis dead-cat porte les deux côtés en même temps.
 */

import { GEOMETRY, BOUNDS, LOAD_ERROR } from './side-panel-asset.js';
import { meshPartObject } from '../lib/mesh-part.js';
import { printedMaterial } from '../lib/materials.js';
import { mirrorGeometryX } from '../lib/stl-loader.js';

function orient(group) {
  group.rotation.x = -Math.PI / 2;
  return group;
}

// mirrored=false ici reproduit l'apparence "droite" par défaut ; le bouton
// Miroir du panneau la fait donc revenir à l'orientation du flanc gauche,
// ce qui reste cohérent avec son intitulé (symétrie de LA pièce sélectionnée)
export function build(mirrored = false) {
  const geo = mirrored ? GEOMETRY : mirrorGeometryX(GEOMETRY);
  return orient(meshPartObject(geo, printedMaterial()));
}

export const meta = {
  id: 'flanc-droit',
  index: 6,
  name: 'Flanc droit',
  material: 'Plastique imprimé (import STEP)',
  stackHeight: 0,
  isMesh: true,
  missingAsset: LOAD_ERROR,
  source: 'miroir du flanc gauche (fichier STEP importé)',
  dims: {
    length: BOUNDS.size[0],
    width: BOUNDS.size[1],
    thickness: BOUNDS.size[2],
  },
};
