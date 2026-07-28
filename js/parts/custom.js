/**
 * Pièces créées depuis l'onglet Calibration.
 *
 * Une pièce personnalisée n'est pas un fichier source : c'est un tracé (en mm)
 * plus quelques métadonnées, conservés dans le navigateur. Elle expose la même
 * interface que les pièces livrées avec le projet, donc le viewer ne fait
 * aucune différence entre les deux.
 */

import { plateFromTrace, blueprintFromTrace, holeAnchors } from '../lib/plate.js';
import { findSquares, proposeScales } from '../lib/patterns.js';

const STORAGE_KEY = 'tinyhoop-mk1:custom-parts';

/* ------------------------------------------------------------------ *
 * Persistance
 * ------------------------------------------------------------------ */

/** @returns {object[]} specs enregistrées */
export function loadSpecs() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function saveSpecs(list) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    return true;
  } catch {
    return false; // quota dépassé : la pièce reste en mémoire pour la session
  }
}

/**
 * Enregistre une nouvelle pièce.
 * @param {object} o
 * @param {string} o.name
 * @param {number} o.thickness  en mm
 * @param {number} o.stackHeight altitude dans le build, en mm
 * @param {object} o.traceMm    tracé converti en mm
 * @returns {object} spec créée
 */
export function addSpec({ name, thickness, stackHeight, traceMm }) {
  const list = loadSpecs();
  const spec = {
    id: `custom-${Date.now().toString(36)}`,
    name: name || `Pièce ${list.length + 2}`,
    thickness,
    stackHeight,
    createdAt: new Date().toISOString(),
    trace: {
      // on ne garde que ce qui sert à reconstruire la géométrie
      outline: traceMm.outline,
      holes: traceMm.holes.map((h) => ({
        kind: h.kind,
        points: h.points,
        ...(h.kind === 'circle' ? { cx: h.cx, cy: h.cy, r: h.r } : {}),
      })),
      mmPerPx: traceMm.mmPerPx,
      width: traceMm.width,
      height: traceMm.height,
    },
  };
  list.push(spec);
  spec.persisted = saveSpecs(list);
  return spec;
}

export function removeSpec(id) {
  saveSpecs(loadSpecs().filter((s) => s.id !== id));
}

export function renameSpec(id, name) {
  const list = loadSpecs();
  const s = list.find((x) => x.id === id);
  if (s) { s.name = name; saveSpecs(list); }
}

export function setThickness(id, thickness) {
  const list = loadSpecs();
  const s = list.find((x) => x.id === id);
  if (!s) return;
  s.thickness = thickness;
  saveSpecs(list);
}

/* ------------------------------------------------------------------ *
 * Recalibrage
 * ------------------------------------------------------------------ */

/** Applique un facteur d'échelle à un tracé déjà converti en millimètres. */
function scaleTrace(trace, factor) {
  const point = ([x, y]) => [x * factor, y * factor];
  return {
    outline: trace.outline.map(point),
    holes: trace.holes.map((h) => ({
      ...h,
      points: h.points.map(point),
      ...(h.kind === 'circle'
        ? { cx: h.cx * factor, cy: h.cy * factor, r: h.r * factor }
        : {}),
    })),
    mmPerPx: trace.mmPerPx * factor,
    width: trace.width * factor,
    height: trace.height * factor,
  };
}

/**
 * Échelle qu'impliquent les motifs de perçage normalisés d'une pièce.
 * @returns {{length:number, current:number, factor:number, patterns:string}|null}
 *          null si les motifs ne se confirment pas entre eux
 */
export function proposeRescale(spec) {
  const groups = proposeScales(findSquares(holeAnchors(spec.trace)), spec.trace.height);
  const best = groups[0];
  // un carré isolé peut correspondre à plusieurs standards : on n'agit que
  // lorsque des carrés de tailles différentes désignent la même échelle
  if (!best || best.distinctSquares < 2 || best.spread > best.length * 0.02) return null;
  return {
    length: best.length,
    current: spec.trace.height,
    factor: best.length / spec.trace.height,
    patterns: [...new Set(best.matches.map((m) => m.pattern.name))].join(' + '),
  };
}

/**
 * Recale une pièce sur ses propres perçages.
 *
 * Le résultat distingue les trois cas, qui appellent des réponses différentes :
 * une pièce déjà juste n'est pas un échec de lecture des motifs.
 *
 * @returns {{status:'rescaled'|'already'|'inconclusive'|'unknown'} & object}
 */
export function rescaleToPatterns(id, minRelativeChange = 0.005) {
  const list = loadSpecs();
  const spec = list.find((x) => x.id === id);
  if (!spec) return { status: 'unknown' };

  const proposal = proposeRescale(spec);
  if (!proposal) return { status: 'inconclusive' };
  if (Math.abs(proposal.factor - 1) < minRelativeChange) {
    return { status: 'already', ...proposal };
  }

  spec.trace = scaleTrace(spec.trace, proposal.factor);
  saveSpecs(list);
  return { status: 'rescaled', ...proposal };
}

/* ------------------------------------------------------------------ *
 * Adaptation à l'interface « pièce »
 * ------------------------------------------------------------------ */

/**
 * Emballe une spec en module de pièce (mêmes exports que 01-bottom-plate.js).
 * @param {object} spec
 * @param {number} index numéro d'affichage dans le build
 */
export function toPartModule(spec, index) {
  const t = spec.trace;
  return {
    isCustom: true,
    spec,
    build: () => plateFromTrace(t, spec.thickness),
    blueprint: () => blueprintFromTrace(t),
    meta: {
      id: spec.id,
      index,
      name: spec.name,
      material: `Carbone, ${spec.thickness.toFixed(1)} mm`,
      stackHeight: spec.stackHeight,
      traced: true,
      dims: {
        length: t.height,
        width: t.width,
        thickness: spec.thickness,
        holes: t.holes.length,
        mmPerPx: t.mmPerPx,
      },
    },
  };
}

/** Toutes les pièces personnalisées, prêtes à monter. */
export function loadPartModules(startIndex) {
  return loadSpecs().map((spec, i) => toPartModule(spec, startIndex + i));
}
