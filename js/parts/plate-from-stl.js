/**
 * Fabrique commune aux quatre plaques dont le contour vient directement d'un
 * fichier STL fourni (déjà en millimètres réels), et non d'une photo tracée :
 * bottom-plate, middle-plate, clamp-plate, top-plate.
 *
 * Évite de réécrire quatre fois la même interface (build/blueprint/meta) —
 * seuls le tracé, l'épaisseur et le nom changent d'une plaque à l'autre.
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
 */
export function plateFromSTL({ trace, id, index, name, thickness, source }) {
  return {
    trace,
    build: (mirrored = false) => plateFromTrace(trace, thickness, mirrored),
    buildFromTrace: (traceMm) => plateFromTrace(traceMm, thickness),
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
