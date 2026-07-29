/**
 * Export des pièces : STL pour la CAO et l'impression, module JS pour figer
 * une pièce dans le dépôt.
 */

/* ------------------------------------------------------------------ *
 * STL binaire
 * ------------------------------------------------------------------ */

/**
 * Convertit une géométrie en STL binaire.
 *
 * Le STL n'a pas d'unité : la convention universelle est le millimètre, et
 * c'est déjà l'unité du modèle, il n'y a donc rien à convertir. La géométrie
 * est prise telle quelle, à plat dans son propre repère — l'orientation
 * attendue par un logiciel de CAO ou un trancheur, pas celle de l'assemblage.
 *
 * @param {THREE.BufferGeometry} geometry
 * @returns {Blob}
 */
export function geometryToSTL(geometry) {
  const position = geometry.attributes.position;
  const index = geometry.index;
  const triangleCount = (index ? index.count : position.count) / 3;

  const buffer = new ArrayBuffer(84 + triangleCount * 50);
  const view = new DataView(buffer);

  // 80 octets d'en-tête libre, puis le nombre de facettes
  view.setUint32(80, triangleCount, true);

  const vertex = (i, out) => {
    const k = index ? index.getX(i) : i;
    out[0] = position.getX(k);
    out[1] = position.getY(k);
    out[2] = position.getZ(k);
  };

  const a = [0, 0, 0], b = [0, 0, 0], c = [0, 0, 0];
  let offset = 84;

  for (let t = 0; t < triangleCount; t++) {
    vertex(t * 3, a);
    vertex(t * 3 + 1, b);
    vertex(t * 3 + 2, c);

    // normale recalculée : celle des sommets peut être lissée, alors qu'une
    // facette STL décrit un plan
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len; ny /= len; nz /= len;

    view.setFloat32(offset, nx, true);
    view.setFloat32(offset + 4, ny, true);
    view.setFloat32(offset + 8, nz, true);

    const corners = [a, b, c];
    for (let k = 0; k < 3; k++) {
      const base = offset + 12 + k * 12;
      view.setFloat32(base, corners[k][0], true);
      view.setFloat32(base + 4, corners[k][1], true);
      view.setFloat32(base + 8, corners[k][2], true);
    }
    view.setUint16(offset + 48, 0, true); // octets d'attribut, inutilisés
    offset += 50;
  }

  return new Blob([buffer], { type: 'model/stl' });
}

/**
 * Contrôle du maillage avant export.
 *
 * Un STL destiné à l'impression doit être fermé et orienté de façon cohérente :
 * chaque arête appartient à exactement deux triangles, parcourus en sens
 * inverse l'un de l'autre. Sinon le trancheur ne distingue plus le plein du
 * vide — et sa « réparation » bouche typiquement les perçages.
 *
 * @returns {{triangles:number, openEdges:number, flippedEdges:number,
 *            volume:number, watertight:boolean}}
 */
export function meshDiagnostics(geometry) {
  const position = geometry.attributes.position;
  const index = geometry.index;
  const count = index ? index.count : position.count;

  const key = (i) => {
    const k = index ? index.getX(i) : i;
    return `${Math.round(position.getX(k) * 1000)},`
      + `${Math.round(position.getY(k) * 1000)},`
      + `${Math.round(position.getZ(k) * 1000)}`;
  };

  const edges = new Map();
  let volume = 0;

  for (let t = 0; t < count; t += 3) {
    for (let k = 0; k < 3; k++) {
      const a = key(t + k);
      const b = key(t + ((k + 1) % 3));
      const id = a < b ? `${a}|${b}` : `${b}|${a}`;
      const direction = a < b ? 1 : -1;
      const entry = edges.get(id) || { count: 0, sum: 0 };
      entry.count++;
      entry.sum += direction;
      edges.set(id, entry);
    }

    const p = [0, 1, 2].map((k) => {
      const i = index ? index.getX(t + k) : t + k;
      return [position.getX(i), position.getY(i), position.getZ(i)];
    });
    volume += (p[0][0] * (p[1][1] * p[2][2] - p[2][1] * p[1][2])
      - p[0][1] * (p[1][0] * p[2][2] - p[2][0] * p[1][2])
      + p[0][2] * (p[1][0] * p[2][1] - p[2][0] * p[1][1])) / 6;
  }

  let openEdges = 0;
  let flippedEdges = 0;
  for (const entry of edges.values()) {
    if (entry.count !== 2) openEdges++;
    else if (entry.sum !== 0) flippedEdges++;
  }

  return {
    triangles: count / 3,
    openEdges,
    flippedEdges,
    volume,
    watertight: openEdges === 0 && flippedEdges === 0,
  };
}

