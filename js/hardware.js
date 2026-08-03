/**
 * Visserie : vis et entretoises.
 *
 * Contrairement aux pièces du châssis, la visserie n'a pas à être photographiée
 * ni tracée : elle est normalisée. Un diamètre et une longueur suffisent à la
 * décrire, et les deux se déduisent de l'assemblage — le diamètre du perçage,
 * la longueur de l'écart entre les plaques.
 */

import * as THREE from 'three';

/* ------------------------------------------------------------------ *
 * Catalogue
 * ------------------------------------------------------------------ */

/**
 * Longueurs courantes du commerce, en mm. Une entretoise ou une vis se
 * commande dans cette série : inutile de proposer une cote intermédiaire
 * qui n'existe pas en magasin.
 */
const LENGTH_SERIES = [3, 4, 5, 6, 8, 10, 12, 14, 15, 16, 18, 20, 22, 25, 30, 35, 40, 45, 50];

/**
 * Filetages retenus, avec les cotes qui servent au dessin.
 * `holeRange` sert à reconnaître le filetage d'après le perçage tracé : un
 * perçage de passage est toujours un peu plus large que le diamètre nominal.
 */
export const THREADS = {
  M2: {
    id: 'M2',
    diameter: 2,
    holeRange: [1.7, 2.6],
    headDiameter: 3.8,   // vis à tête cylindrique six pans creux
    headHeight: 1.6,
    acrossFlats: 4,      // entretoise hexagonale
    engagement: 4,       // longueur de vis à visser dans l'entretoise
  },
  M3: {
    id: 'M3',
    diameter: 3,
    holeRange: [2.8, 3.8],
    headDiameter: 5.5,
    headHeight: 2.4,
    acrossFlats: 5.5,
    engagement: 5,
  },
};

/** Filetage correspondant à un perçage, ou null s'il n'en relève pas. */
export function threadForHole(holeDiameter) {
  for (const thread of Object.values(THREADS)) {
    const [min, max] = thread.holeRange;
    if (holeDiameter >= min && holeDiameter <= max) return thread;
  }
  return null;
}

/**
 * Longueur du commerce immédiatement supérieure ou égale.
 * @returns {number} la longueur retenue, ou la valeur demandée si elle
 *          dépasse la série
 */
export function standardLength(needed) {
  return LENGTH_SERIES.find((l) => l >= needed - 0.01) ?? Math.ceil(needed);
}

/* ------------------------------------------------------------------ *
 * Géométrie
 * ------------------------------------------------------------------ */

const STEEL = new THREE.MeshPhysicalMaterial({
  color: 0x9aa3ad, metalness: 0.9, roughness: 0.32,
});
const ANODIZED = new THREE.MeshPhysicalMaterial({
  color: 0x2a2f36, metalness: 0.65, roughness: 0.45,
});

/**
 * Vis à tête cylindrique, axe vertical.
 * L'origine est sous la tête : c'est le plan d'appui sur la pièce, donc le
 * point que l'assemblage connaît.
 * @returns {THREE.Group}
 */
export function screwMesh(thread, length) {
  const group = new THREE.Group();
  group.name = 'screw';

  const shaft = new THREE.Mesh(
    new THREE.CylinderGeometry(thread.diameter / 2, thread.diameter / 2, length, 16),
    STEEL,
  );
  shaft.position.y = -length / 2;

  const head = new THREE.Mesh(
    new THREE.CylinderGeometry(
      thread.headDiameter / 2, thread.headDiameter / 2, thread.headHeight, 20,
    ),
    STEEL,
  );
  head.position.y = thread.headHeight / 2;

  // empreinte six pans, juste pour la lecture de la tête
  const socket = new THREE.Mesh(
    new THREE.CylinderGeometry(
      thread.diameter * 0.42, thread.diameter * 0.42, thread.headHeight * 0.7, 6,
    ),
    ANODIZED,
  );
  socket.position.y = thread.headHeight * 0.65;

  group.add(shaft, head, socket);
  group.castShadow = true;
  return group;
}

/**
 * Entretoise hexagonale, axe vertical, origine à sa base.
 * @returns {THREE.Group}
 */
export function standoffMesh(thread, length) {
  const group = new THREE.Group();
  group.name = 'standoff';

  const radius = thread.acrossFlats / 2 / Math.cos(Math.PI / 6);
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, length, 6),
    ANODIZED,
  );
  body.position.y = length / 2;
  body.rotation.y = Math.PI / 6;

  group.add(body);
  group.castShadow = true;
  return group;
}

