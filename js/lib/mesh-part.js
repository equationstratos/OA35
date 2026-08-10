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
import { outlineMaterial, chamferMaterial } from './materials.js';
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

  // deux matériaux : un perçage (là où passera une vis) doit se distinguer
  // d'un arc d'accrochage, sinon on ne sait pas lequel viser
  const holeMaterial = new THREE.MeshBasicMaterial({
    color: 0x6cc7ff, transparent: true, opacity: 0.85, depthTest: false,
  });
  const arcMaterial = new THREE.MeshBasicMaterial({
    color: 0xc98a3a, transparent: true, opacity: 0.5, depthTest: false,
  });
  const pickMaterial = new THREE.MeshBasicMaterial({
    transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide,
  });

  for (const a of anchors) {
    const ringRadius = Math.max(a.r, 0.9) + 0.35;
    const arc = Math.PI * 2 * Math.min(1, a.coverage);
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(ringRadius, 0.16, 8, 36, arc),
      a.kind === 'arc' ? arcMaterial : holeMaterial,
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

  // findCylinders classe déjà perçages d'abord, du plus petit au plus grand :
  // ce sont les perçages de fixation qui comptent, et l'affichage est plafonné.
  return found.slice(0, MAX_ANCHORS).map((c, index) => ({
    index,
    x: c.center[0], y: c.center[1], z: c.center[2],
    r: c.radius,
    axis: c.axis,
    coverage: c.coverage,
    kind: c.kind,
  }));
}

/**
 * @param {THREE.BufferGeometry} geometry
 * @param {THREE.Material} material
 * @param {object[]} [anchors] features circulaires, pour les repères cliquables
 * @returns {THREE.Group}
 */
export function meshPartObject(geometry, material, anchors, chamfer = false) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'body'; // même convention que les plaques : sélection, export et
  // calque photo reconnaissent une pièce à ce nom
  mesh.castShadow = true;
  mesh.receiveShadow = true;

  const group = new THREE.Group();
  group.add(mesh);

  // Le maillage d'arêtes coûte cher à construire : les deux calques, le
  // surlignage et le chanfrein, se le partagent au lieu d'en faire un chacun.
  const wire = new THREE.EdgesGeometry(geometry, 35);

  const edges = new THREE.LineSegments(wire, outlineMaterial());
  edges.name = 'edges';
  group.add(edges);

  if (chamfer) {
    const bevel = new THREE.LineSegments(wire, chamferMaterial());
    bevel.name = 'chamfer';
    group.add(bevel);
  }

  if (anchors && anchors.length) group.add(anchorMarkers(anchors));

  return group;
}
