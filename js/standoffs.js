/**
 * Entretoises posées à la main.
 *
 * La visserie déduite de l'assemblage (js/hardware.js) ne sait poser que ce
 * qu'elle peut prouver : deux perçages en regard, à deux altitudes. Une
 * entretoise dont on connaît la référence — « M2×4×22 » — mais pas encore
 * l'emplacement n'entre pas dans ce cadre. Elle est donc gérée à part : on la
 * crée d'après sa référence, elle apparaît dans la scène, et on la place d'un
 * clic sur un perçage.
 *
 * Une entretoise non placée reste visible et signalée comme telle : mieux vaut
 * une pièce en attente qu'une pièce posée au hasard.
 */

import * as THREE from 'three';

const STORAGE_KEY = 'tinyhoop-mk1:standoffs';

/* ------------------------------------------------------------------ *
 * Référence
 * ------------------------------------------------------------------ */

/**
 * Une entretoise se désigne par filetage × sur-plats × longueur, dans cet
 * ordre : c'est la référence du commerce, et les trois cotes suffisent à la
 * dessiner.
 */
export function reference(spec) {
  return `${spec.threadId}×${trim(spec.acrossFlats)}×${trim(spec.length)}`;
}

const trim = (n) => String(Number(n.toFixed(2)));

/**
 * Crée un lot d'entretoises identiques, non placées.
 * @param {{threadId:string, diameter:number, acrossFlats:number,
 *          length:number, count:number}} o
 */
export function create({ threadId, diameter, acrossFlats, length, count }) {
  const stamp = Date.now().toString(36);
  return Array.from({ length: count }, (_, i) => ({
    id: `so-${stamp}-${i}`,
    threadId,
    diameter,
    acrossFlats,
    length,
    // null tant que l'entretoise n'a pas reçu d'emplacement
    x: null, y: null, z: null,
    // origine du placement, pour savoir ce qui est vérifié et ce qui est supposé
    source: null, // 'auto' | 'click' | null
    holeLabel: null,
  }));
}

/* ------------------------------------------------------------------ *
 * Persistance
 * ------------------------------------------------------------------ */

export function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function save(list) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch { /* stockage indisponible : le lot reste valable pour la session */ }
}

/* ------------------------------------------------------------------ *
 * Géométrie
 * ------------------------------------------------------------------ */

const ANODIZED = new THREE.MeshPhysicalMaterial({
  color: 0x2a2f36, metalness: 0.65, roughness: 0.45,
});
const PENDING = new THREE.MeshPhysicalMaterial({
  color: 0x8a5a1e, metalness: 0.55, roughness: 0.5,
  emissive: 0x241300, emissiveIntensity: 1,
});
const SELECTED = new THREE.MeshPhysicalMaterial({
  color: 0x2f6f8f, metalness: 0.6, roughness: 0.4,
  emissive: 0x14384f, emissiveIntensity: 1,
});
const BORE = new THREE.MeshStandardMaterial({
  color: 0x14171c, roughness: 0.9, side: THREE.BackSide,
});

export function materialFor(spec, selected) {
  if (selected) return SELECTED;
  return spec.x === null ? PENDING : ANODIZED;
}

/**
 * Entretoise hexagonale femelle/femelle, axe vertical, origine à sa base.
 *
 * L'alésage est dessiné comme un tube vu de l'intérieur : c'est ce qui
 * distingue à l'œil une entretoise taraudée d'un simple plot, et ça ne coûte
 * qu'un cylindre ouvert.
 *
 * @param {object} spec
 * @param {boolean} [selected]
 * @returns {THREE.Group}
 */
