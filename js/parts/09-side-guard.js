/**
 * PIÈCE 09 — Side guard (flanc de protection latéral), gauche et droit.
 *
 * La pièce existe en HUIT habillages. Tous sont dérivés du même fichier
 * d'origine (`OasisFly35 DC Side guard .stl`) et partagent au micron près son
 * encombrement (104,66 × 17,62 × 29,87 mm), son épaisseur de paroi (1,55 mm)
 * et toutes ses surfaces de montage : ergots, épaulements, nervures et le
 * perçage ovale arrière ne sont touchés par aucun motif. Un habillage se
 * remplace donc par un autre sans rien changer au reste du châssis.
 *
 * Deux familles :
 *
 *  - PERCÉS. Le motif est ouvert au travers de la joue, uniquement là où la
 *    coque est une paroi simple de 0,9 à 2,6 mm et à plus de 0,9 mm de tout
 *    bord ou de toute zone épaisse. Les triangles d'origine ne sont pas
 *    remaillés, ils sont découpés exactement sur le contour des ouvertures.
 *
 *  - EN RELIEF. Rien n'est percé : la face externe (celle qui ne porte pas les
 *    nervures) est déplacée vers l'extérieur d'un demi-millimètre par un champ
 *    de hauteur. L'épaisseur locale augmente du relief, jamais l'inverse, et
 *    le motif s'efface avant les bords et les arêtes vives.
 *
 * Le droit est le miroir en X du gauche, comme les joues de support caméra :
 * mêmes fichiers, `mirrored: true`. Chaque côté choisit son habillage
 * indépendamment — rien n'oblige à porter le même des deux côtés.
 */

import { styledMeshPart } from './mesh-asset.js';

const DIR = 'assets/parts-3d/side-guard';
const MATERIAL = 'Plastique imprimé';

/**
 * L'ordre compte : le premier est l'habillage monté au démarrage, et c'est
 * l'ordre des boutons du sélecteur. L'origine passe donc en tête.
 *
 * `note` est repris tel quel comme provenance de la pièce et comme infobulle
 * du bouton : il dit ce que le motif change, pas ce à quoi il ressemble.
 */
export const STYLES = [
  {
    id: 'origine',
    name: 'Origine',
    url: 'assets/parts-3d/OasisFly35 DC Side guard .stl',
    note: 'fichier d’origine, non modifié — 2,746 cm³, 3,40 g en PLA',
  },
  {
    id: 'nid-abeille',
    name: 'Nid d’abeille',
    url: `${DIR}/side-guard-nid-abeille.stl`,
    note: 'percé — 13 alvéoles de 5,2 mm entre plats, cloisons 1,7 mm, −17,5 % de matière',
  },
  {
    id: 'persiennes',
    name: 'Persiennes',
    url: `${DIR}/side-guard-persiennes.stl`,
    note: 'percé — 8 fentes obliques de 2,7 mm à 62°, −17,3 % de matière',
  },
  {
    id: 'treillis',
    name: 'Treillis',
    url: `${DIR}/side-guard-treillis.stl`,
    note: 'percé — 18 triangles alternés, cloisons 2,2 mm, −12,1 % de matière',
  },
  {
    id: 'skull',
    name: 'Skull',
    url: `${DIR}/side-guard-skull.stl`,
    note: 'relief plein — crâne de face, 0,66 mm de saillie, orbites et dents gravées',
  },
  {
    id: 'shark',
    name: 'Shark',
    url: `${DIR}/side-guard-shark.stl`,
    note: 'relief plein — requin de profil sur 44 mm, 0,62 mm de saillie, branchies gravées',
  },
  {
    id: 'circuit',
    name: 'Circuit',
    url: `${DIR}/side-guard-circuit.stl`,
    note: 'relief plein — routage de circuit imprimé, pistes de 0,9 mm, 0,52 mm de saillie',
  },
  {
    id: 'carbone',
    name: 'Carbone tressé',
    url: `${DIR}/side-guard-carbone.stl`,
    note: 'relief plein — tissage à ±45° couvrant toute la joue, 0,46 mm de saillie',
  },
];

export const gauche = await styledMeshPart({
  styles: STYLES,
  id: 'side-guard-g',
  index: 30,
  name: 'Side guard gauche',
  material: MATERIAL,
});

export const droit = await styledMeshPart({
  styles: STYLES,
  id: 'side-guard-d',
  index: 31,
  name: 'Side guard droit',
  material: MATERIAL,
  mirrored: true,
});
