/**
 * Objet 3D pour une pièce importée telle quelle (maillage venu d'un fichier
 * CAO externe), par opposition aux plaques tracées depuis une photo.
 *
 * Ces pièces portent les mêmes repères d'accrochage cliquables que les
 * plaques (js/lib/plate.js) : mêmes noms d'objets, même userData, donc le
 * même mécanisme d'assemblage par superposition de trous fonctionne sur les
 * deux familles sans code spécifique.
 *
 * Différence : une plaque livre ses perçages par le contour de sa face
 * supérieure, alors qu'un maillage quelconque n'a pas de « face supérieure ».
 * Les features circulaires y sont reconnues dans la soupe de triangles
 * (js/lib/cylinders.js), arcs partiels compris — les covers s'accrochent sur
 * un demi-cercle ouvert, pas sur un trou fermé.
 */

import * as THREE from 'three';
import { outlineMaterial } from './materials.js';
import { findCylinders } from './cylinders.js';

/** Rayon minimal d'une cible de clic, en mm : un M2 est trop petit à viser. */
const PICK_MIN_RADIUS_MM = 2.2;

/** Au-delà, l'écran se couvre de repères et plus rien n'est visable. */
const MAX_ANCHORS = 12;

/** Axe de révolution -> rotation à appliquer à un anneau dessiné dans le plan XY. */
function orientRing(mesh, axis) {
  if (axis === 'X') mesh.rotation.y = Math.PI / 2;
  else if (axis === 'Y') mesh.rotation.x = Math.PI / 2;
}

/**
 * Repères cliquables sur les features circulaires du maillage.
 *
 * Un arc partiel est dessiné comme un arc, pas comme un cercle complet : le
 * repère doit montrer la matière réellement présente, sinon on vise une
 * portion de cercle qui n'existe pas sur la pièce.
 */
function anchorMarkers(anchors) {
  const group = new THREE.Group();
  group.name = 'hole-markers';
  group.visible = false; // n'apparaît qu'en mode assemblage

  const ringMaterial = new THREE.MeshBasicMaterial({
    color: 0x6cc7ff, transparent: true, opacity: 0.75, depthTest: false,
  });
  const pickMaterial = new THREE.MeshBasicMaterial({
    transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide,
  });

  for (const a of anchors) {
    const ringRadius = Math.max(a.r, 0.9) + 0.35;
    const arc = Math.PI * 2 * Math.min(1, a.coverage);
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(ringRadius, 0.16, 8, 36, arc),
      ringMaterial,
    );
    ring.renderOrder = 2;
    ring.name = 'ring';
    orientRing(ring, a.axis);

    const pick = new THREE.Mesh(
      new THREE.CircleGeometry(Math.max(a.r * 1.7, PICK_MIN_RADIUS_MM), 20),
      pickMaterial,
    );
    pick.name = 'pick';
    orientRing(pick, a.axis);

    // c'est le repère lui-même qui porte la position : sa position monde est
    // le point d'accrochage de l'assemblage
    const marker = new THREE.Group();
    marker.name = 'hole';
    marker.position.set(a.x, a.y, a.z);
    marker.userData.anchor = a;
    marker.add(ring, pick);
    group.add(marker);
  }
  return group;
}

/**
 * Features circulaires du maillage, sous la forme attendue par l'assemblage.
 * @param {THREE.BufferGeometry} geometry
 */
export function meshAnchors(geometry) {
  const position = geometry.attributes.position;
  const found = findCylinders(position.array, { maxRadius: 18 });

  // On garde les plus « accrochables » : d'abord les mieux fermées (un trou
  // vaut mieux qu'un congé), puis les plus petites (un perçage de vis plutôt
  // qu'une courbure de coque).
  found.sort((a, b) => (b.coverage - a.coverage) || (a.radius - b.radius));

  return found.slice(0, MAX_ANCHORS).map((c, index) => ({
    index,
    x: c.center[0], y: c.center[1], z: c.center[2],
    r: c.radius,
    axis: c.axis,
    coverage: c.coverage,
  }));
}

/**
 * @param {THREE.BufferGeometry} geometry
 * @param {THREE.Material} material
 * @param {object[]} [anchors] features circulaires, pour les repères cliquables
 * @returns {THREE.Group}
 */
export function meshPartObject(geometry, material, anchors) {
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

  if (anchors && anchors.length) group.add(anchorMarkers(anchors));

  return group;
}
