/**
 * PIÈCE 04 — Top-plate, et ses habillages.
 *
 * Contour et perçages extraits directement du fichier topplate.stl fourni
 * (déjà en millimètres réels). Épaisseur mesurée : 2,0 mm, conforme à la
 * fiche technique du châssis (Top Plate Thickness: 2.0 mm).
 *
 * La plaque existe en QUATRE habillages, choisis au clic comme ceux des covers.
 * L'origine reste la plaque TRACÉE — contour et perçages, c'est elle qui
 * alimente le plan coté et le calque photo. Les trois autres sont des
 * maillages, dessinés sur le contour et les perçages de cette même plaque :
 * ils se vissent donc au même endroit.
 *
 * Deux corrections y sont communes, toutes deux héritées d'un défaut du
 * fichier de référence :
 *
 *  - LE HAUT EST RENDU SYMÉTRIQUE. Le fichier porte une patte pleine à droite
 *    et un crochet ouvert à gauche : il manquait la matière du côté gauche, et
 *    y percer un trou ne produisait rien. La patte de droite est recopiée en
 *    miroir au-dessus de y = 42.
 *  - LE SIXIÈME PERÇAGE. Une fois la matière rétablie, le trou manquant est
 *    percé en (−13,17 ; 49,05), symétrique de celui de droite. Les six
 *    perçages sont percés EN DERNIER, après la matière rendue au bord et
 *    l'anneau franc de 1,6 mm autour de chacun : aucune découpe de motif ne
 *    peut plus les entamer.
 *
 * Limite connue : l'onglet PLAN COTÉ montre toujours le contour de la plaque
 * tracée, quel que soit l'habillage affiché en 3D. Les habillages sont des
 * maillages, ils n'ont ni contour ni perçages extraits.
 */

import { TRACE } from './contour-top-plate.js';
import { plateFromSTL } from './plate-from-stl.js';
import { meshPart } from './mesh-asset.js';

export const THICKNESS_MM = 2.0;

const DIR = 'assets/parts-3d/top-plate';

export const STYLES = [
  {
    id: 'origine',
    name: 'Origine',
    url: null,
    note: 'plaque tracée du fichier fourni — contour et perçages',
  },
  {
    id: 'nid-abeille',
    name: 'Nid d’abeille',
    url: `${DIR}/top-plate-nid-abeille.stl`,
    note: 'alvéoles de 5,4 mm, cloisons 1,15 mm, grand hexagone central',
  },
  {
    id: 'skull',
    name: 'Skull',
    url: `${DIR}/top-plate-skull.stl`,
    note: 'motif crâne, mis aux proportions de la plaque, lettrage conservé',
  },
  {
    id: 'vector',
    name: 'Vector',
    url: `${DIR}/top-plate-vector.stl`,
    note: 'motif vector, mis aux proportions de la plaque, lettrage conservé',
  },
];

const plaque = plateFromSTL({
  trace: TRACE,
  id: 'top-plate',
  index: 4,
  name: 'Top-plate',
  thickness: THICKNESS_MM,
  source: 'contour extrait du fichier topplate.stl fourni',
});

const charges = new Map();
let courant = 'origine';
// Repères d'accrochage relevés UNE FOIS pour tous les habillages : ils
// partagent le contour et les six perçages de la plaque, seul le motif change.
// Les redétecter à chaque bascule coûtait cinq secondes — et le détecteur
// prenait les alvéoles du nid d'abeille pour des perçages.
let repere = null;

async function charge(styleId) {
  if (charges.has(styleId)) return charges.get(styleId);
  const style = STYLES.find((s) => s.id === styleId);
  if (!style || !style.url) throw new Error(`habillage inconnu : ${styleId}`);
  const part = await meshPart({
    url: style.url,
    id: 'top-plate', index: 4, name: 'Top-plate',
    material: plaque.meta.material, source: style.note,
    reuseAnchors: repere,
  });
  if (part.meta.missingAsset) throw new Error(part.meta.missingAsset);
  if (!repere) repere = part.frame;
  charges.set(styleId, part);
  return part;
}

export const meta = plaque.meta;
meta.styles = STYLES.map(({ id, name, note }) => ({ id, name, note }));
meta.styleId = courant;

export function build(flip = false) {
  return courant === 'origine' ? plaque.build(flip) : charges.get(courant).build(flip);
}

/**
 * Le tracé photo ne s'applique qu'à la plaque d'origine : un habillage est un
 * maillage, il n'a pas de contour à remplacer. Sans ce garde-fou, appliquer un
 * tracé rendait la plaque à son dessin d'origine sans prévenir.
 */
export function buildFromTrace(traceMm) {
  return courant === 'origine' ? plaque.buildFromTrace(traceMm) : build(false);
}

export async function setStyle(styleId) {
  if (styleId === 'origine') {
    courant = styleId;
    meta.styleId = styleId;
    meta.source = STYLES[0].note;
    return plaque;
  }
  const part = await charge(styleId);
  courant = styleId;
  meta.styleId = styleId;
  meta.source = part.meta.source;
  return part;
}

export const { trace, blueprint } = plaque;
