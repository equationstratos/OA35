/**
 * Calibration par motif de perçage normalisé.
 *
 * Mettre une pièce à l'échelle par sa longueur hors-tout suppose de connaître
 * cette longueur : à défaut, on la devine, et deux pièces calibrées séparément
 * ne s'emboîtent pas.
 *
 * Les châssis FPV portent en revanche des motifs de fixation normalisés — le
 * carré de 20×20 mm ou 25,5×25,5 mm des contrôleurs de vol, le 30,5×30,5 des
 * cartes pleine taille. Retrouver un de ces carrés dans les perçages tracés
 * donne l'échelle exacte, sans aucune mesure, et surtout la même pour toutes
 * les pièces d'un même châssis.
 */

/**
 * Entraxes normalisés, en mm.
 *
 * Deux familles : les platines de contrôleur de vol, et les fixations moteur.
 * Les secondes sont indispensables aux bras, qui ne portent en général aucun
 * motif de la première.
 */
export const STANDARD_PATTERNS = [
  { side: 6, name: '6 × 6 (moteur)' },
  { side: 9, name: '9 × 9 (moteur)' },
  { side: 12, name: '12 × 12 (moteur)' },
  { side: 16, name: '16 × 16 (moteur ou FC)' },
  { side: 19, name: '19 × 19 (moteur)' },
  { side: 20, name: '20 × 20 (FC)' },
  { side: 25.5, name: '25,5 × 25,5 (FC)' },
  { side: 30.5, name: '30,5 × 30,5 (FC)' },
];

/**
 * Cherche les carrés formés par quatre perçages.
 *
 * On parcourt les paires de trous comme diagonales possibles : les deux autres
 * sommets d'un carré s'en déduisent, il suffit de vérifier qu'un perçage s'y
 * trouve. C'est en O(n³) au pire mais n vaut quelques dizaines.
 *
 * @param {{x:number,y:number,r:number}[]} anchors centres de perçage
 * @param {number} tolerance écart admis sur la position d'un sommet
 * @returns {{side:number, diameter:number, holes:number[]}[]}
 */
export function findSquares(anchors, tolerance = 0.6) {
  const found = new Map();

  const nearest = (px, py) => {
    let best = -1;
    let bestD = tolerance;
    for (let k = 0; k < anchors.length; k++) {
      const d = Math.hypot(anchors[k].x - px, anchors[k].y - py);
      if (d < bestD) { bestD = d; best = k; }
    }
    return best;
  };

  for (let i = 0; i < anchors.length; i++) {
    for (let j = i + 1; j < anchors.length; j++) {
      const cx = (anchors[i].x + anchors[j].x) / 2;
      const cy = (anchors[i].y + anchors[j].y) / 2;
      const dx = (anchors[j].x - anchors[i].x) / 2;
      const dy = (anchors[j].y - anchors[i].y) / 2;

      // sommets de l'autre diagonale, perpendiculaire et de même longueur
      const k = nearest(cx - dy, cy + dx);
      const l = nearest(cx + dy, cy - dx);
      if (k < 0 || l < 0 || k === i || k === j || l === i || l === j) continue;

      const quad = [i, k, j, l];
      const id = quad.slice().sort((a, b) => a - b).join(',');
      if (found.has(id)) continue;

      const side = Math.hypot(anchors[i].x - anchors[k].x, anchors[i].y - anchors[k].y);
      const diameter = quad.reduce((s, n) => s + anchors[n].r * 2, 0) / 4;
      found.set(id, { side, diameter, holes: quad });
    }
  }
  return [...found.values()].sort((a, b) => a.side - b.side);
}

/**
 * Confronte les carrés détectés aux motifs normalisés et regroupe les échelles
 * compatibles.
 *
 * Un carré isolé est ambigu : il peut correspondre à plusieurs standards. Mais
 * quand plusieurs carrés de tailles différentes désignent la même échelle, la
 * lecture n'est plus une supposition — les motifs se confirment entre eux.
 *
 * @param {{side:number,diameter:number,holes:number[]}[]} squares mesurés dans l'échelle courante
 * @param {number} currentLength plus grande dimension de la pièce, dans cette
 *        même échelle
 * @returns {{length:number, matches:object[], spread:number}[]} du plus étayé au moins
 */
export function proposeScales(squares, currentLength, relativeTolerance = 0.02) {
  const readings = [];
  for (const square of squares) {
    for (const pattern of STANDARD_PATTERNS) {
      const length = (currentLength * pattern.side) / square.side;
      if (length < 20 || length > 400) continue; // hors de toute pièce plausible
      readings.push({ length, square, pattern });
    }
  }

  // regroupement des lectures qui désignent la même longueur
  const groups = [];
  for (const reading of readings) {
    const group = groups.find(
      (g) => Math.abs(g.length - reading.length) / g.length < relativeTolerance,
    );
    if (group) {
      group.matches.push(reading);
      group.length = group.matches.reduce((s, m) => s + m.length, 0) / group.matches.length;
    } else {
      groups.push({ length: reading.length, matches: [reading] });
    }
  }

  for (const g of groups) {
    const lengths = g.matches.map((m) => m.length);
    g.spread = Math.max(...lengths) - Math.min(...lengths);
    // un motif confirmé par des carrés de tailles différentes vaut mieux qu'un
    // même carré relu plusieurs fois
    g.distinctSquares = new Set(g.matches.map((m) => m.square.side.toFixed(2))).size;
    g.diameter = g.matches.reduce(
      (s, m) => s + (m.square.diameter * m.length) / currentLength, 0,
    ) / g.matches.length;
  }

  // à qualité égale, le motif déjà retenu ailleurs passe devant
  return groups.sort(
    (a, b) => b.distinctSquares - a.distinctSquares
      || (usesPreferred(b) ? 1 : 0) - (usesPreferred(a) ? 1 : 0)
      || a.spread - b.spread,
  );
}

const PREFERRED_KEY = 'tinyhoop-mk1:preferred-pattern';

/**
 * Mémorise le motif retenu par l'auteur.
 *
 * Les pièces d'un même châssis partagent leurs standards — quatre bras portent
 * le même carré moteur. Rappeler le choix précédent évite d'attribuer deux
 * standards différents à deux pièces qui ont pourtant le même motif, ce qui
 * les rendrait incompatibles sans que rien ne le signale.
 */
export function rememberPattern(side) {
  try { localStorage.setItem(PREFERRED_KEY, String(side)); } catch { /* ignore */ }
}

export function preferredPattern() {
  try {
    const v = Number(localStorage.getItem(PREFERRED_KEY));
    return Number.isFinite(v) && v > 0 ? v : null;
  } catch {
    return null;
  }
}

/** Le groupe repose-t-il sur le motif déjà retenu ailleurs ? */
export function usesPreferred(group) {
  const preferred = preferredPattern();
  return preferred !== null && group.matches.some((m) => m.pattern.side === preferred);
}

/** Libellé court d'une proposition, pour l'interface. */
export function describe(group) {
  const patterns = [...new Set(group.matches.map((m) => m.pattern.name))].join(' + ');
  return `${group.length.toFixed(1)} mm — motifs ${patterns}`
    + ` (${group.distinctSquares} carré${group.distinctSquares > 1 ? 's' : ''}`
    + `, écart ${group.spread.toFixed(2)} mm, perçages Ø${group.diameter.toFixed(2)} mm)`
    + (usesPreferred(group) ? '\n↳ même motif que la pièce précédente' : '');
}
