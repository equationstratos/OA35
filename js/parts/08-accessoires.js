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
  // Les deux fichiers de capot contiennent CHACUN DEUX coques distinctes, un
  // flanc gauche et un flanc droit, écartés de 33,5 mm (cover 01) et 23,6 mm
  // (cover 02). Les charger d'un bloc en faisait une seule pièce rigide dont
  // l'écartement était figé : impossible de la loger, et impossible de placer
  // un flanc sans l'autre. Les coques ont été séparées à la source (fichiers
  // `cover-0x-gauche.stl` / `-droite.stl`, obtenus par découpe en composantes
  // connexes, aucune modification de géométrie) et chacune est une pièce.
  //
  // Le COVER 01 n'est plus monté ici : il est passé dans 09-side-guard.js, qui
  // fournit les deux mêmes pièces — mêmes identifiants, mêmes numéros — avec
  // le choix de leur habillage. Le remonter ici en ferait un doublon.
  meshPart({
    url: 'assets/parts-3d/cover-02-gauche.stl',
    id: 'cover-02-g', index: 20, name: 'Cover 02 gauche',
    material: PRINTED, source: 'coque gauche de oasisfly35 DC-Cover-02.stl',
  }),
  meshPart({
    url: 'assets/parts-3d/cover-02-droite.stl',
    id: 'cover-02-d', index: 21, name: 'Cover 02 droit',
    material: PRINTED, source: 'coque droite de oasisfly35 DC-Cover-02.stl',
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
    // les joues du support sont chanfreinées : sur la pièce réelle, l'angle
    // d'usinage accroche la lumière et dessine un filet clair tout autour du
    // contour et des ouvertures
    chamfer: true,
  }),
  // le support caméra va par paire, une joue de chaque côté : même fichier,
  // miroir en X, comme les deux flancs
  meshPart({
    url: 'assets/FRAME/OA35-camera-mount.STL',
    id: 'camera-mount-mirror', index: 15, name: 'Support caméra (miroir)',
    material: PRINTED, source: 'miroir du support caméra (même fichier STL)',
    mirrored: true,
    chamfer: true,
  }),

  // Cache de vis de la caméra : il vient s'encastrer dans le lamage du DOS de
  // la joue support, à fleur de sa jante, et se verrouille par deux crochets
  // qui traversent l'ouverture d'objectif et reprennent la face avant. Un par
  // joue, donc un par côté.
  //
  // `mirrored` pour le droit, comme la joue qu'il habille : les deux joues
  // sortent du même fichier, la seconde en miroir. Le cache suit la même
  // convention — sans quoi il ne se clipserait que d'un côté.
  //
  // `rides` : le cache n'a pas de place à lui dans le châssis, il est là où
  // est sa joue. Le décalage vient de ce que les deux fichiers sont recentrés
  // chacun sur SON encombrement, alors qu'ils partagent le même repère à la
  // source. Joue : 41,59 × 7,37 × 29,69, donc recentrage (−20,795 ; −3,685 ; 0).
  // Cache : x 0,09..33,51, y −0,95..4,00, z 4,71..26,39, donc (−16,80 ; −1,525 ;
  // −4,71). L'écart en repère fichier vaut (−3,995 ; −2,16 ; 4,71) ; la bascule
  // Z haut → Y haut le donne en (x, z, −y), soit (−3,995 ; 4,71 ; 2,16).
  // Le côté droit est le miroir en X : seul le premier terme change de signe.
  meshPart({
    url: 'assets/parts-3d/oa35-cache-vis-camera.stl',
    id: 'cache-vis-cam-g', index: 22, name: 'Cache vis caméra gauche',
    material: PRINTED, source: 'dessiné sur le lamage de OA35-camera-mount.STL',
    rides: { host: 'camera-mount', offset: [-3.995, 4.71, 2.16] },
  }),
  meshPart({
    url: 'assets/parts-3d/oa35-cache-vis-camera.stl',
    id: 'cache-vis-cam-d', index: 23, name: 'Cache vis caméra droit',
    material: PRINTED, source: 'miroir du cache gauche (même fichier STL)',
    mirrored: true,
    rides: { host: 'camera-mount-mirror', offset: [3.995, 4.71, 2.16] },
  }),

  // Patins de bras : un par bras, donc quatre exemplaires du même fichier.
  // Pas de miroir — l'empreinte est carrée (17,7 x 17,7 mm) et la pièce est
  // symétrique, la même s'utilise aux quatre coins.
  //
  // zUp: false — ce fichier est déjà à plat, épaisseur 8,7 mm sur Y (mesuré :
  // les grandes faces sont perpendiculaires à Y). Lui appliquer la bascule
  // des exports Z haut le dresserait sur la tranche, 17,7 mm de haut.
  //
  // upsideDown: true — le fichier pose sur le plateau sa SEMELLE, la face
  // plate percée des quatre trous M2 (Ø2, entraxe 12 mm en diagonale). Or
  // c'est justement elle qui vient contre le dessous du bras : la béquille
  // creuse (6,1 mm) et la pointe doivent descendre vers le sol. Sans le
  // retournement, le patin monte dans le bras.
  ...FOOTPAD_SLOTS.map(({ id, index, name }) => meshPart({
    url: 'assets/parts-3d/35_footpad_final.STL',
    id, index, name, material: PRINTED, source: 'fichier STL fourni',
    zUp: false, upsideDown: true,
  })),
]);
