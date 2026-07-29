/**
 * Maillage partagé par les pièces 09 (flanc gauche) et 10 (flanc droit) :
 * un seul fichier téléchargé, la pièce droite est le miroir du maillage
 * gauche plutôt qu'un second STL.
 *
 * Chargé une fois au niveau du module (top-level await) : le graphe de
 * modules ES attend cette promesse avant que main.js ne continue, donc
 * PARTS contient déjà une géométrie résolue au premier rendu.
 */

import { loadSTL, meshBounds } from '../lib/stl-loader.js';

const URL = 'assets/parts-3d/flanc-gauche.stl';

/** Maillage tel qu'exporté du fichier STEP d'origine (repère Creo, Z "haut"). */
export const GEOMETRY = await loadSTL(URL);

export const BOUNDS = meshBounds(GEOMETRY);
