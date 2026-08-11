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

/* ------------------------------------------------------------------ *
 * Matières du moteur
 *
 * Un moteur n'est pas d'une seule matière : aluminium anodisé noir pour la
 * cloche et l'embase, anodisation turquoise sur les arêtes des ouvertures,
 * cuivre pour les bobinages, acier pour l'arbre et les tôles, silicone noir
 * pour les fils. Elles cohabitent sur UN seul maillage, par plages de faces.
 *
 * Celles qui sont marquées `fixedTint` refusent le sélecteur de couleur : on
 * peut repeindre une cloche, pas du cuivre. Les autres portent leur teinte
 * d'usine dans `baseTint`, pour savoir où revenir quand on efface la couleur.
 * ------------------------------------------------------------------ */

/** Aluminium anodisé noir : cloche et embase. */
export function anodizedMaterial(color = 0x2e3238) {
  // La scène n'a PAS de carte d'environnement : un métal à fort `metalness`
  // n'a rien à réfléchir et sort noir. D'où un metalness modéré et un léger
  // vernis, qui donnent l'aspect satiné de l'anodisation sous ces lumières.
  const m = new THREE.MeshPhysicalMaterial({
    color, metalness: 0.32, roughness: 0.42, clearcoat: 0.5, clearcoatRoughness: 0.25,
  });
  m.userData.baseTint = color;
  return m;
}

/** Anodisation turquoise : le liseré des ouvertures. */
export function accentMaterial(color = 0x18b3a4) {
  const m = new THREE.MeshPhysicalMaterial({
    color, metalness: 0.35, roughness: 0.3, clearcoat: 0.6,
    emissive: 0x04322e,
  });
  m.userData.fixedTint = true;
  return m;
}

/** Acier clair : arbre, bout d'arbre. */
export function steelMaterial() {
  const m = new THREE.MeshPhysicalMaterial({
    color: 0xd2d8e0, metalness: 0.45, roughness: 0.25, emissive: 0x2b3138,
  });
  m.userData.fixedTint = true;
  return m;
}

/** Tôles de stator : gris clair mat, ce qu'on aperçoit entre les bobines. */
export function laminationMaterial() {
  const m = new THREE.MeshPhysicalMaterial({
    color: 0xa8b0ba, metalness: 0.5, roughness: 0.5, emissive: 0x14181d,
  });
  m.userData.fixedTint = true;
  return m;
}

/**
 * Couronne d'aimants, collée dans la cloche.
 *
 * Sombre, et c'est une correction : en gris clair, elle se voyait par la
 * tranche du fût — au bord de la silhouette, les faces arrière du fût sont
 * écartées et laissent voir l'intérieur, qui paraissait alors bordé de blanc.
 */
export function magnetMaterial() {
  const m = new THREE.MeshPhysicalMaterial({
    color: 0x1b1e23, metalness: 0.4, roughness: 0.72,
  });
  m.userData.fixedTint = true;
  return m;
}

/** Silicone noir des fils moteur. */
export function wireMaterial() {
  const m = new THREE.MeshPhysicalMaterial({
    color: 0x14161a, metalness: 0.0, roughness: 0.65,
  });
  m.userData.fixedTint = true;
  return m;
}

let _coilTex = null;

