/**
 * MOTEUR BRUSHLESS 1804 — dessiné, pas importé.
 *
 * Les autres pièces du build viennent d'un fichier STL ou du tracé d'une
 * photo. Le moteur, lui, n'a ni l'un ni l'autre : il est RECONSTRUIT ici à
 * partir des photos du fabricant, cote par cote. C'est ce qui permet d'en
 * garder les arêtes vives — un maillage voxelisé les aurait arrondies — et de
 * le décrire par des paramètres plutôt que par un demi-million de triangles.
 *
 * CE QUE LES PHOTOS DONNENT, et qui est repris ici :
 *
 *  - la cloche à SIX OUVERTURES, chacune cerclée d'un liseré turquoise. Le
 *    liseré n'est pas une couleur peinte sur l'arête : c'est un deuxième
 *    plateau, légèrement en retrait sous le plateau noir et percé plus petit.
 *    Vu de dessus, la tranche noire descend, puis une bande turquoise, puis le
 *    vide — exactement ce qu'on voit sur la pièce.
 *  - le MOYEU CENTRAL, en relief, avec son téton d'arbre et ses quatre petits
 *    perçages sur un cercle de Ø6,2.
 *  - le FÛT GRAVÉ « Sub250 », « 1804 » et le KV, en blanc sur le noir anodisé.
 *    Le lettrage est peint dans une texture générée au vol : aucun fichier
 *    externe, le visualiseur marche hors-ligne.
 *  - le STATOR À DOUZE DENTS bobiné de cuivre, qu'on aperçoit par les
 *    ouvertures — sans lui, la cloche est une boîte vide et ça se voit.
 *  - l'EMBASE EN CROIX à quatre pattes, entraxe 12 × 12 mm, et les TROIS FILS
 *    plats qui sortent sur le côté.
 *
 * Le KV est lu sur la photo, où le fût porte « 34.. » : c'est donc 3450 KV, la
 * seule valeur en 34xx du catalogue. Si le tien est un 2450, il n'y a qu'une
 * chaîne à changer, en bas de ce fichier.
 *
 * Repère : axe sur Z, face de fixation à z = 0, comme un export CAO. C'est
 * `build()` qui le bascule dans le repère de la scène, exactement comme pour
 * les pièces importées.
 */

import * as THREE from 'three';
import {
  anodizedMaterial, accentMaterial, copperMaterial,
  steelMaterial, laminationMaterial, magnetMaterial, wireMaterial,
  bellLabelMaterial,
} from './materials.js';

/* ------------------------------------------------------------------ *
 * Cotes, en millimètres
 * ------------------------------------------------------------------ */

