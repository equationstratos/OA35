/**
 * PIÈCES 33 à 36 — L'électronique DJI O4 Pro.
 *
 * Caméra, air unit et les deux antennes VTX. Ces quatre-là ne sont ni des
 * pièces du châssis ni des impressions : ce sont les composants du commerce
 * que le drone embarque, et le châssis n'existe que pour les porter.
 *
 * D'OÙ VIENNENT LES MAILLAGES. Des fichiers STEP **du constructeur**, repris
 * tels quels et jamais redessinés (dépôt equationstratos/stratosdrones,
 * `oasis30/ref/vendor_step/`). Ils sont maillés par gmsh avec une finesse
 * pilotée par la COURBURE : une face plate n'a pas besoin de mille triangles,
 * un congé de rayon 1 mm si. C'est ce qui permet de garder la caméra nette —
 * l'objectif, ses bagues, ses tourillons — sans faire exploser la page.
 *
 * CE QUI EST RETIRÉ des fichiers d'origine, et pourquoi :
 *  - les 148 mm de nappe droite de la caméra : dans le drone elle est pliée,
 *    la dessiner droite la ferait traverser le châssis de part en part ;
 *  - le connecteur MMCX de l'antenne : il n'est pas au support, il est branché
 *    sur l'air unit, à l'autre bout d'un coaxial ;
 *  - les cartes, blindages et micro-connecteurs enfermés dans les coques :
 *    invisibles une fois montés, et ils coûtaient l'essentiel du maillage.
 *
 * ELLES NE SE PEIGNENT PAS. Une livrée repeint le châssis, pas la caméra —
 * personne ne repeint son air unit. Leur matière porte donc `fixedTint`, et
 * le sélecteur de couleur comme les livrées passent leur chemin.
 *
 * ELLES NE SE VISSENT PAS AU SACHET. `noFastener` : leurs perçages sont ceux
 * du constructeur (entraxe 25,5 pour l'air unit, tourillons Ø 2,1 pour la
 * caméra) et n'appellent rien du sachet du châssis. Sans ce drapeau, le
 * détecteur de visserie irait planter des vis dans les bossages moulés.
 */

import { meshPart } from './mesh-asset.js';

const DJI = 'Composant DJI';

/* ------------------------------------------------------------------ *
 * Les alésages d'antenne, relevés sur le support
 *
 * Le support d'antenne VTX (`oasisfly-35-antenne-VTX.stl`) porte QUATRE
 * perçages, et il fallait trouver les bons. Deux fûts verticaux Ø 3,99
 * traversent la pièce de part en part, entraxe 21 — ce sont eux qui la vissent
 * au châssis. Et deux canaux Ø 2,89, eux, partent du cœur de la pièce et
 * s'ouvrent en V sur sa face inclinée : ce sont les logements d'antenne.
 *
 * Leur axe a été ajusté aux moindres carrés sur les faces du perçage (292 et
 * 278 facettes, écart au cylindre 0,03 mm), et le résultat est parfaitement
 * symétrique — c'est ce qui confirme la lecture :
 *
 *     inclinaison sur la verticale   55,5°  et  55,2°
 *     ouverture latérale            −32,9°  et  +32,7°
 *     recul                         +52,5°  et  +52,2°
 *
 * Le fourreau d'antenne fait Ø 3,50 pour un alésage de Ø 2,89 : c'est voulu,
 * la matière serre le fourreau. Les 10 mm enterrés dans le support ne se
 * voient pas ; les 75 mm restants sortent en V, comme sur le drone monté.
 *
 * Les valeurs ci-dessous sont exprimées dans le repère du SUPPORT, pas du
 * monde : la pièce suit son hôte, et si on déplace le support les antennes
 * suivent.
 * ------------------------------------------------------------------ */
const ANTENNES = [
  {
    id: 'antenne-vtx-d', index: 35, name: 'Antenne VTX droite',
    offset: [-1.28, 7.84, 5.63], aim: [-0.3671, 0.5661, -0.7381],
  },
  {
    id: 'antenne-vtx-g', index: 36, name: 'Antenne VTX gauche',
    offset: [1.36, 7.70, 5.60], aim: [0.3662, 0.5703, -0.7353],
  },
];

/**
 * Basculement de la caméra dans sa cage, en radians.
 *
 * 15° vers le haut. Ce n'est pas une cote du châssis — la caméra se règle au
 * montage, elle est serrée entre les deux joues et rien ne fixe son angle. 15°
 * est le compromis qui la laisse entière dans la cage : au-delà, son coin
 * arrière-bas descend sous la plaque de fond, et son objectif dépasse le nez
 * du drone.
 */
export const CAMERA_TILT = 15 * Math.PI / 180;