/** Spires de fil émaillé, dessinées en travers de l'axe de la bobine. */
function coilTexture(turns = 11) {
  const c = document.createElement('canvas');
  c.width = 32; c.height = 256;
  const g = c.getContext('2d');
  const pitch = c.height / turns;
  for (let i = 0; i < turns; i++) {
    const y = i * pitch;
    const grad = g.createLinearGradient(0, y, 0, y + pitch);
    grad.addColorStop(0.0, '#5a2f16');
    grad.addColorStop(0.35, '#c9723a');
    grad.addColorStop(0.55, '#e59a5c');
    grad.addColorStop(1.0, '#5a2f16');
    g.fillStyle = grad;
    g.fillRect(0, y, c.width, pitch + 0.5);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Cuivre bobiné : la matière porte les spires, pas la géométrie. */
export function copperMaterial() {
  if (!_coilTex) _coilTex = coilTexture();
  const m = new THREE.MeshPhysicalMaterial({
    map: _coilTex, color: 0xffffff, metalness: 0.45, roughness: 0.38,
    emissive: 0x2a1408,
  });
  m.userData.fixedTint = true;
  return m;
}

/**
 * Le fût gravé de la cloche.
 *
 * Le lettrage est peint dans une texture générée au vol : le visualiseur ne
 * charge aucun fichier externe, et un moteur d'une autre référence se décrit
 * en changeant deux chaînes plutôt qu'une image.
 */
export function bellLabelMaterial(designation = '1804', kv = 3450, color = 0x2e3238) {
  const c = document.createElement('canvas');
  c.width = 2048; c.height = 256;
  const g = c.getContext('2d');

  const hex = `#${color.toString(16).padStart(6, '0')}`;
  g.fillStyle = hex;
  g.fillRect(0, 0, c.width, c.height);

  g.fillStyle = '#eef2f6';
  g.textBaseline = 'middle';
  g.textAlign = 'center';

  g.font = '600 74px "DejaVu Sans", Helvetica, Arial, sans-serif';
  g.fillText('Sub250', c.width * 0.15, c.height * 0.52);

  g.font = '600 88px "DejaVu Sans", Helvetica, Arial, sans-serif';
  g.fillText(designation, c.width * 0.47, c.height * 0.52);

  g.font = '600 64px "DejaVu Sans", Helvetica, Arial, sans-serif';
  g.fillText(`${kv}KV`, c.width * 0.76, c.height * 0.52);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;

  const m = new THREE.MeshPhysicalMaterial({
    map: tex, color: 0xffffff, metalness: 0.32, roughness: 0.42,
    clearcoat: 0.5, clearcoatRoughness: 0.25,
  });
  m.userData.baseTint = 0xffffff;
  return m;
}

/* ------------------------------------------------------------------ *
 * Matières de l'hélice
 * ------------------------------------------------------------------ */

/** Polycarbonate d'hélice : noir profond, un peu satiné. */
export function propellerMaterial(color = 0x1d2026) {
  const m = new THREE.MeshPhysicalMaterial({
    color, metalness: 0.05, roughness: 0.36,
    clearcoat: 0.7, clearcoatRoughness: 0.2,
  });
  m.userData.baseTint = color;
  return m;
}

/** Moyeu d'hélice : même matière, teinte à peine plus claire. */
export function propHubMaterial(color = 0x282c33) {
  const m = new THREE.MeshPhysicalMaterial({
    color, metalness: 0.05, roughness: 0.42, clearcoat: 0.5,
  });
  m.userData.baseTint = color;
  return m;
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
  // Une pièce peut porter plusieurs matières — un moteur en a six. Elles se
  // teintent chacune selon sa nature, pas toutes de la même couleur.
  if (Array.isArray(material)) {
    material.forEach((m) => tintMaterial(m, kind, hex));
    return;
  }
  // le cuivre d'un bobinage ne se repeint pas : la matière le déclare
  if (material.userData && material.userData.fixedTint) return;

  const carbon = kind === 'carbone';
  if (hex === null || hex === undefined) {
    // une matière qui connaît sa teinte d'usine y revient ; les autres
    // reprennent celle de leur famille
    const base = material.userData ? material.userData.baseTint : undefined;
    material.color.setHex(base ?? DEFAULT_TINT[carbon ? 'carbone' : 'imprime']);
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

/**
 * LE CHANFREIN.
 *
 * Ce n'est pas le surlignage d'arêtes, qui est un calque de lecture qu'on
 * allume et qu'on éteint. C'est une caractéristique de la PIÈCE : l'angle
 * d'usinage de ses arêtes accroche la lumière et dessine un filet clair tout
 * autour du contour et des ouvertures — sur les joues du support caméra, il
 * est aussi net sur la vraie pièce que sur le rendu.
 *
 * Il reste donc visible quand le surlignage est décoché : éteindre une aide à
 * la lecture ne doit pas effacer une arête réellement chanfreinée.
 */
export function chamferMaterial() {
  return new THREE.LineBasicMaterial({ color: 0xe9eef5, transparent: true, opacity: 0.9 });
}
