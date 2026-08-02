/**
 * Assemblage par contraintes de perçages.
 *
 * On clique un trou sur la pièce de référence, puis un trou sur la pièce à
 * placer :
 *   - 1re paire : la pièce se translate pour faire coïncider les deux trous
 *   - 2e paire  : elle pivote autour de la 1re paire pour aligner la seconde
 *
 * Deux paires suffisent à placer une pièce plane : la première fixe la
 * position, la seconde l'orientation.
 */

import * as THREE from 'three';

const STORAGE_KEY = 'tinyhoop-mk1:placements';

/* ------------------------------------------------------------------ *
 * Placements (position + rotation d'une pièce dans l'assemblage)
 * ------------------------------------------------------------------ */

export function loadPlacements() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const obj = raw ? JSON.parse(raw) : {};
    return obj && typeof obj === 'object' ? obj : {};
  } catch {
    return {};
  }
}

export function savePlacements(placements) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(placements));
  } catch { /* stockage indisponible : l'assemblage reste valable pour la session */ }
}

export function clearPlacements() {
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
}

/* ------------------------------------------------------------------ *
 * Machine à états de la sélection
 * ------------------------------------------------------------------ */

export const state = {
  /** trou cliqué en attente d'un second (sur la pièce de référence) */
  pending: null,
  /** pièce actuellement en cours de placement */
  movingId: null,
  /** point d'ancrage monde de la 1re paire, pivot de la rotation */
  anchor: null,
};

export function reset() {
  state.pending = null;
  state.movingId = null;
  state.anchor = null;
}

/* ------------------------------------------------------------------ *
 * Géométrie du placement
 * ------------------------------------------------------------------ */

/**
 * Translate `holder` pour amener `from` (monde) sur `to` (monde), dans le plan
 * horizontal. L'altitude est gérée à part : elle vient de l'empilement, pas du
 * clic.
 */
export function translateInPlane(holder, from, to) {
  holder.position.x += to.x - from.x;
  holder.position.z += to.z - from.z;
  holder.updateMatrixWorld(true);
}

/**
 * Fait pivoter `holder` autour de l'axe vertical passant par `pivot` (monde),
 * de façon à amener la direction pivot->from sur la direction pivot->to.
 * @returns {number} angle appliqué, en radians
 */
export function rotateAround(holder, pivot, from, to) {
  const a = Math.atan2(from.z - pivot.z, from.x - pivot.x);
  const b = Math.atan2(to.z - pivot.z, to.x - pivot.x);
  let delta = b - a;
  while (delta > Math.PI) delta -= 2 * Math.PI;
  while (delta < -Math.PI) delta += 2 * Math.PI;

  // La rotation doit laisser le pivot immobile : on fait tourner la position du
  // repère autour de lui, en plus de changer son orientation.
  const dx = holder.position.x - pivot.x;
  const dz = holder.position.z - pivot.z;
  const cos = Math.cos(delta);
  const sin = Math.sin(delta);
  holder.position.x = pivot.x + dx * cos - dz * sin;
  holder.position.z = pivot.z + dx * sin + dz * cos;

  // Attention au signe : la matrice de rotation Y de Three.js envoie
  // (x, z) sur (x·cosθ + z·sinθ, −x·sinθ + z·cosθ), soit une rotation de −θ
  // dans la convention atan2(z, x) utilisée ci-dessus pour mesurer l'angle.
  // Sans ce signe, orientation et position tournent en sens contraires et le
  // pivot dérive.
  holder.rotation.y -= delta;
  holder.updateMatrixWorld(true);
  return delta;
}

/** Distance horizontale entre deux points monde. */
export function planarDistance(a, b) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

/*
 * L'altitude de contact était calculée ici à partir des épaisseurs déclarées.
 * Elle l'est désormais dans js/main.js (restOnSurface), en mesurant la boîte
 * englobante de la pièce TELLE QU'ORIENTÉE : les origines locales diffèrent
 * d'une famille de pièces à l'autre, et une rotation les déplace de toute
 * façon — une pièce retournée par les curseurs a son origine en haut.
 */

/* ------------------------------------------------------------------ *
 * Surbrillance
 * ------------------------------------------------------------------ */

const COLOR_IDLE = 0x6cc7ff;
const COLOR_PENDING = 0xffb454;
const COLOR_ANCHORED = 0x4ec98a;

export function markerColor(kind) {
  return kind === 'pending' ? COLOR_PENDING
    : kind === 'anchored' ? COLOR_ANCHORED
      : COLOR_IDLE;
}

/** Met un repère en évidence sans toucher aux autres (matériau propre). */
export function highlight(marker, kind) {
  const ring = marker.getObjectByName('ring');
  if (!ring) return;
  if (!ring.userData.ownMaterial) {
    ring.material = ring.material.clone();
    ring.userData.ownMaterial = true;
  }
  ring.material.color.setHex(markerColor(kind));
  ring.material.opacity = kind === 'idle' ? 0.75 : 1;
  ring.scale.setScalar(kind === 'idle' ? 1 : 1.45);
}

/* ------------------------------------------------------------------ *
 * Lancer de rayon
 * ------------------------------------------------------------------ */

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

/**
 * Renvoie tous les repères de perçage sous le curseur, du plus proche au plus
 * lointain. Les plaques se recouvrent une fois assemblées : le repère visé
 * n'est pas toujours celui du dessus, c'est à l'appelant de choisir selon le
 * contexte.
 * @param {THREE.Object3D[]} targets disques de sélection
 * @returns {THREE.Object3D[]} repères, sans doublon
 */
export function pickMarkers(event, element, camera, targets) {
  const rect = element.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);

  const markers = [];
  for (const hit of raycaster.intersectObjects(targets, false)) {
    let marker = hit.object;
    while (marker && marker.name !== 'hole') marker = marker.parent;
    if (marker && !markers.includes(marker)) markers.push(marker);
  }
  return markers;
}

/** Premier objet touché parmi `targets`, ou null. */
export function pickFirst(event, element, camera, targets) {
  const rect = element.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(targets, false);
  return hits.length ? hits[0].object : null;
}