/* ------------------------------------------------------------------ *
 * Détection des points de fixation
 * ------------------------------------------------------------------ */

/**
 * Cherche les perçages qui coïncident entre deux pièces d'altitudes
 * différentes : chacun est un point de fixation.
 *
 * On ne compare que des perçages de filetage compatible — deux trous
 * superposés de diamètres incompatibles ne sont pas un point de fixation, mais
 * un passage de fils qui tombe en face d'une vis.
 *
 * @param {{id:string, name:string, y:number, thickness:number,
 *          holes:{x:number, z:number, diameter:number}[]}[]} parts
 *        pièces en coordonnées monde
 * @param {number} tolerance écart planaire admis, en mm
 * @returns {object[]} points de fixation
 */
export function findFastenerSites(parts, tolerance = 0.8) {
  const sites = [];
  const ordered = [...parts].sort((a, b) => a.y - b.y);

  for (let i = 0; i < ordered.length; i++) {
    for (let j = i + 1; j < ordered.length; j++) {
      const lower = ordered[i];
      const upper = ordered[j];
      if (upper.y - lower.y < 0.01) continue; // même niveau : rien à visser

      for (const a of lower.holes) {
        const thread = threadForHole(a.diameter);
        if (!thread) continue;

        for (const b of upper.holes) {
          if (Math.hypot(a.x - b.x, a.z - b.z) > tolerance) continue;
          if (threadForHole(b.diameter) !== thread) continue;

          // faces en regard : dessus de la pièce basse, dessous de la haute
          const gap = (upper.y - upper.thickness / 2) - (lower.y + lower.thickness / 2);
          sites.push({
            x: (a.x + b.x) / 2,
            z: (a.z + b.z) / 2,
            thread,
            gap,
            lower,
            upper,
            offset: Math.hypot(a.x - b.x, a.z - b.z),
          });
          break; // un perçage de la pièce basse ne sert qu'une fois par pièce haute
        }
      }
    }
  }
  return sites;
}

/**
 * Visserie qu'appelle un point de fixation.
 *
 * L'entretoise comble l'écart entre les plaques ; la vis traverse la plaque
 * supérieure et se visse dedans. Si les plaques sont au contact, il n'y a pas
 * d'entretoise et la vis traverse simplement.
 */
export function fastenerFor(site) {
  const needsStandoff = site.gap > 0.5;
  const standoff = needsStandoff ? standardLength(site.gap) : 0;
  const screwNeeded = site.upper.thickness + (needsStandoff ? site.thread.engagement : site.lower.thickness);
  return {
    thread: site.thread,
    standoffLength: standoff,
    screwLength: standardLength(screwNeeded),
    // l'entretoise du commerce ne tombe pas toujours pile sur l'écart mesuré
    standoffPlay: needsStandoff ? standoff - site.gap : 0,
  };
}

/**
 * Ne garde que des fixations suffisamment espacées.
 *
 * Deux plaques qui se ressemblent ont beaucoup de perçages en regard : tous
 * sont des points de fixation *possibles*, mais on ne visse pas deux
 * entretoises à trois millimètres l'une de l'autre. Le tri est glouton, en
 * partant des perçages les plus larges — ce sont ceux qui portent la
 * structure, les petits servant souvent à autre chose.
 *
 * @param {object[]} sites
 * @param {number} minSpacing distance minimale entre deux fixations, en mm
 */
export function spaceOut(sites, minSpacing) {
  if (minSpacing <= 0) return sites;
  const kept = [];
  const ordered = [...sites].sort((a, b) => b.thread.diameter - a.thread.diameter);
  for (const site of ordered) {
    const tooClose = kept.some(
      (k) => Math.hypot(k.x - site.x, k.z - site.z) < minSpacing,
    );
    if (!tooClose) kept.push(site);
  }
  return kept;
}

/** Nomenclature : regroupe la visserie par type et longueur. */
export function billOfMaterials(items) {
  const counts = new Map();
  for (const item of items) {
    const add = (label) => counts.set(label, (counts.get(label) || 0) + 1);
    add(`Vis ${item.thread.id}×${item.screwLength} mm`);
    if (item.standoffLength > 0) {
      add(`Entretoise ${item.thread.id}×${item.standoffLength} mm`);
    }
  }
  return [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => a.label.localeCompare(b.label, 'fr'));
}

/* ------------------------------------------------------------------ *
 * Le sachet de visserie livré avec le châssis
 * ------------------------------------------------------------------ */

