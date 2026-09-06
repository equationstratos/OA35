/**
 * LA BOÎTE DE RANGEMENT, dans la scène.
 *
 * Ce n'est pas une pièce du drone : elle ne se monte pas, ne se visse pas, ne
 * figure ni dans la nomenclature ni dans la liste des pièces. C'est le contenant
 * — celui de `tools/boite-rangement.py`, coque commune avec la boîte du jet
 * boat. Elle vit donc à part, dans son propre groupe, avec son propre menu.
 *
 * QUATRE ÉTATS, et le menu ne propose rien d'autre :
 *
 *   masquée   le drone seul, comme avant
 *   ouverte   le bac autour du drone, couvercle relevé sur sa charnière
 *   fermée    couvercle rabattu, le drone dedans
 *   gerbées   deux boîtes fermées l'une sur l'autre, celle du dessus étant
 *             celle du jet boat : c'est la démonstration que les patins de
 *             gerbage tombent bien dans les empreintes du couvercle
 *
 * LE COUVERCLE SE RETOURNE AUTOUR DE L'AXE Y DU FICHIER, pas autour de X. Le
 * générateur le dit — « le motif des nœuds est symétrique en X pour que le
 * couvercle, qui se retourne autour de l'axe Y, retombe exactement dans les
 * créneaux du bac » — et c'est vérifiable : le nœud du bac en (0 ; 82,9 ; 43)
 * et celui du couvercle en (0 ; 82,9 ; 25) ne se rejoignent que par ce
 * retournement-là. Un demi-tour autour de X mettrait la charnière du couvercle
 * en face des loquets du bac.
 *
 * OÙ ELLE SE POSE. Le drone est monté autour de l'origine, patins à y = −8 et
 * silhouette centrée en z = +23,3 : la boîte est donc descendue de 11 mm pour
 * que son plancher affleure sous les patins, et avancée de 23,3 pour que le
 * drone tombe au milieu du bac. Ces deux nombres sont mesurés sur le build, pas
 * choisis — s'ils changent, c'est que le drone a changé.
 */

import * as THREE from 'three';
import { loadSTL } from './lib/stl-loader.js';

/* ------------------------------------------------------------------ *
 * Cotes de la boîte, reprises de tools/boite-rangement.py
 * ------------------------------------------------------------------ */

/** Plan de joint du bac, dans le repère du fichier. */
const ZR = 43.0;
/** Hauteur du couvercle, de son dessus fini à son plan de joint. */
const LID_H = 25.0;
/** Épaisseur du joint plat. */
const GASKET_T = 1.4;
/** Axe de charnière : hors paroi de HG_Y, à la largeur hors tout. */
const HINGE_Z = -(154.8 / 2 + 5.5);
/**
 * Pas de gerbage.
 *
 * C'est la hauteur fermée, et rien de plus : les patins du bac ENTRENT dans
 * les empreintes du couvercle d'en dessous, ils ne se posent pas dessus. Les
 * compter en plus — 70,4 au lieu de 68 — soulevait la boîte du haut de la
 * saillie de ses propres patins, qui venaient alors affleurer le couvercle :
 * deux plans rigoureusement confondus, et tout le dessus se mettait à moirer.
 *
 * Les quinze centièmes ajoutés ne sont pas une cote de montage, seulement de
 * quoi séparer le fond du bac du dessus du couvercle. Deux surfaces en contact
 * franc scintillent à l'écran, et sur une pièce imprimée il y a de toute façon
 * plus que ça de jeu.
 */
export const PAS_GERBAGE = ZR + LID_H + 0.15;

/**
 * Calage sur le build, mesuré sur le drone monté.
 *
 * `Y` : les patins descendent à −8, le plancher du bac est à +3 dans son
 * repère — il faut donc baisser la boîte de 11 pour que le drone y repose.
 * `Z` : la silhouette du drone s'étend de −47,6 à +94,2, son milieu est à
 * +23,3 ; c'est là qu'il faut centrer le bac.
 */
const CALAGE = { y: -11.0, z: 23.3 };

/** Ouverture du couvercle, en radians. Assez pour dégager, pas au point de basculer. */
const OUVERTURE = 1.75;

/* ------------------------------------------------------------------ *
 * Matières
 * ------------------------------------------------------------------ */

/**
 * Coque imprimée. Deux teintes proches, une par pièce : sans cet écart, bac et
 * couvercle fermés forment un bloc où l'on ne lit plus le plan de joint.
 */
function coqueMaterial(color) {
  return new THREE.MeshPhysicalMaterial({
    color, roughness: 0.58, metalness: 0.04, clearcoat: 0.22, clearcoatRoughness: 0.5,
  });
}

/** Mousse du joint : mate, et volontairement d'une autre couleur — on la cherche. */
function jointMaterial() {
  return new THREE.MeshPhysicalMaterial({ color: 0x11857b, roughness: 0.9, metalness: 0 });
}

/* ------------------------------------------------------------------ *
 * Construction
 * ------------------------------------------------------------------ */

const FICHIERS = {
  bac: 'assets/boite/boite-bac.STL',
  couvercle: 'assets/boite/boite-couvercle.STL',
  joint: 'assets/boite/boite-joint.STL',
};

let geometries = null;

/**
 * Charge les trois maillages, une seule fois et À LA DEMANDE.
 *
 * Six cents kilo-octets qu'on ne va chercher que si l'on ouvre le menu : les
 * charger au démarrage retarderait le premier rendu du drone pour un contenant
 * que la plupart des visites ne regarderont pas.
 *
 * @returns {Promise<object|null>} null si un fichier manque — la boîte est
 *          alors simplement indisponible, le reste du visualisateur tourne.
 */