export const MOTOR = {
  designation: '1804',
  kv: 3450,

  /** Cloche */
  bellDiameter: 23.0,
  bellHeight: 8.8,
  bellBottom: 2.35,      // la cloche coiffe l'embase, elle ne pose pas dessus
  topPlate: 0.7,         // plateau noir ajouré
  rimPlate: 0.6,         // plateau turquoise, juste dessous
  wall: 1.0,             // paroi du fût (aimants collés à l'intérieur)

  /** Ouvertures du plateau */
  windows: 6,
  windowInner: 3.9,      // rayon intérieur
  windowOuter: 10.35,    // rayon extérieur
  windowInnerHalfAngle: 21 * Math.PI / 180,
  windowOuterHalfAngle: 26.5 * Math.PI / 180,
  windowRound: 1.05,     // rayon de congé des coins
  rim: 0.62,             // largeur du liseré turquoise

  /** Moyeu et arbre */
  hubDiameter: 6.8,
  hubRise: 0.6,
  shaftDiameter: 2.1,
  shaftOut: 3.3,         // ce qui dépasse au-dessus du moyeu
  hubHoleDiameter: 1.5,
  hubHoleCircle: 6.2,    // les quatre petits perçages
  /*
   * Prise de la vis d'hélice dans la cloche : la portée surélevée (0,6), le
   * plateau qu'elle surmonte (0,7), et 0,5 de reprise de matière sous le trou
   * — un taraudage M2 dans 1,3 mm de tôle ne tiendrait pas une hélice.
   *
   * Seul le dernier terme est déclaré ; les deux autres sont les cotes de la
   * cloche. La somme donne 1,8, et avec les 6,2 mm du moyeu d'hélice à
   * traverser, exactement le M2×8 que ces moteurs livrent avec eux.
   */
  hubThread: 0.6 + 0.7 + 0.5,

  /** Stator */
  statorDiameter: 17.6,
  statorHeight: 4.0,
  statorBore: 11.0,
  teeth: 12,

  /** Embase */
  baseThickness: 1.8,
  baseHubDiameter: 11.0,
  /**
   * CERCLE DE PERÇAGE Ø12, quatre trous M2 à 45°.
   *
   * Relevé sur les bras du châssis, pas supposé : leurs quatre perçages
   * moteur sont espacés de 8,486 mm en X comme en Z, soit √2 × 6 — des trous
   * sur un cercle de Ø12, et non le carré de 12 × 12 que j'avais dessiné
   * d'abord. Avec l'entraxe erroné, le moteur ne se vissait sur rien.
   */
  mountCircle: 12.0,
  mountHoleDiameter: 1.9,
  /**
   * Profondeur de filet des quatre trous.
   *
   * Ce n'est PAS l'épaisseur de la semelle : la pièce réelle porte un bossage
   * autour de chaque perçage, et c'est lui qui donne la prise. La cote compte,
   * c'est elle qui décide de la longueur de vis — 3,5 mm de bras plus 3,4 de
   * filet donnent une M2×7. Prise sur la semelle seule, elle aurait annoncé du
   * M2×6, trop court pour tenir un moteur.
   */
  threadDepth: 3.4,
  bossDiameter: 4.8,

  /**
   * Fils.
   *
   * `wireRun` est la longueur du brin qui court SUR LE BRAS, du bord de la
   * cloche jusqu'au châssis. Elle n'est pas la même à l'avant et à l'arrière :
   * les bras arrière sont les plus longs sur ce dead-cat, et un brin unique
   * aurait pendu dans le vide d'un côté ou se serait arrêté à mi-bras de
   * l'autre. C'est un paramètre de `buildMotor`, pas une constante.
   */
  wireDiameter: 1.15,
  wireRun: 46.0,
};

/** Hauteur hors tout, arbre compris. */
export function motorHeight() {
  const m = MOTOR;
  return m.bellBottom + m.bellHeight + m.hubRise + m.shaftOut;
}

/* ------------------------------------------------------------------ *
 * Outils de dessin
 * ------------------------------------------------------------------ */

/**
 * Polygone à coins congés, rendu sous forme de contour Three.
 *
 * Le congé s'adapte à la longueur des segments voisins : sur un arc
 * échantillonné, les segments sont courts et le congé devient invisible ; aux
 * quatre vrais coins d'une ouverture, il prend toute sa valeur. Un rayon
 * uniforme aurait rongé les arcs.
 *
 * @param {number[][]} pts sommets, dans l'ordre
 * @param {number} radius rayon de congé demandé
 * @param {boolean} reverse inverser le sens (un trou tourne à l'envers du
 *        contour extérieur, sinon ses parois sortent normales à l'envers et
 *        disparaissent au rendu)
 */
function roundedPath(pts, radius, reverse = false) {
  const p = reverse ? [...pts].reverse() : pts;
  const n = p.length;
  const path = new THREE.Path();
  let started = false;

  for (let i = 0; i < n; i++) {
    const a = p[(i - 1 + n) % n];
    const b = p[i];
    const c = p[(i + 1) % n];

    const v1x = a[0] - b[0], v1y = a[1] - b[1];
    const v2x = c[0] - b[0], v2y = c[1] - b[1];
    const l1 = Math.hypot(v1x, v1y), l2 = Math.hypot(v2x, v2y);
    if (l1 < 1e-6 || l2 < 1e-6) continue;

    const u1x = v1x / l1, u1y = v1y / l1;
    const u2x = v2x / l2, u2y = v2y / l2;
    const cos = Math.max(-1, Math.min(1, u1x * u2x + u1y * u2y));
    const theta = Math.acos(cos);

    // sommet quasi aligné : rien à congéer, on passe tout droit
    if (theta > Math.PI - 0.05) {
      if (started) path.lineTo(b[0], b[1]);
      else { path.moveTo(b[0], b[1]); started = true; }
      continue;
    }

    // distance du sommet au point de tangence, bornée à la moitié des
    // segments voisins pour que deux congés ne se chevauchent pas
    let d = radius / Math.tan(theta / 2);
    d = Math.min(d, l1 * 0.5, l2 * 0.5);

    const t1 = [b[0] + u1x * d, b[1] + u1y * d];
    const t2 = [b[0] + u2x * d, b[1] + u2y * d];

    if (started) path.lineTo(t1[0], t1[1]);
    else { path.moveTo(t1[0], t1[1]); started = true; }
    path.quadraticCurveTo(b[0], b[1], t2[0], t2[1]);
  }
  path.closePath();
  return path;
}

