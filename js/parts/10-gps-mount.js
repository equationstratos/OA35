/**
 * PIÈCE 12 — Support GPS avant, et ses habillages.
 *
 * Ce module REMPLACE l'entrée « Support GPS avant » de 08-accessoires.js : il
 * reprend son identifiant (`gps-mount`) et son numéro, si bien qu'une position
 * ou un assemblage déjà enregistrés restent valables. Il n'y a pas de pièce en
 * plus dans le build, c'est la même, à qui on donne le choix de sa coque.
 *
 * Cinq habillages : la coque fournie, plus quatre coques redessinées.
 *
 * Ce qui est FONCTIONNEL est identique dans les cinq : la semelle et ses deux
 * oreilles percées sont reprises telles quelles du fichier d'origine, et la
 * place du module GPS est creusée à l'identique dans chacune — même logement,
 * même couloir d'entrée par le dessous. Seule la coque au-dessus change de
 * dessin. Le support se visse donc au même endroit et reçoit le même module,
 * quel que soit l'habillage.
 *
 * Les quatre dessins sont construits en DEMI-ESPACES, pas en surfaces molles :
 * une coque définie par des plans donne des facettes franches et des arêtes
 * vives, dans la ligne des bras et des joues du châssis.
 */

import { styledMeshPart } from './mesh-asset.js';

const DIR = 'assets/parts-3d/gps-mount';

export const support = await styledMeshPart({
  styles: [
    {
      id: 'origine',
      name: 'Origine',
      url: 'assets/parts-3d/oasisfly-35-front-GPS-mount.STL',
      note: 'coque fournie — 29,72 × 24,50 × 11,48 mm, 1,977 cm³',
    },
    {
      id: 'blinde',
      name: 'Blindé',
      url: `${DIR}/gps-mount-blinde.stl`,
      anchorsFrom: 'origine',
      note: 'toit à deux pans, arête faîtière franche, nez cassé',
    },
    {
      id: 'cyber',
      name: 'Cyber',
      url: `${DIR}/gps-mount-cyber.stl`,
      anchorsFrom: 'origine',
      note: 'la même coque, entaillée de quatre ouïes obliques',
    },
    {
      id: 'mecha',
      name: 'Mecha',
      url: `${DIR}/gps-mount-mecha.stl`,
      anchorsFrom: 'origine',
      note: 'blindage à gradins, la section se rétreint par paliers francs',
    },
    {
      id: 'stealth',
      name: 'Stealth',
      url: `${DIR}/gps-mount-stealth.stl`,
      anchorsFrom: 'origine',
      note: 'arête en travers et pans fuyants, façon verrière d’appareil furtif',
    },
  ],
  id: 'gps-mount',
  index: 12,
  name: 'Support GPS avant',
  material: 'Plastique imprimé',
});
