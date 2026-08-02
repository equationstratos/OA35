/**
 * PIÈCES 05 / 06 — Flancs gauche et droit.
 *
 * Importés tels quels du fichier STEP fourni (Creo Parametric), pas tracés
 * depuis une photo : ce ne sont pas des plaques planes mais des coques qui
 * viennent se caler sur les entretoises latérales. Le flanc droit est le
 * miroir en X du gauche — un seul fichier pour les deux.
 *
 * L'assemblage par clic sur perçage (js/assembly.js) suppose un contour de
 * plaque et ne s'applique pas ici : la pièce se positionne par les curseurs
 * de la barre d'outils, ou reste sur l'établi en attendant un mécanisme de
 * calage dédié aux entretoises.
 */

import { meshPart } from './mesh-asset.js';

const URL = 'assets/parts-3d/flanc-gauche.stl';
const MATERIAL = 'Plastique imprimé (import STEP)';

export const gauche = await meshPart({
  url: URL,
  id: 'flanc-gauche',
  index: 5,
  name: 'Flanc gauche',
  material: MATERIAL,
  source: 'fichier STEP importé (Creo Parametric)',
});

export const droit = await meshPart({
  url: URL,
  id: 'flanc-droit',
  index: 6,
  name: 'Flanc droit',
  material: MATERIAL,
  source: 'miroir du flanc gauche (fichier STEP importé)',
  mirrored: true,
});
