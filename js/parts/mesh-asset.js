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
 * @param {number} [o.spin] quart de tour autour de la verticale DU FICHIER, en
 *        radians, appliqué avant tout le reste. Deux exports de la même pièce
 *        n'ont pas forcément sa longueur sur le même axe : sans ce recalage,
 *        remplacer l'un par l'autre fait pivoter la pièce d'un quart de tour.
 */
export async function meshPart({
  url, id, index, name, material, source,
  mirrored = false, zUp = true, upsideDown = false, spin = 0,
  reuseAnchors = null,
}) {
  let geometry = null;
  let error = null;
  // recentrage appliqué au maillage : publié plus bas, c'est lui qui permet de
  // rejouer les ancres d'un autre habillage de la même pièce
  let shift = [0, 0, 0];
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

    // Recalage d'axes AVANT le recentrage, pour que l'encombrement mesuré plus
    // bas soit celui de la pièce une fois tournée — et avant le miroir de
    // `build()`, qui se fait toujours en X : c'est ce quart de tour qui amène
    // l'épaisseur sur X, donc qui fait du miroir un vrai symétrique
    // gauche/droite au lieu d'une inversion avant/arrière.
    if (spin) geometry.rotateZ(spin);

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
    shift = [0, 1, 2].map((k) => (k === up
      ? -b.min[k]
      : -(b.min[k] + b.max[k]) / 2));
    geometry.translate(shift[0], shift[1], shift[2]);
  }

  const bounds = geometry
    ? meshBounds(geometry)
    : { min: [0, 0, 0], max: [0, 0, 0], size: [0, 0, 0] };

  // La détection des features circulaires coûte quelques centaines de ms sur
  // une pièce ordinaire — et près de cinq secondes sur un maillage de cent
  // cinquante mille triangles. Faite une fois ici, pas à chaque reconstruction
  // de la pièce (le bouton Miroir en déclenche une). Le miroir se déduit des
  // ancres d'origine.
  //
  // `reuseAnchors` sert aux habillages d'une même pièce : leurs surfaces de
  // montage sont identiques au fichier près, seul le recentrage diffère —
  // d'une fraction de millimètre, le relief épaississant la coque. On décale
  // donc les ancres de la différence des recentrages au lieu de refaire toute
  // la détection. Exact, tant que l'habillage réutilisé partage le même quart
  // de tour et le même miroir.
  let anchors = [];
  if (geometry) {
    if (reuseAnchors) {
      const d = [0, 1, 2].map((k) => shift[k] - reuseAnchors.shift[k]);
      anchors = reuseAnchors.anchors.map((a) => ({
        ...a, x: a.x + d[0], y: a.y + d[1], z: a.z + d[2],
      }));
    } else {
      anchors = meshAnchors(geometry);
    }
  }

  return {
    /** recentrage et ancres, pour qu'un autre habillage puisse les rejouer */
    frame: { shift, anchors },
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

/**
 * Pièce importée qui existe en plusieurs styles : même géométrie de montage,
 * un fichier STL par habillage. Le style se change en cours de session, la
 * pièce garde sa place et sa teinte.
 *
 * Les fichiers sont chargés À LA DEMANDE, pas tous au démarrage : huit
 * habillages de cover pèsent une quarantaine de mégaoctets, les charger d'un
 * bloc retarderait le premier rendu de plusieurs secondes pour sept maillages
 * dont on n'affichera jamais qu'un seul. Chaque style chargé est gardé, si
 * bien qu'un aller-retour entre deux habillages est instantané.
 *
 * @param {object} o
 * @param {Array<{id:string,name:string,url:string,note:string,mirrored?:boolean,
 *          spin?:number,anchorsFrom?:string}>} o.styles
 *        le premier de la liste est celui affiché au démarrage. Un style peut
 *        forcer son propre miroir : le fichier d'origine du côté droit est
 *        déjà une coque droite, alors que les habillages sont tous dérivés du
 *        flanc gauche et doivent, eux, être retournés. `anchorsFrom` nomme la
 *        coque nue d'où l'habillage tient ses repères d'accrochage.
 */
export async function styledMeshPart({
  styles, id, index, name, material,
  mirrored = false, zUp = true, upsideDown = false,
}) {
  const loaded = new Map();
  let currentId = styles[0].id;

  // Ancres déjà détectées, rangées par famille d'habillages : deux habillages
  // ne partagent leurs surfaces de montage que s'ils partagent aussi le quart
  // de tour et le miroir qui les amènent dans le même repère.
  const frames = new Map();

  async function ensure(styleId) {
    if (loaded.has(styleId)) return loaded.get(styleId);
    const style = styles.find((s) => s.id === styleId);
    if (!style) throw new Error(`style inconnu : ${styleId}`);
    // `?? ` et non `||` : un style qui demande explicitement `false` doit
    // pouvoir annuler le miroir de la pièce, pas se le voir réappliquer.
    const wantMirror = style.mirrored ?? mirrored;
    const wantSpin = style.spin ?? 0;
    const family = `${wantSpin}|${wantMirror}`;

    // Les repères d'accrochage se relèvent sur la COQUE NUE, jamais sur un
    // habillage : le détecteur de features circulaires prend les orbites d'un
    // crâne ou les alvéoles d'un nid d'abeille pour des perçages, et la pièce
    // se couvrirait de cibles qui ne se vissent nulle part. Un habillage
    // déclare donc de quelle coque il tient ses repères ; elle est chargée en
    // premier, une seule fois pour toute la famille.
    if (!frames.has(family) && style.anchorsFrom) {
      await ensure(style.anchorsFrom);
    }

    const part = await meshPart({
      url: style.url, id, index, name, material, source: style.note,
      mirrored: wantMirror,
      spin: wantSpin,
      reuseAnchors: frames.get(family) ?? null,
      zUp,
      upsideDown,
    });
    if (!part.meta.missingAsset && !frames.has(family)) frames.set(family, part.frame);
    loaded.set(styleId, part);
    return part;
  }

  const first = await ensure(currentId);
  // meta est lu et gardé tel quel par le montage : c'est le MÊME objet qui est
  // mis à jour d'un style à l'autre, en remplacer la référence laisserait la
  // scène sur l'ancien.
  const meta = {
    ...first.meta,
    styles: styles.map(({ id: sid, name: sname, note }) => ({ id: sid, name: sname, note })),
    styleId: currentId,
  };

  return {
    meta,
    build(flip = false) {
      return loaded.get(currentId).build(flip);
    },
    /** Bascule sur un autre habillage. L'appelant remonte ensuite la pièce. */
    async setStyle(styleId) {
      const part = await ensure(styleId);
      // un fichier manquant NE DOIT PAS devenir le style courant : sa
      // géométrie est nulle, le montage échouerait et emporterait le build.
      if (part.meta.missingAsset) throw new Error(part.meta.missingAsset);
      currentId = styleId;
      meta.styleId = styleId;
      meta.source = part.meta.source;
      meta.dims = part.meta.dims;
      return part;
    },
  };
}