export function standoffMesh(spec, selected = false) {
  const group = new THREE.Group();
  group.name = 'standoff-manual';
  group.userData.standoffId = spec.id;

  const radius = spec.acrossFlats / 2 / Math.cos(Math.PI / 6);
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, spec.length, 6),
    materialFor(spec, selected),
  );
  // pas 'body' : ce nom déclenche la mise en transparence du calque photo,
  // qui ne concerne que les plaques
  body.name = 'standoff-body';
  body.position.y = spec.length / 2;
  body.rotation.y = Math.PI / 6; // un plat face à l'observateur
  body.castShadow = true;

  const bore = new THREE.Mesh(
    new THREE.CylinderGeometry(
      spec.diameter / 2, spec.diameter / 2, spec.length - 0.02, 16, 1, true,
    ),
    BORE,
  );
  bore.name = 'bore';
  bore.position.y = spec.length / 2;

  group.add(body, bore);
  return group;
}

/* ------------------------------------------------------------------ *
 * Proposition d'emplacements
 * ------------------------------------------------------------------ */

/**
 * Cherche où poser un lot d'entretoises d'une longueur donnée.
 *
 * Le critère est strict : l'écart entre les deux plaques doit valoir la
 * longueur de l'entretoise, à `tolerance` près. Une entretoise ne rattrape pas
 * un écart — elle l'impose. S'il n'existe aucun couple de plaques à la bonne
 * distance, mieux vaut ne rien poser et le dire.
 *
 * @param {object[]} sites points de fixation détectés (js/hardware.js)
 * @param {number} length longueur de l'entretoise, en mm
 * @param {number} count nombre d'entretoises à poser
 * @param {number} tolerance écart admis sur la hauteur, en mm
 * @returns {{sites:object[], gap:number|null, nearest:number|null}}
 */
export function proposeSites(sites, length, count, tolerance = 0.6) {
  const fitting = sites.filter((s) => Math.abs(s.gap - length) <= tolerance);
  if (!fitting.length) {
    // de quoi expliquer le refus : l'écart le plus proche de la longueur voulue
    let nearest = null;
    for (const s of sites) {
      if (nearest === null || Math.abs(s.gap - length) < Math.abs(nearest - length)) {
        nearest = s.gap;
      }
    }
    return { sites: [], gap: null, nearest };
  }
  return { sites: spread(fitting, count), gap: fitting[0].gap, nearest: null };
}

/**
 * Retient `count` emplacements aussi éloignés que possible les uns des autres.
 *
 * Des entretoises servent à tenir une plaque : les répartir sur son pourtour
 * est ce qui la rigidifie. On part de la paire la plus écartée, puis on ajoute
 * à chaque tour le point le plus éloigné de ceux déjà retenus.
 */
export function spread(sites, count) {
  if (sites.length <= count) return sites.slice();
  const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

  let best = [0, 1];
  let bestD = -1;
  for (let i = 0; i < sites.length; i++) {
    for (let j = i + 1; j < sites.length; j++) {
      const d = dist(sites[i], sites[j]);
      if (d > bestD) { bestD = d; best = [i, j]; }
    }
  }
  const kept = [sites[best[0]], sites[best[1]]];

  while (kept.length < count) {
    let pick = null;
    let pickD = -1;
    for (const s of sites) {
      if (kept.includes(s)) continue;
      const d = Math.min(...kept.map((k) => dist(k, s)));
      if (d > pickD) { pickD = d; pick = s; }
    }
    if (!pick) break;
    kept.push(pick);
  }
  return kept;
}

/* ------------------------------------------------------------------ *
 * Restitution des coordonnées
 * ------------------------------------------------------------------ */

/**
 * Coordonnées des entretoises, en texte reprenable tel quel.
 * X et Z sont dans le plan du châssis, Y est l'altitude de la base.
 */
export function coordinateReport(list) {
  const lines = list.map((s, i) => {
    const ref = reference(s);
    if (s.x === null) return `${i + 1}. ${ref} — non placée`;
    const origin = s.source === 'auto' ? 'auto' : 'clic';
    return `${i + 1}. ${ref} — X ${s.x.toFixed(2)} · Y ${s.y.toFixed(2)} `
      + `· Z ${s.z.toFixed(2)} mm (${origin}${s.holeLabel ? `, ${s.holeLabel}` : ''})`;
  });
  return `Entretoises — repère châssis, Y = altitude de la base\n${lines.join('\n')}\n`;
}
