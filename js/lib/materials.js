/**
 * Matériaux procéduraux (aucune texture externe : tout est généré au runtime,
 * le viewer fonctionne hors-ligne).
 */

import * as THREE from 'three';

/** Tissage carbone 3K sergé 2x2, généré sur un canvas. */
function carbonTwillTexture(size = 512, cell = 32) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');

  g.fillStyle = '#0b0c0e';
  g.fillRect(0, 0, size, size);

  const n = size / cell;
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      // sergé 2x2 : le brin est "dessus" selon (i + j) % 4
      const over = (i + j) % 4 < 2;
      const x = i * cell;
      const y = j * cell;

      const grad = g.createLinearGradient(
        x, y,
        over ? x + cell : x,
        over ? y : y + cell,
      );
      grad.addColorStop(0, '#0d0f12');
      grad.addColorStop(0.45, '#282c32');
      grad.addColorStop(0.55, '#2f343b');
      grad.addColorStop(1, '#0d0f12');
      g.fillStyle = grad;
      g.fillRect(x, y, cell, cell);

      // fibres fines dans le sens du brin
      g.strokeStyle = 'rgba(255,255,255,0.045)';
      g.lineWidth = 1;
      for (let k = 2; k < cell; k += 3) {
        g.beginPath();
        if (over) {
          g.moveTo(x, y + k);
          g.lineTo(x + cell, y + k);
        } else {
          g.moveTo(x + k, y);
          g.lineTo(x + k, y + cell);
        }
        g.stroke();
      }
      // ombre de croisement
      g.fillStyle = 'rgba(0,0,0,0.22)';
      if (over) g.fillRect(x, y + cell - 2, cell, 2);
      else g.fillRect(x + cell - 2, y, 2, cell);
    }
  }

  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

let _carbonTex = null;

/**
 * Carbone verni (résine époxy brillante).
 * @param {number} repeat nombre de motifs par 100 mm
 */
export function carbonMaterial(repeat = 6) {
  if (!_carbonTex) _carbonTex = carbonTwillTexture();
  const map = _carbonTex.clone();
  map.needsUpdate = true;
  map.repeat.set(repeat, repeat);

  return new THREE.MeshPhysicalMaterial({
    map,
    color: 0xffffff,
    roughness: 0.34,
    metalness: 0.08,
    clearcoat: 1.0,
    clearcoatRoughness: 0.08,
    side: THREE.DoubleSide,
  });
}

/** Tranche de carbone (chant scié, mat, pas de tissage visible). */
export function carbonEdgeMaterial() {
  return new THREE.MeshPhysicalMaterial({
    color: 0x1c1f24,
    roughness: 0.62,
    metalness: 0.05,
    clearcoat: 0.25,
  });
}

/** Plastique imprimé, mat : pièces importées telles quelles d'un fichier CAO. */
export function printedMaterial(color = 0x393f47) {
  return new THREE.MeshPhysicalMaterial({
    color, roughness: 0.55, metalness: 0.06, clearcoat: 0.12, clearcoatRoughness: 0.4,
  });
}

/** Teinte d'origine de chaque matière, quand on veut revenir en arrière. */
export const DEFAULT_TINT = { carbone: 0xffffff, imprime: 0x393f47 };

/**
 * Applique une couleur à une pièce SANS lui faire perdre sa matière.
 *
 * Le carbone garde son tissage : la couleur multiplie la texture, comme un
 * carbone teinté dans la masse — un bleu roi sur du sergé reste du sergé. Une
 * teinte claire y perdrait tout contraste, on la retient donc à mi-chemin du
 * blanc. Le plastique imprimé, lui, prend la couleur pleine : une bobine de
 * TPU bleu est bleue de bout en bout.
 *
 * @param {THREE.Material} material matériau de la pièce
 * @param {string} kind 'carbone' | 'imprime'
 * @param {number|null} hex couleur demandée, ou null pour la teinte d'origine
 */
export function tintMaterial(material, kind, hex) {
  const carbon = kind === 'carbone';
  if (hex === null || hex === undefined) {
    material.color.setHex(DEFAULT_TINT[carbon ? 'carbone' : 'imprime']);
  } else if (carbon) {
    // le tissage est sombre : une couleur trop claire l'écraserait, on
    // l'assombrit un peu pour que la trame reste lisible
    const c = new THREE.Color(hex);
    const l = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
    if (l > 0.55) c.multiplyScalar(0.55 / l);
    material.color.copy(c);
  } else {
    material.color.setHex(hex);
  }
  // une matière peinte reste ce qu'elle est : le carbone garde son vernis
  // brillant, l'imprimé son aspect mat
  material.needsUpdate = true;
}

/** Fil de contour blanc pour la lisibilité des arêtes. */
export function outlineMaterial() {
  return new THREE.LineBasicMaterial({ color: 0x6cc7ff, transparent: true, opacity: 0.55 });
}
