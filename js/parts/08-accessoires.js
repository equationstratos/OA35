/**
 * PIÈCES 08+ — Accessoires imprimés en 3D.
 *
 * Covers, supports GPS / antenne VTX et support caméra, importés tels quels
 * de leurs fichiers STL. Pas de contour ni de perçages à extraire : ce ne
 * sont pas des pièces planes.
 *
 * Les chargements se font en parallèle : ils sont indépendants, les
 * enchaîner ferait attendre le premier rendu pour rien.
 */

import { meshPart } from './mesh-asset.js';

const PRINTED = 'Plastique imprimé';

/** Un patin par bras : nommés d'après le bras qu'ils chaussent. */
const FOOTPAD_SLOTS = [
  { id: 'footpad-ar-l', index: 16, name: 'Patin bras arrière gauche' },
  { id: 'footpad-ar-r', index: 17, name: 'Patin bras arrière droit' },
  { id: 'footpad-av-l', index: 18, name: 'Patin bras avant gauche' },
  { id: 'footpad-av-r', index: 19, name: 'Patin bras avant droit' },
];

export const ACCESSORIES = await Promise.all([
  meshPart({
    url: 'assets/parts-3d/oasisfly35DC-Cover-01.stl',
    id: 'cover-01', index: 10, name: 'Cover 01',
    material: PRINTED, source: 'fichier STL fourni',
  }),
  meshPart({
    url: 'assets/parts-3d/oasisfly35 DC-Cover-02.stl',
    id: 'cover-02', index: 11, name: 'Cover 02',
    material: PRINTED, source: 'fichier STL fourni',
  }),
  meshPart({
    url: 'assets/parts-3d/oasisfly-35-front-GPS-mount.STL',
    id: 'gps-mount', index: 12, name: 'Support GPS avant',
    material: PRINTED, source: 'fichier STL fourni',
  }),
  meshPart({
    url: 'assets/parts-3d/oasisfly-35-antenne-VTX.stl',
    id: 'vtx-mount', index: 13, name: 'Support antenne VTX',
    material: PRINTED, source: 'fichier STL fourni',
  }),
  meshPart({
    url: 'assets/FRAME/OA35-camera-mount.STL',
    id: 'camera-mount', index: 14, name: 'Support caméra',
    material: PRINTED, source: 'fichier STL fourni',
  }),
  // le support caméra va par paire, une joue de chaque côté : même fichier,
  // miroir en X, comme les deux flancs
  meshPart({
    url: 'assets/FRAME/OA35-camera-mount.STL',
    id: 'camera-mount-mirror', index: 15, name: 'Support caméra (miroir)',
    material: PRINTED, source: 'miroir du support caméra (même fichier STL)',
    mirrored: true,
  }),

  // Patins de bras : un par bras, donc quatre exemplaires du même fichier.
  // Pas de miroir — l'empreinte est carrée (17,7 x 17,7 mm) et la pièce est
  // symétrique, la même s'utilise aux quatre coins.
  //
  // zUp: false — ce fichier est déjà à plat, épaisseur 8,7 mm sur Y (mesuré :
  // les grandes faces sont perpendiculaires à Y). Lui appliquer la bascule
  // des exports Z haut le dresserait sur la tranche, 17,7 mm de haut.
  ...FOOTPAD_SLOTS.map(({ id, index, name }) => meshPart({
    url: 'assets/parts-3d/35_footpad_final.STL',
    id, index, name, material: PRINTED, source: 'fichier STL fourni',
    zUp: false,
  })),
]);
