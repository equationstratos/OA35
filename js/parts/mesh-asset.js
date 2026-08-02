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
 */
export async function meshPart({
  url, id, index, name, material, source, mirrored = false, zUp = true,
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
    // Recentre la pièce sur son propre encombrement, base posée sur le plan.
    // Les fichiers exportés d'une CAO gardent l'origine du repère de
    // modélisation, qui peut être n'importe où : sans ça, la position
    // demandée dans la disposition d'établi ne désigne pas le centre de la
    // pièce et deux pièces « côte à côte » se chevauchent quand même.
    const b = meshBounds(geometry);
    geometry.translate(
      -(b.min[0] + b.max[0]) / 2,
      -(b.min[1] + b.max[1]) / 2,
      -b.min[2],
    );
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
      // recentrée base au niveau zéro (voir plus haut) : l'assemblage doit le
      // savoir pour poser la pièce SUR la plaque et non à mi-hauteur au-dessus
      originAtBase: true,
      missingAsset: error ? `${url} : ${error.message}` : null,
      source,
      dims: {
        // après bascule Z->Y, la 3e dimension du fichier devient la hauteur
        length: bounds.size[0],
        width: bounds.size[1],
        thickness: bounds.size[2],
      },
    },
  };
}
