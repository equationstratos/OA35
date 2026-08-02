/**
 * Fabrique commune aux pièces plates dont le contour vient directement d'un
 * fichier STL fourni (déjà en millimètres réels), et non d'une photo tracée :
 * les quatre plaques du châssis et les quatre bras.
 *
 * Évite de réécrire la même interface (build/blueprint/meta) pour chacune —
 * seuls le tracé, l'épaisseur et le nom changent d'une pièce à l'autre.
 */

import { plateFromTrace, blueprintFromTrace } from '../lib/plate.js';

/**
 * @param {object} o
 * @param {object} o.trace tracé en mm (contour-*.js)
 * @param {string} o.id
 * @param {number} o.index
 * @param {string} o.name
 * @param {number} o.thickness en mm
 * @param {string} o.source une phrase décrivant l'origine du contour
 * @param {boolean} [o.mirrored] pièce symétrique du contour fourni (bras droit
 *        d'une paire dont seul le gauche a été extrait)
 */
export function plateFromSTL({ trace, id, index, name, thickness, source, mirrored = false }) {
  return {
    trace,
    // le miroir propre à la pièce et celui du bouton se composent
    build: (flip = false) => plateFromTrace(trace, thickness, mirrored !== flip),
    buildFromTrace: (traceMm) => plateFromTrace(traceMm, thickness, mirrored),
    blueprint: () => blueprintFromTrace(trace),
    meta: {
      id,
      index,
      name,
      material: `Carbone, ${thickness.toFixed(1)} mm`,
      stackHeight: 0,
      traced: true,
      source,
      dims: {
        length: trace.height,
        width: trace.width,
        thickness,
        mmPerPx: trace.mmPerPx,
        holes: trace.holes.length,
      },
    },
  };
}
