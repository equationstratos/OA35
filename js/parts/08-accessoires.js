/**
 * PIÈCES 08+ — Accessoires imprimés en 3D.
 *
 * Covers, supports GPS / antenne VTX et support caméra, importés tels quels
 * de leurs fichiers STL. Pas de contour ni de perçages à extraire : ce ne
 * sont pas des pièces planes.
 *
 * Les chargements se font en parallèle : ils sont indépendants, les
 * enchaîner ferait attendre le premier rendu pour rien.
 */

import { meshPart } from './mesh-asset.js';

const PRINTED = 'Plastique imprimé';

export const ACCESSORIES = await Promise.all([
  meshPart({
    url: 'assets/parts-3d/oasisfly35DC-Cover-01.stl',
    id: 'cover-01', index: 10, name: 'Cover 01',
    material: PRINTED, source: 'fichier STL fourni',
  }),
  meshPart({
    url: 'assets/parts-3d/oasisfly35 DC-Cover-02.stl',
    id: 'cover-02', index: 11, name: 'Cover 02',
    material: PRINTED, source: 'fichier STL fourni',
  }),
  meshPart({
    url: 'assets/parts-3d/oasisfly-35-front-GPS-mount.STL',
    id: 'gps-mount', index: 12, name: 'Support GPS avant',
    material: PRINTED, source: 'fichier STL fourni',
  }),
  meshPart({
    url: 'assets/parts-3d/oasisfly-35-antenne-VTX.stl',
    id: 'vtx-mount', index: 13, name: 'Support antenne VTX',
    material: PRINTED, source: 'fichier STL fourni',
  }),
  meshPart({
    url: 'assets/FRAME/OA35-camera-mount.STL',
    id: 'camera-mount', index: 14, name: 'Support caméra',
    material: PRINTED, source: 'fichier STL fourni',
  }),
]);