async function charger() {
  if (geometries) return geometries;
  try {
    const [bac, couvercle, joint] = await Promise.all(
      [FICHIERS.bac, FICHIERS.couvercle, FICHIERS.joint].map((u) => loadSTL(u)),
    );
    geometries = { bac, couvercle, joint };
  } catch (e) {
    console.warn('[boite] maillage introuvable, la boîte ne sera pas affichée.', e);
    geometries = null;
  }
  return geometries;
}

/**
 * Une boîte complète : bac, joint et couvercle articulé sur sa charnière.
 *
 * @param {number} ouverture angle du couvercle, en radians (0 = fermé)
 * @param {number} teinte couleur du bac
 * @returns {THREE.Group}
 */
function uneBoite(g, ouverture, teinte) {
  const boite = new THREE.Group();

  const bac = new THREE.Mesh(g.bac, coqueMaterial(teinte));
  bac.rotation.x = -Math.PI / 2;          // fichier Z haut -> scène Y haut
  /*
   * LA BOÎTE NE PREND PAS PART AUX OMBRES, ni comme émettrice ni comme
   * réceptrice, et c'est délibéré.
   *
   * La caméra d'ombre de la scène est réglée sur le drone : ±110 mm, carte de
   * 1536, soit un texel tous les 0,14 mm — c'est ce qui donne des ombres nettes
   * sous les bras. La boîte, elle, va jusqu'à ±123 et monte à 136 une fois
   * gerbée : elle DÉBORDE de ce cadrage, et un receveur hors cadre récolte des
   * lectures d'ombre indéfinies. Résultat, un semis de points clairs sur tout
   * le flanc — c'était visible dès la première pose.
   *
   * Élargir la caméra d'ombre pour l'englober aurait marché, mais au prix des
   * ombres du drone, qui sont la raison d'être du réglage. Un contenant se
   * passe très bien d'ombres portées.
   */
  bac.castShadow = bac.receiveShadow = false;
  boite.add(bac);

  const joint = new THREE.Mesh(g.joint, jointMaterial());
  joint.rotation.x = -Math.PI / 2;
  joint.position.y = ZR - GASKET_T;
  boite.add(joint);

  /*
   * Le couvercle est monté dans deux groupes emboîtés :
   *
   *   `pivot`   posé sur l'axe de charnière, c'est lui qui tourne ;
   *   `retour`  porte le demi-tour autour de l'axe Y du fichier, celui qui
   *             ferme le couvercle sur le bac.
   *
   * Un seul groupe ne suffirait pas : la rotation d'ouverture doit se faire
   * AUTOUR de la charnière, pas autour de l'origine de la boîte.
   */
  const pivot = new THREE.Group();
  pivot.position.set(0, ZR, HINGE_Z);
  const retour = new THREE.Group();
  retour.position.set(0, LID_H, -HINGE_Z);
  retour.rotation.z = Math.PI;
  const couvercle = new THREE.Mesh(g.couvercle, coqueMaterial(teinte + 0x0a0a0a));
  couvercle.rotation.x = -Math.PI / 2;
  couvercle.castShadow = couvercle.receiveShadow = false;
  retour.add(couvercle);
  pivot.add(retour);
  pivot.rotation.x = -ouverture;
  boite.add(pivot);

  return boite;
}

/* ------------------------------------------------------------------ *
 * Le groupe de scène et son état
 * ------------------------------------------------------------------ */

/** États possibles, dans l'ordre où le menu les propose. */
export const ETATS = [
  { id: 'masquee', nom: 'Masquée', note: 'le drone seul' },
  { id: 'ouverte', nom: 'Ouverte', note: 'couvercle relevé, le drone dans le bac' },
  { id: 'fermee', nom: 'Fermée', note: 'couvercle rabattu' },
  { id: 'gerbees', nom: 'Gerbées', note: 'deux boîtes empilées, patins dans les empreintes' },
];

const groupe = new THREE.Group();
groupe.name = 'boite';
groupe.visible = false;

/** @returns {THREE.Group} le groupe à ajouter à la scène, une fois pour toutes */
export function groupeBoite() {
  return groupe;
}

function vider() {
  while (groupe.children.length) {
    const o = groupe.children.pop();
    o.traverse((n) => { if (n.isMesh && n.material) n.material.dispose(); });
  }
}

/**
 * Pose la boîte dans l'état demandé.
 *
 * @param {string} etat un des `ETATS`
 * @returns {Promise<boolean>} faux si les maillages manquent
 */
export async function poserBoite(etat) {
  if (etat === 'masquee') {
    vider();
    groupe.visible = false;
    return true;
  }
  const g = await charger();
  if (!g) { groupe.visible = false; return false; }

  vider();
  const ouverture = etat === 'ouverte' ? OUVERTURE : 0;
  const basse = uneBoite(g, ouverture, 0x2f353d);
  groupe.add(basse);

  if (etat === 'gerbees') {
    // celle du dessus est la boîte du jet boat : même coque, autre contenu —
    // c'est tout l'intérêt de la cote commune
    const haute = uneBoite(g, 0, 0x343a43);
    haute.position.y = PAS_GERBAGE;
    groupe.add(haute);
  }

  groupe.position.set(0, CALAGE.y, CALAGE.z);
  groupe.visible = true;
  return true;
}
