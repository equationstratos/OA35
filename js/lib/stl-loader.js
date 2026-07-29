/**
 * Chargement d'un maillage STL importé (pièce venue d'un fichier CAO externe,
 * par opposition aux plaques tracées depuis une photo).
 *
 * Le projet reste hors-ligne : pas de THREE.STLLoader du CDN, un parseur
 * minimal suffit puisque le format est simple et entièrement documenté.
 */

import * as THREE from 'three';

/** Vrai si le buffer est un STL texte (« solid » suivi de vrais mots-clés ASCII). */
function isAsciiSTL(buffer) {
  const head = new TextDecoder().decode(new Uint8Array(buffer, 0, Math.min(84, buffer.byteLength)));
  if (!head.trim().toLowerCase().startsWith('solid')) return false;
  // un binaire peut légitimement commencer par "solid" dans son en-tête libre :
  // on tranche sur la taille annoncée, qui ne peut correspondre qu'à un binaire
  if (buffer.byteLength < 84) return true;
  const triangleCount = new DataView(buffer).getUint32(80, true);
  return 84 + triangleCount * 50 !== buffer.byteLength;
}

function parseBinarySTL(buffer) {
  const view = new DataView(buffer);
  const triangleCount = view.getUint32(80, true);
  const position = new Float32Array(triangleCount * 9);
  let offset = 84;
  let p = 0;
  for (let t = 0; t < triangleCount; t++) {
    offset += 12; // normale déclarée : recalculée plus bas, pas fiable telle quelle
    for (let k = 0; k < 3; k++) {
      position[p++] = view.getFloat32(offset, true);
      position[p++] = view.getFloat32(offset + 4, true);
      position[p++] = view.getFloat32(offset + 8, true);
      offset += 12;
    }
    offset += 2; // octets d'attribut, inutilisés
  }
  return position;
}

function parseAsciiSTL(buffer) {
  const text = new TextDecoder().decode(buffer);
  const nums = [];
  const re = /vertex\s+([\d.eE+-]+)\s+([\d.eE+-]+)\s+([\d.eE+-]+)/g;
  let m;
  while ((m = re.exec(text))) nums.push(+m[1], +m[2], +m[3]);
  return new Float32Array(nums);
}

/**
 * @param {ArrayBuffer} buffer
 * @returns {THREE.BufferGeometry} normales lissées, prête à afficher
 */
export function parseSTL(buffer) {
  const position = isAsciiSTL(buffer) ? parseAsciiSTL(buffer) : parseBinarySTL(buffer);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(position, 3));
  geo.computeVertexNormals();
  return geo;
}

/** Charge et parse un STL depuis une URL relative au site. */
export async function loadSTL(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} : ${res.status}`);
  return parseSTL(await res.arrayBuffer());
}

/**
 * Symétrie X d'une géométrie triangulée.
 *
 * Inverser une seule coordonnée retourne le sens de parcours de chaque
 * triangle : sans correction, les faces pointeraient vers l'intérieur après
 * la symétrie. On échange donc les deux derniers sommets de chaque triangle
 * en même temps qu'on inverse X, ce qui restaure des faces tournées vers
 * l'extérieur.
 * @param {THREE.BufferGeometry} geo
 */
export function mirrorGeometryX(geo) {
  const src = geo.attributes.position.array;
  const out = new Float32Array(src.length);
  for (let t = 0; t < src.length; t += 9) {
    for (const [from, to] of [[0, 0], [1, 2], [2, 1]]) {
      const si = t + from * 3;
      const di = t + to * 3;
      out[di] = -src[si];
      out[di + 1] = src[si + 1];
      out[di + 2] = src[si + 2];
    }
  }
  const mirrored = new THREE.BufferGeometry();
  mirrored.setAttribute('position', new THREE.BufferAttribute(out, 3));
  mirrored.computeVertexNormals();
  return mirrored;
}

/** Volume signé (théorème de la divergence) et encombrement, pour un contrôle rapide. */
export function meshBounds(geo) {
  const pos = geo.attributes.position;
  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < pos.count; i++) {
    for (let k = 0; k < 3; k++) {
      const v = k === 0 ? pos.getX(i) : k === 1 ? pos.getY(i) : pos.getZ(i);
      lo[k] = Math.min(lo[k], v);
      hi[k] = Math.max(hi[k], v);
    }
  }
  return {
    min: lo, max: hi,
    size: hi.map((h, k) => h - lo[k]),
  };
}
