/**
 * Calibration : charge la photo de la pièce, la trace au pixel près et
 * l'affiche en transparence par-dessus le modèle pour contrôle visuel.
 */

import {
  traceImage, traceToMm, otsuThreshold, buildMask, denoise, referenceDimension,
} from './lib/trace.js';
import { holeAnchors } from './lib/plate.js';
import { findSquares, proposeScales } from './lib/patterns.js';

const STORAGE_KEY = 'tinyhoop-mk1:ref-image';

export const state = {
  image: null,        // HTMLImageElement
  imageData: null,    // ImageData
  trace: null,        // tracé en pixels
  traceMm: null,      // tracé en mm
  opacity: 0.55,
  applied: false,
  /** échelles déduites des motifs de perçage normalisés */
  scaleProposals: [],
  /**
   * Provenance de l'échelle courante :
   *   'patterns' motifs normalisés concordants · 'manual' saisie explicite
   *   'inherited' valeur laissée par la pièce précédente — jamais fiable
   */
  scaleSource: null,
};

/* ------------------------------------------------------------------ *
 * Chargement de l'image
 * ------------------------------------------------------------------ */

export function loadFromDataURL(dataURL) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      const g = c.getContext('2d', { willReadFrequently: true });
      g.drawImage(img, 0, 0);
      state.image = img;
      state.imageData = g.getImageData(0, 0, c.width, c.height);
      // une nouvelle pièce ne peut pas hériter de l'échelle de la précédente
      state.scaleSource = null;
      state.scaleProposals = [];
      resolve(state.imageData);
    };
    img.onerror = () => reject(new Error("Image illisible"));
    img.src = dataURL;
  });
}

export function loadFromFile(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => {
      try { localStorage.setItem(STORAGE_KEY, fr.result); } catch { /* quota */ }
      loadFromDataURL(fr.result).then(resolve, reject);
    };
    fr.onerror = () => reject(new Error('Lecture du fichier impossible'));
    fr.readAsDataURL(file);
  });
}

export function restoreSaved() {
  let saved = null;
  try { saved = localStorage.getItem(STORAGE_KEY); } catch { /* privé */ }
  return saved ? loadFromDataURL(saved) : Promise.resolve(null);
}

export function forget() {
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
  state.image = null;
  state.imageData = null;
  state.trace = null;
  state.traceMm = null;
  state.applied = false;
}

/* ------------------------------------------------------------------ *
 * Tracé
 * ------------------------------------------------------------------ */

export function autoThreshold() {
  return state.imageData ? otsuThreshold(state.imageData) : 128;
}

export function run(opts, refLengthMm) {
  if (!state.imageData) throw new Error("Charge d'abord la photo de la pièce.");
  state.trace = traceImage(state.imageData, opts);
  state.traceMm = traceToMm(state.trace, refLengthMm);
  state.scaleProposals = proposeScales(
    findSquares(holeAnchors(state.traceMm)),
    referenceDimension(state.traceMm),
  );
  return state.traceMm;
}

/* ------------------------------------------------------------------ *
 * Rendu du panneau de calibration
 * ------------------------------------------------------------------ */

/**
 * Dessine la photo, le masque binaire éventuel et le contour tracé.
 * @param {HTMLCanvasElement} canvas
 */
