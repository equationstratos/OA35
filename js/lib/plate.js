/**
 * Fabrication d'une plaque carbone : contour + perçages -> objet 3D.
 * Partagé par les pièces livrées avec le projet et par celles créées
 * depuis l'onglet Calibration.
 */

import * as THREE from 'three';
import { extrudePlate } from './geom.js';
import { carbonMaterial, outlineMaterial } from './materials.js';

/**
 * @param {THREE.Vector2[]} outline contour extérieur, en mm
 * @param {THREE.Path[]} holes perçages, en mm
 * @param {number} thickness épaisseur, en mm
 * @returns {THREE.Group} plaque à plat, avant vers -Z
 */
export function plateObject(outline, holes, thickness) {
  const geo = extrudePlate(outline, holes, thickness);

  // UV planaires pour que le tissage suive la plaque, pas l'extrusion
  const pos = geo.attributes.position;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    uv[i * 2] = pos.getX(i) / 100;
    uv[i * 2 + 1] = pos.getY(i) / 100;
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));

  const mesh = new THREE.Mesh(geo, carbonMaterial(1));
  mesh.name = 'body';
  mesh.castShadow = true;
  mesh.receiveShadow = true;

  const group = new THREE.Group();
  group.add(mesh);

  // liseré de contour (aide à la lecture des arêtes)
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo, 35), outlineMaterial());
  edges.name = 'edges';
  group.add(edges);

  group.rotation.x = -Math.PI / 2; // à plat, +Y du dessin -> -Z monde (avant)
  return group;
}

/**
 * Même chose à partir d'un tracé photo converti en mm.
 * @param {{outline:number[][], holes:{points:number[][]}[]}} traceMm
 */
export function plateFromTrace(traceMm, thickness) {
  const outline = traceMm.outline.map(([x, y]) => new THREE.Vector2(x, y));
  const holes = traceMm.holes.map(
    (h) => new THREE.Path(h.points.map(([x, y]) => new THREE.Vector2(x, y))),
  );
  return plateObject(outline, holes, thickness);
}
