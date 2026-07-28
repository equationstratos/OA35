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

/**
 * Données 2D pour le plan coté, à partir d'un tracé en mm.
 * Utilisé par toutes les pièces issues d'une photo.
 */
export function blueprintFromTrace(traceMm) {
  const outline = traceMm.outline.map(([x, y]) => ({ x, y }));
  const circles = [];
  const polys = [];
  for (const h of traceMm.holes) {
    if (h.kind === 'circle') circles.push({ x: h.cx, y: h.cy, r: h.r, d: h.r * 2 });
    else polys.push(h.points.map(([x, y]) => ({ x, y })));
  }
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of outline) {
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
  }
  return {
    outline, circles, polys,
    box: { minX, maxX, minY, maxY, width: maxX - minX, height: maxY - minY },
    mmPerPx: traceMm.mmPerPx,
  };
}
