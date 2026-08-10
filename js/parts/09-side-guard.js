/**
 * PIÈCES 10 / 11 — Cover latéral gauche et droit, et ses habillages.
 *
 * Ce module REMPLACE les deux entrées « Cover 01 » de 08-accessoires.js : il
 * reprend leurs identifiants (`cover-01-g`, `cover-01-d`) et leurs numéros, si
 * bien qu'une position ou un assemblage déjà enregistrés pour ces pièces
 * restent valables. Le cover latéral n'existe qu'en un exemplaire par côté, il
 * n'y a donc pas de pièce en plus dans le build : ce sont les mêmes deux
 * pièces, à qui on donne le choix de leur habillage.
 *
 * Neuf habillages, deux origines et sept dérivés :
 *
 *  - COVER 01, la coque fournie dans `oasisfly35DC-Cover-01.stl`, montée par
 *    défaut pour que le build reste identique tant qu'on n'a rien choisi.
 *  - SIDE GUARD, `OasisFly35 DC Side guard .stl` : la même coque en version
 *    longue (104,7 mm au lieu de 71,9), avec la queue et son ouïe ovale. Les
 *    deux silhouettes se superposent sur toute leur longueur commune.
 *  - les SEPT HABILLAGES, tous dérivés du side guard.
 *
 * Ces sept-là partagent au micron près l'encombrement du side guard, son
 * épaisseur de paroi (1,55 mm) et toutes ses surfaces de montage : ergots,
 * épaulements, nervures et perçage ovale ne sont touchés par aucun motif.
 *
 * Deux familles :
 *
 *  - PERCÉS. Le motif traverse la joue, uniquement là où la coque est une
 *    paroi simple de 0,9 à 2,6 mm et à plus de 0,9 mm de tout bord ou de toute
 *    zone épaisse. Les triangles d'origine ne sont pas remaillés, ils sont
 *    découpés exactement sur le contour des ouvertures.
 *
 *  - EN RELIEF. Rien n'est percé : la face externe (celle qui ne porte pas les
 *    nervures) est déplacée vers l'extérieur d'un demi-millimètre par un champ
 *    de hauteur. L'épaisseur locale ne peut qu'augmenter, et le motif s'efface
 *    avant les bords et les arêtes vives.
 *
 * Chaque côté choisit son habillage indépendamment de l'autre.
 */

import { styledMeshPart } from './mesh-asset.js';

const DIR = 'assets/parts-3d/side-guard';
const MATERIAL = 'Plastique imprimé';

/**
 * Les deux exports ne sont PAS dans le même repère, et c'est ce qui se voyait
 * le plus vite : le cover 01 porte sa longueur sur Y et tourne sa face externe
 * vers −X, le side guard porte la sienne sur X et regarde vers −Y. Passer de
 * l'un à l'autre faisait donc pivoter la pièce d'un quart de tour sur place.
 *
 * D'où le quart de tour de recalage sur les sept habillages et sur le side
 * guard : −90° autour de la verticale amène leur longueur sur Y et leur face
 * externe vers −X, exactement comme le cover 01. Le repère commun sert aussi
 * au bouton Miroir, qui travaille toujours en X : une fois l'épaisseur ramenée
 * sur X, il donne bien un symétrique gauche/droite.
 *
 * Les deux fichiers d'origine existent DÉJÀ par côté (coques gauche et droite
 * séparées à la source), alors que les sept habillages sont tous dérivés du
 * flanc gauche. D'où le miroir par style plutôt que par pièce : sans lui, le
 * cover droit se retrouvait soit avec un habillage à l'envers, soit avec une
 * origine retournée.
 */
const RECALAGE = -Math.PI / 2;

function stylesFor(side) {
  const mirror = side === 'droite';
  return [
    {
      id: 'cover-01',
      name: 'Cover 01',
      url: `assets/parts-3d/cover-01-${side}.stl`,
      mirrored: false,
      note: 'coque fournie, version courte — 71,9 mm, 2,30 cm³',
    },
    {
      id: 'side-guard',
      name: 'Side guard',
      url: 'assets/parts-3d/OasisFly35 DC Side guard .stl',
      mirrored: mirror,
      spin: RECALAGE,
      note: 'coque fournie, version longue — 104,7 mm, 2,746 cm³, 3,40 g en PLA',
    },
    {
      id: 'nid-abeille',
      name: 'Nid d’abeille',
      url: `${DIR}/side-guard-nid-abeille.stl`,
      mirrored: mirror,
      spin: RECALAGE,
      anchorsFrom: 'side-guard',
      note: 'percé — 13 alvéoles de 5,2 mm entre plats, cloisons 1,7 mm, −17,5 % de matière',
    },
    {
      id: 'persiennes',
      name: 'Persiennes',
      url: `${DIR}/side-guard-persiennes.stl`,
      mirrored: mirror,
      spin: RECALAGE,
      anchorsFrom: 'side-guard',
      note: 'percé — 8 fentes obliques de 2,7 mm à 62°, −17,3 % de matière',
    },
    {
      id: 'treillis',
      name: 'Treillis',
      url: `${DIR}/side-guard-treillis.stl`,
      mirrored: mirror,
      spin: RECALAGE,
      anchorsFrom: 'side-guard',
      note: 'percé — 18 triangles alternés, cloisons 2,2 mm, −12,1 % de matière',
    },
    {
      id: 'skull',
      name: 'Skull',
      url: `${DIR}/side-guard-skull.stl`,
      mirrored: mirror,
      spin: RECALAGE,
      anchorsFrom: 'side-guard',
      note: 'relief plein — crâne de face, 0,66 mm de saillie, orbites et dents gravées',
    },
    {
      id: 'shark',
      name: 'Shark',
      url: `${DIR}/side-guard-shark.stl`,
      mirrored: mirror,
      spin: RECALAGE,
      anchorsFrom: 'side-guard',
      note: 'relief plein — requin de profil sur 44 mm, 0,62 mm de saillie, branchies gravées',
    },
    {
      id: 'circuit',
      name: 'Circuit',
      url: `${DIR}/side-guard-circuit.stl`,
      mirrored: mirror,
      spin: RECALAGE,
      anchorsFrom: 'side-guard',
      note: 'relief plein — routage de circuit imprimé, pistes de 0,9 mm, 0,52 mm de saillie',
    },
    {
      id: 'carbone',
      name: 'Carbone tressé',
      url: `${DIR}/side-guard-carbone.stl`,
      mirrored: mirror,
      spin: RECALAGE,
      anchorsFrom: 'side-guard',
      note: 'relief plein — tissage à ±45° couvrant toute la joue, 0,46 mm de saillie',
    },
  ];
}

export const gauche = await styledMeshPart({
  styles: stylesFor('gauche'),
  id: 'cover-01-g',
  index: 10,
  name: 'Cover 01 gauche',
  material: MATERIAL,
});

export const droit = await styledMeshPart({
  styles: stylesFor('droite'),
  id: 'cover-01-d',
  index: 11,
  name: 'Cover 01 droit',
  material: MATERIAL,
});