/**
 * Contenu exact du sachet Sub250, relevé sur la fiche du fabricant.
 *
 * C'est un stock FINI : c'est lui qui décide des longueurs disponibles, pas
 * la série du commerce. Une fixation qui demanderait du M2×10 ne se sert pas
 * — autant le dire que de dessiner une vis qu'on n'a pas.
 */
export const SCREW_KIT = [
  { id: 'nut-m2', kind: 'nut', thread: 'M2', label: 'Écrou M2', count: 8 },
  { id: 'm2x4.5', kind: 'screw', thread: 'M2', length: 4.5, head: 'round', label: 'M2×4,5', count: 8 },
  { id: 'm2x5', kind: 'screw', thread: 'M2', length: 5, head: 'round', label: 'M2×5', count: 4 },
  { id: 'm2x6', kind: 'screw', thread: 'M2', length: 6, head: 'round', label: 'M2×6', count: 22 },
  { id: 'm2x7', kind: 'screw', thread: 'M2', length: 7, head: 'round', label: 'M2×7', count: 14 },
  { id: 'm2x8', kind: 'screw', thread: 'M2', length: 8, head: 'round', label: 'M2×8', count: 26 },
  { id: 'm2x12', kind: 'screw', thread: 'M2', length: 12, head: 'round', label: 'M2×12', count: 2 },
  { id: 'm2x16', kind: 'screw', thread: 'M2', length: 16, head: 'socket', label: 'M2×16', count: 4 },
];

/** Nombre total de pièces du sachet. */
export const KIT_TOTAL = SCREW_KIT.reduce((n, l) => n + l.count, 0);

/**
 * Écrou six pans, axe vertical, origine à sa base.
 * @returns {THREE.Group}
 */
export function nutMesh(thread) {
  const group = new THREE.Group();
  group.name = 'nut';
  const height = thread.diameter * 0.8;
  const radius = thread.acrossFlats / 2 / Math.cos(Math.PI / 6);
  const body = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, height, 6), ANODIZED);
  body.position.y = height / 2;
  body.rotation.y = Math.PI / 6;
  // le trou fileté, juste pour qu'un écrou se distingue d'une entretoise courte
  const bore = new THREE.Mesh(
    new THREE.CylinderGeometry(thread.diameter / 2, thread.diameter / 2, height * 1.05, 12),
    STEEL,
  );
  bore.position.y = height / 2;
  group.add(body, bore);
  group.castShadow = true;
  return group;
}

/**
 * Répartit le sachet sur les points de fixation trouvés.
 *
 * Pour chaque point, la vis doit traverser la pièce du dessus puis mordre
 * dans ce qu'il y a dessous — l'entretoise si les plaques sont écartées, la
 * pièce basse sinon. On prend alors la PLUS COURTE vis du sachet qui tienne
 * cette longueur : une vis trop longue dépasse et touche l'électronique, une
 * vis trop courte ne prend pas.
 *
 * @param {object[]} sites points de fixation (findFastenerSites)
 * @returns {{assigned:object[], stock:Map, missing:object[]}}
 */
export function allocateFromKit(sites) {
  const stock = new Map(SCREW_KIT.map((l) => [l.id, l.count]));
  const screws = SCREW_KIT
    .filter((l) => l.kind === 'screw')
    .sort((a, b) => a.length - b.length);

  const assigned = [];
  const missing = [];
  // les fixations les plus exigeantes d'abord : sans ça les vis longues
  // partent sur des points qui s'en passeraient, et il n'en reste plus là où
  // elles sont indispensables
  const ordered = [...sites].map((site) => {
    const needsStandoff = site.gap > 0.5;
    const needed = site.upper.thickness
      + (needsStandoff ? site.gap + site.thread.engagement : site.lower.thickness);
    return { site, needed, needsStandoff };
  }).sort((a, b) => b.needed - a.needed);

  for (const item of ordered) {
    const line = screws.find((l) => l.length >= item.needed - 0.01 && stock.get(l.id) > 0);
    if (!line) {
      missing.push(item);
      continue;
    }
    stock.set(line.id, stock.get(line.id) - 1);
    assigned.push({
      ...item,
      line,
      thread: item.site.thread,
      screwLength: line.length,
      standoffLength: item.needsStandoff ? standardLength(item.site.gap) : 0,
      standoffPlay: item.needsStandoff ? standardLength(item.site.gap) - item.site.gap : 0,
    });
  }
  return { assigned, stock, missing };
}
