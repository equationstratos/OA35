/**
 * Objet 3D pour une pièce importée telle quelle (maillage venu d'un fichier
 * CAO externe), par opposition aux plaques tracées depuis une photo.
 *
 * Une pièce de ce type n'a ni contour de perçages régulier ni épaisseur
 * constante à exploiter : elle n'a donc pas de repères d'assemblage
 * cliquables, contrairement aux plaques de js/lib/plate.js.
 */

import * as THREE from 'three';
import { outlineMaterial } from './materials.js';

/**
 * @param {THREE.BufferGeometry} geometry
 * @param {THREE.Material} material
 * @returns {THREE.Group}
 */
export function meshPartObject(geometry, material) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'body'; // même convention que les plaques : sélection, export et
  // calque photo reconnaissent une pièce à ce nom
  mesh.castShadow = true;
  mesh.receiveShadow = true;

  const group = new THREE.Group();
  group.add(mesh);

  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geometry, 35), outlineMaterial());
  edges.name = 'edges';
  group.add(edges);

  return group;
}
