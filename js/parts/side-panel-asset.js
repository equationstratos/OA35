/**
 * Maillage partagé par les deux flancs : un seul fichier téléchargé, la pièce
 * droite est le miroir du maillage gauche plutôt qu'un second STL.
 *
 * Chargé une fois au niveau du module (top-level await) : le graphe de
 * modules ES attend cette promesse avant que main.js ne continue, donc
 * PARTS contient déjà une géométrie résolue au premier rendu.
 *
 * L'échec NE REMONTE PAS. Un top-level await qui rejette fait échouer tout le
 * graphe de modules : un seul fichier absent d'assets/ suffirait alors à
 * empêcher main.js de démarrer, donc à faire disparaître TOUTES les pièces —
 * y compris celles créées depuis l'outil, qui n'ont pourtant rien à voir avec
 * ce fichier. La pièce concernée est signalée absente, le reste du build
 * s'affiche normalement.
 */

import { loadSTL, meshBounds } from '../lib/stl-loader.js';

const URL = 'assets/parts-3d/flanc-gauche.stl';

let geometry = null;
let error = null;
try {
  geometry = await loadSTL(URL);
} catch (e) {
  error = e;
  console.warn(`[parts] ${URL} introuvable : les flancs ne seront pas affichés.`, e);
}

/** Maillage tel qu'exporté du fichier STEP d'origine, ou null si le fichier manque. */
export const GEOMETRY = geometry;

/** Message d'erreur si le fichier n'a pas pu être chargé, sinon null. */
export const LOAD_ERROR = error ? `${URL} : ${error.message}` : null;

export const BOUNDS = geometry
  ? meshBounds(geometry)
  : { min: [0, 0, 0], max: [0, 0, 0], size: [0, 0, 0] };