/**
 * Une ouverture de la cloche : éventail entre deux arcs, coins congés.
 *
 * L'arc extérieur est échantillonné, pas tiré au cordeau : sur la pièce il
 * suit la courbure de la cloche, et une corde droite se verrait tout de suite
 * sur 10 mm de rayon.
 */
function windowPoints(r0, r1, a0, a1, center) {
  const pts = [];
  const N = 12;
  for (let i = 0; i <= N; i++) {
    const a = center - a1 + (2 * a1) * (i / N);
    pts.push([Math.cos(a) * r1, Math.sin(a) * r1]);
  }
  for (let i = 0; i <= N; i++) {
    const a = center + a0 - (2 * a0) * (i / N);
    pts.push([Math.cos(a) * r0, Math.sin(a) * r0]);
  }
  return pts;
}

/** Contour circulaire, dans le sens qui convient à un trou. */
function circlePath(radius, segments = 28, cx = 0, cy = 0) {
  const path = new THREE.Path();
  for (let i = 0; i <= segments; i++) {
    const a = -2 * Math.PI * (i / segments);
    const x = cx + Math.cos(a) * radius;
    const y = cy + Math.sin(a) * radius;
    if (i === 0) path.moveTo(x, y); else path.lineTo(x, y);
  }
  return path;
}

/** Disque plein, sens direct. */
function discShape(radius, segments = 72) {
  const s = new THREE.Shape();
  for (let i = 0; i <= segments; i++) {
    const a = 2 * Math.PI * (i / segments);
    const x = Math.cos(a) * radius, y = Math.sin(a) * radius;
    if (i === 0) s.moveTo(x, y); else s.lineTo(x, y);
  }
  return s;
}

/** Rectangle à bouts arrondis, du centre vers l'extérieur. */
function armShape(rStart, rEnd, halfWidth, angle) {
  const pts = [];
  const c = Math.cos(angle), s = Math.sin(angle);
  const at = (r, w) => [c * r - s * w, s * r + c * w];
  pts.push(at(rStart, -halfWidth), at(rEnd, -halfWidth),
    at(rEnd, halfWidth), at(rStart, halfWidth));
  const shape = new THREE.Shape();
  const path = roundedPath(pts, halfWidth * 0.85);
  shape.curves = path.curves;
  shape.autoClose = true;
  return shape;
}

/**
 * Plusieurs géométries en une seule, une plage de faces par matière.
 *
 * Three ne fournit pas d'utilitaire de fusion dans ce dépôt (seul le module
 * `three` de base est chargé, pas les addons), et une pièce faite de vingt
 * objets séparés ne serait ni sélectionnable ni exportable : le visualiseur
 * cherche UN maillage nommé `body`.
 */
