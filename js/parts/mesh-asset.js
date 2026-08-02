/**
 * Fabrique commune aux pièces importées telles quelles d'un fichier STL :
 * covers, supports GPS / antenne VTX, support caméra, flancs.
 *
 * Contrairement aux plaques (js/parts/plate-from-stl.js), ces pièces ne sont
 * pas planes : il n'y a ni contour ni perçages à extraire, on affiche le
 * maillage tel quel.
 *
 * L'échec de chargement NE REMONTE PAS. Un top-level await qui rejette fait
 * échouer tout le graphe de modules ES : un seul fichier absent d'assets/
 * suffirait à empêcher main.js de démarrer, donc à faire disparaître TOUTES
 * les pièces — y compris celles créées depuis l'outil. La pièce concernée est
 * signalée absente (meta.missingAsset), le reste du build s'affiche.
 */

import { loadSTL, meshBounds, mirrorGeometryX } from '../lib/stl-loader.js';
import { meshPartObject, meshAnchors } from '../lib/mesh-part.js';
import { printedMaterial } from '../lib/materials.js';

/**
 * @param {object} o
 * @param {string} o.url chemin du STL, relatif à la page
 * @param {string} o.id
 * @param {number} o.index
 * @param {string} o.name
 * @param {string} o.material libellé matière
 * @param {string} o.source d'où vient le fichier
 * @param {boolean} [o.mirrored] afficher le miroir en X du maillage
 * @param {boolean} [o.zUp] le fichier est en repère Z « haut » (export CAO) :
 *        on le bascule pour rejoindre le repère de la scène, Y « haut »
 * @param {boolean} [o.upsideDown] la pièce se monte retournée par rapport à
 *        son fichier : sa face de fixation est celle que le fichier pose sur
 *        le plateau d'impression. On retourne le maillage une bonne fois,
 *        pour que « bas » veuille dire la même chose ici que sur le drone.
 */
export async function meshPart({
  url, id, index, name, material, source,
  mirrored = false, zUp = true, upsideDown = false,
}) {
  let geometry = null;
  let error = null;
  try {
    geometry = await loadSTL(url);
  } catch (e) {
    error = e;
    console.warn(`[parts] ${url} introuvable : « ${name} » ne sera pas affichée.`, e);
  }

  if (geometry) {
    // Retournement éventuel AVANT le recentrage : c'est lui qui décide quelle
    // face se retrouve en bas, donc quel plan vient à zéro. Un patin de bras
    // s'imprime semelle sur le plateau mais se visse semelle EN HAUT, contre
    // le dessous du bras — sans ce retournement, sa béquille pointe vers le
    // bras au lieu du sol.
    if (upsideDown) geometry.rotateX(Math.PI);

    // Recentre la pièce sur son propre encombrement, base posée sur le plan.
    // Les fichiers exportés d'une CAO gardent l'origine du repère de
    // modélisation, qui peut être n'importe où : sans ça, la position
    // demandée dans la disposition d'établi ne désigne pas le centre de la
    // pièce et deux pièces « côte à côte » se chevauchent quand même.
    //
    // L'axe « vertical » du fichier dépend de l'export : Z pour les pièces
    // sorties d'une CAO en repère Z haut, Y pour celles déjà orientées comme
    // la scène. C'est celui-là qu'on pose à zéro, les deux autres sont
    // centrés — se tromper d'axe enterre la pièce ou la fait flotter.
    const b = meshBounds(geometry);
    const up = zUp ? 2 : 1;
    const shift = [0, 1, 2].map((k) => (k === up
      ? -b.min[k]
      : -(b.min[k] + b.max[k]) / 2));
    geometry.translate(shift[0], shift[1], shift[2]);
  }

  const bounds = geometry
    ? meshBounds(geometry)
    : { min: [0, 0, 0], max: [0, 0, 0], size: [0, 0, 0] };

  // La détection des features circulaires coûte quelques centaines de ms :
  // faite une fois ici, pas à chaque reconstruction de la pièce (le bouton
  // Miroir en déclenche une). Le miroir se déduit des ancres d'origine.
  const anchors = geometry ? meshAnchors(geometry) : [];

  return {
    build(flip = false) {
      // le miroir demandé par la pièce et celui du bouton se composent
      const wantMirror = mirrored !== flip;
      const geo = wantMirror ? mirrorGeometryX(geometry) : geometry;
      const a = wantMirror
        ? anchors.map((c) => ({ ...c, x: -c.x }))
        : anchors;
      const group = meshPartObject(geo, printedMaterial(), a);
      if (zUp) group.rotation.x = -Math.PI / 2;
      return group;
    },
    meta: {
      id,
      index,
      name,
      material,
      stackHeight: 0,
      isMesh: true,
      missingAsset: error ? `${url} : ${error.message}` : null,
      source,
      dims: {
        // « thickness » sert de demi-épaisseur pour poser une pièce au-dessus
        // ou en dessous d'une autre : c'est la HAUTEUR dans la scène qu'il
        // faut, pas la 3e dimension du fichier. Après bascule Z->Y c'est bien
        // la 3e ; sans bascule (fichier déjà en Y haut) c'est la 2e — s'y
        // tromper posait le patin 9 mm à côté de sa surface d'appui.
        length: bounds.size[0],
        width: zUp ? bounds.size[1] : bounds.size[2],
        thickness: zUp ? bounds.size[2] : bounds.size[1],
      },
    },
  };
}