export function drawCalibration(canvas, opts = {}) {
  const { showMask = false, threshold = 128, showTrace = true, photoAlpha = 1 } = opts;
  const g = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const W = canvas.clientWidth, H = canvas.clientHeight;
  canvas.width = W * dpr; canvas.height = H * dpr;
  g.setTransform(dpr, 0, 0, dpr, 0, 0);

  g.fillStyle = '#0a0e14';
  g.fillRect(0, 0, W, H);
  if (!state.image) return;

  const iw = state.image.naturalWidth, ih = state.image.naturalHeight;
  const m = 30;
  const s = Math.min((W - m * 2) / iw, (H - m * 2) / ih);
  const ox = (W - iw * s) / 2, oy = (H - ih * s) / 2;

  g.save();
  g.translate(ox, oy);
  g.scale(s, s);

  g.globalAlpha = photoAlpha;
  g.imageSmoothingEnabled = false;
  g.drawImage(state.image, 0, 0);
  g.globalAlpha = 1;

  if (showMask) {
    const mk = denoise(buildMask(state.imageData, threshold), 1);
    const out = g.createImageData(iw, ih);
    for (let i = 0; i < mk.mask.length; i++) {
      const on = mk.mask[i];
      out.data[i * 4] = on ? 108 : 0;
      out.data[i * 4 + 1] = on ? 199 : 0;
      out.data[i * 4 + 2] = on ? 255 : 0;
      out.data[i * 4 + 3] = on ? 150 : 0;
    }
    const tmp = document.createElement('canvas');
    tmp.width = iw; tmp.height = ih;
    tmp.getContext('2d').putImageData(out, 0, 0);
    g.drawImage(tmp, 0, 0);
  }

  if (showTrace && state.trace) {
    g.lineWidth = 1.4 / s;
    g.strokeStyle = '#ff4d6d';
    strokePoly(g, state.trace.outline);
    g.strokeStyle = '#ffb454';
    for (const h of state.trace.holes) strokePoly(g, h.points);

    // repères de bbox
    const b = state.trace.bbox;
    g.strokeStyle = 'rgba(108,199,255,0.85)';
    g.setLineDash([4 / s, 4 / s]);
    g.strokeRect(b.minX, b.minY, b.width, b.height);
    g.setLineDash([]);
  }

  g.restore();

  // légende
  g.fillStyle = '#8fa3bf';
  g.font = '12px ui-monospace, monospace';
  g.fillText(`photo ${iw} x ${ih} px`, 12, H - 30);
  if (state.trace) {
    const b = state.trace.bbox;
    g.fillText(
      `pièce détectée : ${b.width.toFixed(0)} x ${b.height.toFixed(0)} px · ` +
      `${state.trace.holes.length} perçages · seuil ${state.trace.threshold}`,
      12, H - 12,
    );
  }
}

function strokePoly(g, pts) {
  if (!pts || !pts.length) return;
  g.beginPath();
  pts.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])));
  g.closePath();
  g.stroke();
}

/* ------------------------------------------------------------------ *
 * Export du contour
 * ------------------------------------------------------------------ */

/** Génère un module JS figeant le tracé, pour ne plus dépendre de la photo. */
export function exportModule(refLengthMm, thicknessMm) {
  const t = state.trace;
  if (!t) throw new Error('Aucun tracé à exporter.');
  const f = (n) => Number(n.toFixed(3));
  const poly = (pts) => '[' + pts.map((p) => `[${f(p[0])},${f(p[1])}]`).join(',') + ']';

  return `/**
 * Contour tracé automatiquement depuis la photo de la pièce.
 * Coordonnées en PIXELS de l'image source (${t.imageWidth} x ${t.imageHeight}),
 * origine en haut à gauche, Y vers le bas. Généré par l'onglet Calibration.
 */
export const REF_LENGTH_MM = ${refLengthMm};
export const THICKNESS_MM = ${thicknessMm};
export const BBOX = ${JSON.stringify(t.bbox)};
export const OUTLINE_PX = ${poly(t.outline)};
export const HOLES_PX = [
${t.holes.map((h) => h.kind === 'circle'
    ? `  { kind: 'circle', cx: ${f(h.cx)}, cy: ${f(h.cy)}, r: ${f(h.r)}, points: ${poly(h.points)} },`
    : `  { kind: 'poly', points: ${poly(h.points)} },`).join('\n')}
];
`;
}

export function download(filename, text) {
  const blob = new Blob([text], { type: 'text/javascript' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}
