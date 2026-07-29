/**
 * Fabrication d'une plaque carbone : contour + perçages -> objet 3D.
 * Partagé par les pièces livrées avec le projet et par celles créées
 * depuis l'onglet Calibration.
 */

import * as THREE from 'three';
import { extrudePlate } from './geom.js';
import { carbonMaterial, outlineMaterial } from './materials.js';

/**
 * Centre et rayon de chaque perçage, dans le plan de la pièce.
 * Sert de point d'accrochage pour l'assemblage par clic.
 * @param {{holes:object[]}} traceMm
 * @returns {{index:number, x:number, y:number, r:number}[]}
 */
export function holeAnchors(traceMm) {
  return traceMm.holes.map((h, index) => {
    if (h.kind === 'circle') return { index, x: h.cx, y: h.cy, r: h.r };

    // centroïde d'aire du polygone (le centroïde des sommets serait biaisé
    // par leur densité inégale le long du contour)
    const p = h.points;
    let a = 0, cx = 0, cy = 0;
    for (let k = 0; k < p.length; k++) {
      const [x1, y1] = p[k];
      const [x2, y2] = p[(k + 1) % p.length];
      const cross = x1 * y2 - x2 * y1;
      a += cross;
      cx += (x1 + x2) * cross;
      cy += (y1 + y2) * cross;
    }
    a /= 2;
    if (Math.abs(a) < 1e-9) return { index, x: p[0][0], y: p[0][1], r: 1 };
    return {
      index,
      x: cx / (6 * a),
      y: cy / (6 * a),
      r: Math.sqrt(Math.abs(a) / Math.PI),
    };
  });
}

/** Rayon minimal d'une cible de clic, en mm : un M2 est trop petit à viser. */
const PICK_MIN_RADIUS_MM = 2.2;

/**
 * Repères cliquables sur chaque perçage : un anneau visible pour montrer la
 * cible, un disque transparent plus large pour la rendre facile à viser.
 */
function holeMarkers(anchors, thickness) {
  const group = new THREE.Group();
  group.name = 'hole-markers';
  group.visible = false; // n'apparaît qu'en mode assemblage

  const ringMaterial = new THREE.MeshBasicMaterial({
    color: 0x6cc7ff, transparent: true, opacity: 0.75, depthTest: false,
  });
  const pickMaterial = new THREE.MeshBasicMaterial({
    // invisible mais toujours détecté par le lancer de rayon
    transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide,
  });

  for (const a of anchors) {
    const ringRadius = Math.max(a.r, 0.9) + 0.35;
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(ringRadius, 0.16, 8, 28),
      ringMaterial,
    );
    ring.renderOrder = 2;
    ring.name = 'ring';

    const pick = new THREE.Mesh(
      new THREE.CircleGeometry(Math.max(a.r * 1.7, PICK_MIN_RADIUS_MM), 20),
      pickMaterial,
    );
    pick.name = 'pick';

    // c'est le repère lui-même qui porte la position du perçage : sa position
    // monde est le point d'accrochage de l'assemblage
    const marker = new THREE.Group();
    marker.name = 'hole';
    marker.position.set(a.x, a.y, thickness / 2 + 0.05);
    marker.userData.anchor = a;
    marker.add(ring, pick);
    group.add(marker);
  }
  return group;
}

/**
 * @param {THREE.Vector2[]} outline contour extérieur, en mm
 * @param {THREE.Vector2[][]} holes perçages, en mm
 * @param {number} thickness épaisseur, en mm
 * @param {object[]} [anchors] centres de perçage, pour les repères cliquables
 * @returns {THREE.Group} plaque à plat, avant vers -Z
 */
export function plateObject(outline, holes, thickness, anchors) {
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

  if (anchors && anchors.length) group.add(holeMarkers(anchors, thickness));

  group.rotation.x = -Math.PI / 2; // à plat, +Y du dessin -> -Z monde (avant)
  return group;
}

/** Symétrie gauche/droite d'un tracé, dans son propre plan. */
export function mirrorTrace(traceMm) {
  const flip = ([x, y]) => [-x, y];
  return {
    ...traceMm,
    outline: traceMm.outline.map(flip),
    holes: traceMm.holes.map((h) => ({
      ...h,
      points: h.points.map(flip),
      ...(h.kind === 'circle' ? { cx: -h.cx } : {}),
    })),
  };
}

/**
 * Même chose à partir d'un tracé photo converti en mm.
 *
 * Le miroir agit sur le tracé, pas sur l'échelle de l'objet : une mise à
 * l'échelle négative retournerait les normales et fausserait l'éclairage
 * comme les ombres.
 *
 * @param {{outline:number[][], holes:{points:number[][]}[]}} traceMm
 * @param {number} thickness épaisseur, en mm
 * @param {boolean} [mirrored] pièce symétrique de celle photographiée
 */
export function plateFromTrace(traceMm, thickness, mirrored = false) {
  const source = mirrored ? mirrorTrace(traceMm) : traceMm;
  const outline = source.outline.map(([x, y]) => new THREE.Vector2(x, y));
  const holes = source.holes.map(
    (h) => h.points.map(([x, y]) => new THREE.Vector2(x, y)),
  );
  return plateObject(outline, holes, thickness, holeAnchors(source));
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