/* ------------------------------------------------------------------ *
 * Module JS
 * ------------------------------------------------------------------ */

const round = (n) => Number(n.toFixed(3));
const polygon = (points) => '[' + points.map((p) => `[${round(p[0])},${round(p[1])}]`).join(',') + ']';

/**
 * Écrit une pièce sous forme de module prêt à déposer dans `js/parts/`.
 *
 * Le fichier est autonome : il contient le tracé en millimètres et expose la
 * même interface que les pièces livrées avec le projet, si bien qu'il suffit
 * de l'importer dans `js/parts/index.js`.
 *
 * @param {object} traceMm tracé en mm
 * @param {{name:string, thickness:number, stackHeight:number, index:number}} meta
 */
export function partModuleSource(traceMm, meta) {
  const holes = traceMm.holes.map((h) => (h.kind === 'circle'
    ? `  { kind: 'circle', cx: ${round(h.cx)}, cy: ${round(h.cy)}, r: ${round(h.r)},`
      + ` points: ${polygon(h.points)} },`
    : `  { kind: 'poly', points: ${polygon(h.points)} },`)).join('\n');

  return `/**
 * ${meta.name}
 *
 * Pièce exportée depuis l'onglet Calibration. Le contour vient du tracé de sa
 * photo, en MILLIMÈTRES, pièce centrée sur l'origine.
 *
 * Pour l'ajouter au build : déposer ce fichier dans js/parts/, puis
 *   import * as piece from './${slug(meta.name)}.js';
 * et l'ajouter au tableau PARTS de js/parts/index.js.
 */

import { plateFromTrace, blueprintFromTrace } from '../lib/plate.js';

/** Épaisseur, en mm. */
export const THICKNESS_MM = ${meta.thickness};

/** Tracé en millimètres : contour extérieur et perçages. */
const TRACE = {
  outline: ${polygon(traceMm.outline)},
  holes: [
${holes}
  ],
  mmPerPx: ${round(traceMm.mmPerPx)},
  width: ${round(traceMm.width)},
  height: ${round(traceMm.height)},
};

export const trace = TRACE;

export function build() {
  return plateFromTrace(TRACE, THICKNESS_MM);
}

export function blueprint() {
  return blueprintFromTrace(TRACE);
}

export const meta = {
  id: '${slug(meta.name)}',
  index: ${meta.index},
  name: ${JSON.stringify(meta.name)},
  material: 'Carbone, ${meta.thickness.toFixed(1)} mm',
  stackHeight: ${meta.stackHeight || 0},
  traced: true,
  dims: {
    length: ${round(traceMm.height)},
    width: ${round(traceMm.width)},
    thickness: ${meta.thickness},
    mmPerPx: ${round(traceMm.mmPerPx)},
    holes: ${traceMm.holes.length},
  },
};
`;
}

/** Nom de fichier sûr, tiré du nom de la pièce. */
export function slug(name) {
  return (name || 'piece')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // accents
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'piece';
}

/** Déclenche le téléchargement d'un contenu. */
export function download(filename, content, type = 'text/plain') {
  const blob = content instanceof Blob ? content : new Blob([content], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