function mergeParts(parts) {
  const materials = [];
  const chunks = [];
  for (const { geometry, material } of parts) {
    let mi = materials.indexOf(material);
    if (mi < 0) { materials.push(material); mi = materials.length - 1; }
    // Les normales déjà présentes sont GARDÉES : un cylindre Three arrive
    // avec des normales lissées, les recalculer après passage en sommets
    // dupliqués facettisait le fût de la cloche et l'arbre.
    const g = geometry.index ? geometry.toNonIndexed() : geometry;
    if (!g.attributes.normal) g.computeVertexNormals();
    chunks.push({ g, mi });
  }

  let total = 0;
  for (const c of chunks) total += c.g.attributes.position.count;

  const position = new Float32Array(total * 3);
  const normal = new Float32Array(total * 3);
  const uv = new Float32Array(total * 2);

  const out = new THREE.BufferGeometry();
  let v = 0;
  for (const c of chunks) {
    const src = c.g.attributes;
    const count = src.position.count;
    position.set(src.position.array.subarray(0, count * 3), v * 3);
    if (src.normal) normal.set(src.normal.array.subarray(0, count * 3), v * 3);
    if (src.uv) uv.set(src.uv.array.subarray(0, count * 2), v * 2);
    out.addGroup(v, count, c.mi);
    v += count;
  }

  out.setAttribute('position', new THREE.BufferAttribute(position, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return { geometry: out, materials };
}

/* ------------------------------------------------------------------ *
 * Le moteur
 * ------------------------------------------------------------------ */

/**
 * @returns {{geometry:THREE.BufferGeometry, materials:THREE.Material[],
 *            anchors:object[], dims:{length:number,width:number,thickness:number}}}
 */
export function buildMotor({ wireRun = MOTOR.wireRun } = {}) {
  const m = MOTOR;
  const R = m.bellDiameter / 2;
  const parts = [];

  const noir = anodizedMaterial();
  const turquoise = accentMaterial();
  const acier = steelMaterial();
  const cuivre = copperMaterial();
  const tole = laminationMaterial();
  const aimant = magnetMaterial();
  const fil = wireMaterial();
  const grave = bellLabelMaterial(m.designation, m.kv);

  const bellTop = m.bellBottom + m.bellHeight;

  /* --- Fût de la cloche, gravé ------------------------------------ */
  const fut = new THREE.CylinderGeometry(R, R, m.bellHeight, 96, 1, true);
  fut.rotateX(Math.PI / 2);
  fut.translate(0, 0, m.bellBottom + m.bellHeight / 2);
  parts.push({ geometry: fut, material: grave });

  // Paroi intérieure : les aimants collés dans la cloche. Sans elle, on voit
  // le décor à travers le fût par les ouvertures, et la pièce paraît creuse.
  const aimants = new THREE.CylinderGeometry(
    R - m.wall, R - m.wall, m.bellHeight - 1.2, 64, 1, true,
  );
  aimants.rotateX(Math.PI / 2);
  aimants.translate(0, 0, m.bellBottom + m.bellHeight / 2 - 0.3);
  parts.push({ geometry: aimants, material: aimant });

  // jante inférieure : referme l'épaisseur de paroi, vue de dessous
  const jante = new THREE.RingGeometry(R - m.wall, R, 64, 1);
  jante.rotateX(Math.PI);
  jante.translate(0, 0, m.bellBottom);
  parts.push({ geometry: jante, material: noir });

  /* --- Les deux plateaux ajourés ---------------------------------- */
  const centres = [];
  for (let k = 0; k < m.windows; k++) centres.push(2 * Math.PI * k / m.windows);

  // plateau noir : ouvertures au contour LARGE
  const haut = discShape(R);
  for (const c of centres) {
    haut.holes.push(roundedPath(windowPoints(
      m.windowInner, m.windowOuter,
      m.windowInnerHalfAngle, m.windowOuterHalfAngle, c,
    ), m.windowRound, true));
  }
  haut.holes.push(circlePath(m.shaftDiameter / 2 + 0.15, 20));
  /*
   * LES QUATRE TARAUDAGES DU MOYEU, À 0 / 90 / 180 / 270°.
   *
   * Ils étaient à 45°, et l'hélice a ses deux perçages sur un diamètre franc :
   * les deux motifs ne se faisaient jamais face, et la vis d'hélice n'avait
   * rien à mordre. Rien ne fixait l'angle de ces quatre trous — il ne se lit
   * sur aucune photo, alors que celui des perçages d'hélice, si. C'est donc le
   * moteur qui s'aligne sur l'hélice, et non l'inverse.
   */
  for (let k = 0; k < 4; k++) {
    const a = k * Math.PI / 2;
    haut.holes.push(circlePath(m.hubHoleDiameter / 2, 14,
      Math.cos(a) * m.hubHoleCircle / 2, Math.sin(a) * m.hubHoleCircle / 2));
  }
  const plateauHaut = new THREE.ExtrudeGeometry(haut, {
    depth: m.topPlate, bevelEnabled: false, curveSegments: 8,
  });
  plateauHaut.translate(0, 0, bellTop - m.topPlate);
  parts.push({ geometry: plateauHaut, material: noir });

  // plateau turquoise : mêmes ouvertures, resserrées de la largeur du liseré,
  // et posé juste dessous. C'est ce décalage qui fait le filet coloré.
  const bas = discShape(R - 0.25);
  for (const c of centres) {
    bas.holes.push(roundedPath(windowPoints(
      m.windowInner + m.rim, m.windowOuter - m.rim,
      m.windowInnerHalfAngle - m.rim / m.windowInner,
      m.windowOuterHalfAngle - m.rim / m.windowOuter, c,
    ), m.windowRound * 0.8, true));
  }
  bas.holes.push(circlePath(m.shaftDiameter / 2 + 0.15, 20));
  // les quatre petits perçages traversent AUSSI le plateau turquoise : sans
  // eux, on voyait le turquoise au fond des trous au lieu du vide
  for (let k = 0; k < 4; k++) {
    const a = Math.PI / 4 + k * Math.PI / 2;
    bas.holes.push(circlePath(m.hubHoleDiameter / 2, 14,
      Math.cos(a) * m.hubHoleCircle / 2, Math.sin(a) * m.hubHoleCircle / 2));
  }
  const plateauBas = new THREE.ExtrudeGeometry(bas, {
    depth: m.rimPlate, bevelEnabled: false, curveSegments: 8,
  });
  plateauBas.translate(0, 0, bellTop - m.topPlate - m.rimPlate + 0.02);
  parts.push({ geometry: plateauBas, material: turquoise });

  /* --- Moyeu, arbre ----------------------------------------------- */
  const moyeu = new THREE.Shape();
  const md = discShape(m.hubDiameter / 2, 40);
  moyeu.curves = md.curves;
  moyeu.holes.push(circlePath(m.shaftDiameter / 2 + 0.1, 20));
  // mêmes quatre trous que le plateau, donc même angle : ils sont traversants
  for (let k = 0; k < 4; k++) {
    const a = k * Math.PI / 2;
    moyeu.holes.push(circlePath(m.hubHoleDiameter / 2, 14,
      Math.cos(a) * m.hubHoleCircle / 2, Math.sin(a) * m.hubHoleCircle / 2));
  }
  const moyeuGeo = new THREE.ExtrudeGeometry(moyeu, {
    depth: m.hubRise, bevelEnabled: false, curveSegments: 8,
  });
  moyeuGeo.translate(0, 0, bellTop);
  parts.push({ geometry: moyeuGeo, material: noir });

  const arbre = new THREE.CylinderGeometry(
    m.shaftDiameter / 2, m.shaftDiameter / 2, m.shaftOut + 2.0, 24,
  );
  arbre.rotateX(Math.PI / 2);
  arbre.translate(0, 0, bellTop + m.hubRise + m.shaftOut / 2 - 1.0);
  parts.push({ geometry: arbre, material: acier });

  // chanfrein de bout d'arbre : c'est ce petit cône qui se voit sur la photo
  const bout = new THREE.CylinderGeometry(
    m.shaftDiameter / 2 - 0.25, m.shaftDiameter / 2, 0.3, 24,
  );
  bout.rotateX(Math.PI / 2);
  bout.translate(0, 0, bellTop + m.hubRise + m.shaftOut - 0.15);
  parts.push({ geometry: bout, material: acier });

  /* --- Stator douze dents, bobiné --------------------------------- */
  // remonté au ras du plateau : c'est le bobinage qu'on voit par les
  // ouvertures, et posé plus bas il disparaissait dans l'ombre de la cloche
  const zStator = m.bellBottom + 2.7;
  const noyau = new THREE.CylinderGeometry(
    m.statorBore / 2, m.statorBore / 2, m.statorHeight, 40,
  );
  noyau.rotateX(Math.PI / 2);
  noyau.translate(0, 0, zStator + m.statorHeight / 2);
  parts.push({ geometry: noyau, material: tole });

  const rDent = (m.statorBore / 2 + m.statorDiameter / 2) / 2;
  const lDent = m.statorDiameter / 2 - m.statorBore / 2;
  for (let k = 0; k < m.teeth; k++) {
    const a = 2 * Math.PI * k / m.teeth;

    // la dent : une tôle fine, plus haute que large
    const dent = new THREE.BoxGeometry(lDent, 1.5, m.statorHeight);
    dent.translate(rDent, 0, 0);
    dent.rotateZ(a);
    dent.translate(0, 0, zStator + m.statorHeight / 2);
    parts.push({ geometry: dent, material: tole });

    // l'épanouissement en bout de dent, contre les aimants
    const tete = new THREE.BoxGeometry(0.8, 3.4, m.statorHeight);
    tete.translate(m.statorDiameter / 2 - 0.4, 0, 0);
    tete.rotateZ(a);
    tete.translate(0, 0, zStator + m.statorHeight / 2);
    parts.push({ geometry: tete, material: tole });

    // le bobinage : un fût de cuivre autour de la dent, texturé spires
    const bobine = new THREE.CylinderGeometry(
      m.statorHeight / 2 + 0.35, m.statorHeight / 2 + 0.35, lDent - 1.1, 14, 1,
    );
    bobine.rotateZ(Math.PI / 2);
    bobine.translate(rDent - 0.2, 0, 0);
    bobine.rotateZ(a);
    bobine.translate(0, 0, zStator + m.statorHeight / 2);
    parts.push({ geometry: bobine, material: cuivre });
  }

  /* --- Embase en croix -------------------------------------------- */
  const rMount = m.mountCircle / 2;                 // quatre trous à 45°
  const rBoss = m.bossDiameter / 2;

  const socle = new THREE.CylinderGeometry(
    m.baseHubDiameter / 2, m.baseHubDiameter / 2, m.baseThickness, 48,
  );
  socle.rotateX(Math.PI / 2);
  socle.translate(0, 0, m.baseThickness / 2);
  parts.push({ geometry: socle, material: noir });

  for (let k = 0; k < 4; k++) {
    const a = Math.PI / 4 + k * Math.PI / 2;
    const bras = new THREE.ExtrudeGeometry(
      armShape(2.0, rMount, rBoss * 0.78, a),
      { depth: m.baseThickness, bevelEnabled: false, curveSegments: 6 },
    );
    parts.push({ geometry: bras, material: noir });

    // la patte percée : un anneau, pour que le trou de vis soit un vrai trou
    const patte = new THREE.Shape();
    const pd = discShape(rBoss, 26);
    patte.curves = pd.curves;
    patte.holes.push(circlePath(m.mountHoleDiameter / 2, 18));
    const pg = new THREE.ExtrudeGeometry(patte, {
      depth: m.baseThickness, bevelEnabled: false, curveSegments: 8,
    });
    pg.translate(Math.cos(a) * rMount, Math.sin(a) * rMount, 0);
    parts.push({ geometry: pg, material: noir });

    // le bossage taraudé, à l'intérieur de la cloche : invisible une fois
    // montée, mais c'est lui que la vis moteur trouve en arrivant par le bas
    const bossage = new THREE.Shape();
    const bd = discShape(rBoss * 0.86, 24);
    bossage.curves = bd.curves;
    bossage.holes.push(circlePath(m.mountHoleDiameter / 2, 16));
    const bg = new THREE.ExtrudeGeometry(bossage, {
      depth: m.threadDepth - m.baseThickness, bevelEnabled: false, curveSegments: 8,
    });
    bg.translate(Math.cos(a) * rMount, Math.sin(a) * rMount, m.baseThickness);
    parts.push({ geometry: bg, material: noir });
  }

  // portée de roulement, au centre de l'embase
  const portee = new THREE.CylinderGeometry(4.0, 4.4, 2.6, 40);
  portee.rotateX(Math.PI / 2);
  portee.translate(0, 0, m.baseThickness + 1.3 - 0.01);
  parts.push({ geometry: portee, material: noir });

  /* --- Les trois fils --------------------------------------------- */
  /*
   * ILS PARTENT VERS LE CENTRE DU DRONE, à plat sur le bras.
   *
   * Le repère du moteur est celui de son bras : la plaque et le moteur
   * subissent la même bascule (le Y du dessin devient le −Z de la scène), et
   * le moteur reçoit la rotation du bras. Le bras s'étend vers son −Z local,
   * moteur au bout ; « vers le centre » est donc son +Z local, c'est-à-dire
   * le −Y du repère de dessin du moteur. D'où cette sortie à −90°, et non les
   * 180° arbitraires de la première version, qui envoyaient les fils dans le
   * vide en travers du bras.
   *
   * Les trois brins sortent côte à côte, en nappe, et se posent sur le bras
   * dès la sortie de la cloche : ils passent ensuite sous le cover jusqu'aux
   * deux fentes de la plaque inférieure. Le dernier point plonge légèrement,
   * c'est l'amorce de ce passage.
   */
  const sortie = -Math.PI / 2;
  for (let k = -1; k <= 1; k++) {
    const offset = k * (m.wireDiameter + 0.18);
    const along = (d, o, z) => new THREE.Vector3(
      Math.cos(sortie) * d - Math.sin(sortie) * o,
      Math.sin(sortie) * d + Math.cos(sortie) * o,
      z,
    );
    const courbe = new THREE.CatmullRomCurve3([
      along(4.0, offset, m.baseThickness * 0.55),
      along(R - 2.0, offset, m.baseThickness * 0.35),
      along(R + 2.0, offset, m.wireDiameter / 2 + 0.05),
      along(R + wireRun * 0.55, offset, m.wireDiameter / 2),
      along(R + wireRun, offset, m.wireDiameter / 2 - 0.25),
    ]);
    const tube = new THREE.TubeGeometry(courbe, 28, m.wireDiameter / 2, 8, false);
    parts.push({ geometry: tube, material: fil });
  }

  const { geometry, materials } = mergeParts(parts);
  geometry.computeBoundingBox();

  /**
   * Repères d'accrochage : les QUATRE PERÇAGES DE FIXATION, et eux seuls.
   *
   * Ils sont donnés à la main plutôt que détectés : la détection de features
   * circulaires trouverait ici les six ouvertures, le moyeu, l'arbre, les
   * douze bobines — une trentaine de cibles dont aucune ne reçoit de vis.
   */
  const anchors = [];
  for (let k = 0; k < 4; k++) {
    const a = Math.PI / 4 + k * Math.PI / 2;
    anchors.push({
      index: k,
      x: Math.cos(a) * rMount,
      y: Math.sin(a) * rMount,
      z: m.baseThickness / 2,
      r: m.mountHoleDiameter / 2,
      axis: 'Z',
      coverage: 1,
      kind: 'hole',
      /*
       * LE TARAUDAGE DE SEMELLE, DÉCLARÉ SUR L'ANCRE ET NON SUR LA PIÈCE.
       *
       * Le palpage par rayon ne sait pas le mesurer — il ne voit que les faces
       * tournées vers le haut — et annonçait 1,6 mm de prise là où il y en a
       * 3,4, donc une vis trop courte pour tenir un moteur.
       *
       * Porté par l'ancre, parce que la cloche a un SECOND jeu de taraudages,
       * tout en haut : une déclaration valable pour tout le moteur les aurait
       * ramenés eux aussi au plan de pose, quinze millimètres plus bas.
       */
      mount: { face: 0, depth: m.threadDepth },
    });
  }
  /*
   * LES QUATRE TARAUDAGES DU MOYEU — ceux qui reçoivent les vis d'hélice.
   *
   * Sur la face haute de la cloche, sur le même cercle de Ø 6,2 que les deux
   * perçages du moyeu d'hélice, et désormais au même angle qu'eux.
   */
  for (let k = 0; k < 4; k++) {
    const a = k * Math.PI / 2;
    anchors.push({
      index: 4 + k,
      x: Math.cos(a) * m.hubHoleCircle / 2,
      y: Math.sin(a) * m.hubHoleCircle / 2,
      // LA PORTÉE, PAS LE PLATEAU. L'hélice ne pose pas sur le plateau de la
      // cloche mais sur le moyeu qui le surmonte de 0,6 mm : c'est là que
      // débouche le taraudage, et c'est là que la vis vient serrer. Partir du
      // plateau laissait 0,6 mm de vide entre les deux perçages — assez pour
      // que la colonne se coupe en deux et que l'hélice perde ses vis.
      z: bellTop + m.hubRise,
      r: m.hubHoleDiameter / 2,
      axis: 'Z',
      coverage: 1,
      kind: 'hole',
      mount: { face: bellTop + m.hubRise - m.hubThread, depth: m.hubThread },
    });
  }

  return {
    geometry,
    materials,
    anchors,
    dims: {
      length: m.bellDiameter,
      width: m.bellDiameter,
      thickness: motorHeight(),
    },
  };
}