export const DJI_PARTS = await Promise.all([
  /*
   * LA CAMÉRA — 25,44 × 23,30 × 20,01 mm, cotes lues sur les nœuds du maillage
   * (et non sur la boîte englobante d'OpenCASCADE, majorante sur les faces
   * courbes). Les deux tourillons Ø 2,14 qui l'axent dans la cage sont gardés :
   * ce sont eux qu'on voit sur ses flancs.
   *
   * SON REPÈRE. Le fichier est en Z haut, objectif vers −X. Après la bascule
   * des exports CAO, la pièce a sa profondeur sur X et sa largeur sur Z — il
   * faut donc un quart de tour pour amener sa largeur entre les joues et son
   * objectif vers l'avant du drone. D'où `turn` : d'abord le quart de tour
   * (−90° autour de la verticale), puis le basculement autour de l'axe des
   * tourillons.
   *
   * SA PLACE. Portée par la plaque de fond, qui est l'origine du build : les
   * deux joues, elles, sont posées à plat sur un repère tourné de 88° et
   * retourné, un repère où exprimer un décalage n'apprendrait rien à personne.
   * Le point visé est le CENTRE de la caméra, à (0 ; 15,0 ; −33,0) — cage
   * centrée, objectif affleurant le nez des joues à z = −45,3.
   */
  meshPart({
    url: 'assets/vendor/dji-o4-pro-camera.stl',
    id: 'dji-camera', index: 33, name: 'Caméra DJI O4 Pro',
    material: DJI, finish: 'appareil',
    source: 'DJI_O4_PRO_CAM.step — fichier constructeur, maillé à la courbure',
    noFastener: true, detectAnchors: false,
    rides: {
      host: 'bottom-plate',
      // centre visé (0 ; 15,0 ; −33,0) moins la position du centre dans le
      // repère de la pièce une fois tournée : (0 ; 10,005 ; 0) devient
      // (0 ; 9,664 ; 2,590) sous ces 15°
      offset: [0, 5.336, -35.59],
      turn: [CAMERA_TILT, -Math.PI / 2, 0],
    },
  }),

  /*
   * L'AIR UNIT — 33,42 carré × 13,01 mm, quatre pattes de fixation à l'entraxe
   * 25,5 × 25,5. Cet entraxe recoupe EXACTEMENT le motif relevé sur la plaque
   * intermédiaire, qui porte deux baies, une avant et une arrière, chacune
   * percée aux deux standards (20 × 20 et 25,5 × 25,5).
   *
   * Il va dans la baie ARRIÈRE, centrée à z = +53,4 : c'est celle qui n'est pas
   * au-dessus de la clamp-plate. L'avant, à z = +12,0, tombe pile sur le
   * serrage des bras, donc sur le centre de gravité — c'est la place du
   * contrôleur de vol, pas celle de l'émetteur.
   *
   * DEMI-TOUR. Le connecteur de nappe est sur une seule face du boîtier, et
   * cette face doit regarder la caméra : sans le demi-tour, la nappe part vers
   * la queue et devrait faire le tour du drone. L'USB-C se retrouve alors sur
   * le flanc droit, où il est accessible — comme sur la machine.
   */
  meshPart({
    url: 'assets/vendor/dji-o4-air-unit-pro.stl',
    id: 'dji-air-unit', index: 34, name: 'DJI O4 Air Unit Pro',
    material: DJI, finish: 'appareil',
    source: 'DJI_O4_AIR_UNIT_PRO.step — fichier constructeur, entraxe 25,5',
    noFastener: true, detectAnchors: false,
    rides: {
      host: 'middle-plate',
      // dessus de la plaque (+1,25 sur son origine) et centre de la baie
      // arrière (+20,194 sur son origine)
      offset: [0, 1.25, 20.194],
      turn: [0, Math.PI, 0],
    },
  }),

  /*
   * LES DEUX ANTENNES — fourreau Ø 3,50, 85 mm au-dessus du connecteur.
   * Le maillage est celui d'un seul brin, coupé sous son fourreau et remis sur
   * son axe : il s'instancie deux fois, une par alésage.
   *
   * `aim` plutôt que `turn` : un fourreau rond n'a pas de roulis, seule sa
   * direction compte, et cette direction EST l'axe mesuré de l'alésage. Écrire
   * trois angles d'Euler à la place aurait caché ce que la valeur veut dire.
   */
  ...ANTENNES.map(({ id, index, name, offset, aim }) => meshPart({
    url: 'assets/vendor/dji-o4-pro-antenne.stl',
    id, index, name,
    material: DJI, finish: 'appareil',
    source: 'DJI_O4_Pro_Antenna_v1.step — fichier constructeur, sans connecteur',
    noFastener: true, detectAnchors: false,
    rides: { host: 'vtx-mount', offset, aim },
  })),
]);
