/**
 * HÉLICE TRIPALE 3,5 POUCES — dessinée, comme le moteur.
 *
 * ATTENTION, CELLE-CI N'A PAS DE PHOTO DE RÉFÉRENCE. Le moteur est reconstruit
 * cote par cote d'après les photos du fabricant ; l'hélice, elle, est déduite
 * du châssis : un OasisFly**35** de 175 mm d'empattement tourne en 3,5 pouces,
 * et un 1804 à 3450 KV est justement motorisé pour ça. Le dessin est donc
 * générique — une tripale de 88,9 mm au pas de 2,5 pouces, la combinaison la
 * plus courante sur ce format. Envoie des photos des tiennes et elle se
 * refait : tout est paramétré en haut de ce fichier.
 *
 * LA PALE EST UNE SURFACE RÉGLÉE, pas un bloc déformé : une section de profil
 * est calculée à chaque rayon, avec sa corde, son épaisseur, son vrillage et
 * sa flèche, et les sections voisines sont cousues entre elles. C'est ce qui
 * donne le vrillage continu d'une vraie pale — l'angle passe de 52° au pied à
 * 13° en bout, parce que le pas géométrique, lui, reste constant.
 *
 * LE SENS DE ROTATION est un paramètre, pas un miroir du maillage : sur un
 * quadricoptère, deux hélices tournent dans un sens et deux dans l'autre. On
 * inverse le signe du vrillage et de la flèche, ce qui donne une vraie pale
 * gauche — un miroir de maillage aurait retourné les normales.
 */

import * as THREE from 'three';
import { propellerMaterial, propHubMaterial } from './materials.js';

const POUCE = 25.4;

export const PROP = {
  diameter: 3.5 * POUCE,     // 88,9 mm
  pitch: 2.5 * POUCE,        // 63,5 mm par tour
  blades: 3,

  hubDiameter: 9.0,
  hubHeight: 6.2,
  collarDiameter: 6.4,
  collarHeight: 1.3,
  /**
   * Alésage. Il suit l'ARBRE DU MOTEUR tel que les photos le montrent — un
   * téton de Ø2,1 —, pas le Ø5 habituel d'une hélice de ce format. Les deux
   * pièces doivent s'emmancher l'une sur l'autre dans le visualiseur ; le
   * jour où j'aurai les photos des hélices, c'est ici que ça se corrige.
   */
  bore: 2.4,

  rootRadius: 4.0,           // le pied est noyé dans le moyeu
  maxChord: 14.6,
  rootThickness: 1.35,
  tipThickness: 0.62,
  camber: 0.055,             // cambrure, en fraction de corde
  sweep: 7.0,                // flèche en bout, vers l'arrière
  /**
   * Rayon sous lequel le vrillage cesse d'augmenter.
   *
   * Le pas constant donne un angle qui explose près de l'axe — 68° à r = 4,
   * la pale se dressait à la verticale et ne ressemblait plus à rien. Une
   * vraie hélice fait pareil : son pied est une patte de raccordement, pas un
   * profil portant.
   */
  twistFloor: 11.5,

  stations: 22,              // sections le long de la pale
  sectionPoints: 26,         // points par section
};

/** Corde à la station x ∈ [0,1] : creuse au pied, pleine au milieu, fine en bout. */
function chordAt(x) {
  const bell = 0.44 + 0.56 * Math.sin(Math.PI * Math.pow(x, 0.60));
  return PROP.maxChord * bell * (1 - 0.42 * Math.pow(x, 6));
}

/** Épaisseur à la station x. */
function thicknessAt(x) {
  return PROP.rootThickness + (PROP.tipThickness - PROP.rootThickness) * Math.pow(x, 0.7);
}

/**
 * Profil cambré : une plaque courbe, bord d'attaque rond, bord de fuite fin.
 * @param {number} t position le long de la corde, 0 au bord d'attaque
 * @returns {{u:number, v:number}} en fraction de corde
 */
function section(t, thickRatio) {
  const camber = 4 * PROP.camber * t * (1 - t);
  const e = thickRatio * Math.sin(Math.PI * Math.pow(t, 0.62)) * (1 - 0.75 * t);
  return { camber, half: e / 2 };
}

/**
 * @param {number} hand +1 ou -1 : sens de rotation
 * @returns {{geometry:THREE.BufferGeometry, materials:THREE.Material[],
 *            anchors:object[], dims:object}}
 */
export function buildProp(hand = 1) {
  const P = PROP;
  const tip = P.diameter / 2;
  const parts = [];

  const pale = propellerMaterial();
  const moyeu = propHubMaterial();

  /* --- Moyeu ------------------------------------------------------- */
  const corps = new THREE.Shape();
  for (let i = 0; i <= 48; i++) {
    const a = 2 * Math.PI * i / 48;
    const x = Math.cos(a) * P.hubDiameter / 2, y = Math.sin(a) * P.hubDiameter / 2;
    if (i === 0) corps.moveTo(x, y); else corps.lineTo(x, y);
  }
  const alesage = new THREE.Path();
  for (let i = 0; i <= 32; i++) {
    const a = -2 * Math.PI * i / 32;
    const x = Math.cos(a) * P.bore / 2, y = Math.sin(a) * P.bore / 2;
    if (i === 0) alesage.moveTo(x, y); else alesage.lineTo(x, y);
  }
  corps.holes.push(alesage);

  const hub = new THREE.ExtrudeGeometry(corps, {
    depth: P.hubHeight, bevelEnabled: false, curveSegments: 8,
  });
  parts.push({ geometry: hub, material: moyeu });

  // la collerette du dessus, celle sur laquelle appuie l'écrou
  const collier = new THREE.Shape();
  for (let i = 0; i <= 40; i++) {
    const a = 2 * Math.PI * i / 40;
    const x = Math.cos(a) * P.collarDiameter / 2, y = Math.sin(a) * P.collarDiameter / 2;
    if (i === 0) collier.moveTo(x, y); else collier.lineTo(x, y);
  }
  collier.holes.push(alesage.clone());
  const col = new THREE.ExtrudeGeometry(collier, {
    depth: P.collarHeight, bevelEnabled: false, curveSegments: 8,
  });
  col.translate(0, 0, P.hubHeight);
  parts.push({ geometry: col, material: moyeu });

  /* --- Les pales --------------------------------------------------- */
  // Les pales partent HAUT dans le moyeu : plus bas, leur pied plongeait
  // sous la base du moyeu et venait mordre le plateau de la cloche moteur.
  const zAxe = P.hubHeight * 0.60;

  for (let b = 0; b < P.blades; b++) {
    const base = 2 * Math.PI * b / P.blades;
    const anneaux = [];

    for (let i = 0; i <= P.stations; i++) {
      const x = i / P.stations;
      const r = P.rootRadius + (tip - P.rootRadius) * x;
      const c = chordAt(x);
      const th = thicknessAt(x) / c;

      // Vrillage : le pas géométrique est constant, donc l'angle diminue avec
      // le rayon. C'est la loi d'une hélice, pas un réglage esthétique.
      const tw = Math.atan2(P.pitch, 2 * Math.PI * Math.max(r, P.twistFloor));
      const fleche = P.sweep * Math.pow(x, 2.2);

      const ring = [];
      for (let j = 0; j < P.sectionPoints; j++) {
        // aller par l'extrados, retour par l'intrados
        const half = P.sectionPoints / 2;
        const dessus = j < half;
        const t = dessus ? j / (half - 1) : (P.sectionPoints - 1 - j) / (half - 1);
        const s = section(t, th);
        const u = (t - 0.45) * c;                  // le long de la corde
        const v = (s.camber + (dessus ? s.half : -s.half)) * c;

        const y = (u * Math.cos(tw) - v * Math.sin(tw)) + fleche;
        const z = u * Math.sin(tw) + v * Math.cos(tw);

        // le sens de rotation inverse corde et flèche, pas le maillage
        const yy = hand * y;
        const cosB = Math.cos(base), sinB = Math.sin(base);
        ring.push(new THREE.Vector3(
          r * cosB - yy * sinB,
          r * sinB + yy * cosB,
          zAxe + z,
        ));
      }
      anneaux.push(ring);
    }

    /* Maillage INDEXÉ, et c'est ce qui change tout : les sommets sont
     * partagés entre triangles voisins, donc les normales se moyennent et la
     * pale est lisse. En sommets dupliqués, chaque facette gardait la sienne
     * et la pale sortait en écailles de poisson. */
    const M = P.sectionPoints;
    const sommets = [];
    for (const ring of anneaux) for (const p of ring) sommets.push(p.x, p.y, p.z);

    // deux apex, un par bouchon
    const iPied = sommets.length / 3;
    const cPied = new THREE.Vector3();
    anneaux[0].forEach((p) => cPied.add(p));
    cPied.multiplyScalar(1 / M);
    sommets.push(cPied.x, cPied.y, cPied.z);

    const iBout = sommets.length / 3;
    const cBout = new THREE.Vector3();
    anneaux[P.stations].forEach((p) => cBout.add(p));
    cBout.multiplyScalar(1 / M);
    sommets.push(cBout.x, cBout.y, cBout.z);

    const idx = [];
    const face = (a, b_, c_) => {
      if (hand > 0) idx.push(a, b_, c_); else idx.push(a, c_, b_);
    };
    for (let i = 0; i < P.stations; i++) {
      for (let j = 0; j < M; j++) {
        const k = (j + 1) % M;
        const A = i * M, B = (i + 1) * M;
        face(A + j, B + j, B + k);
        face(A + j, B + k, A + k);
      }
    }
    for (let j = 0; j < M; j++) {
      const k = (j + 1) % M;
      face(iPied, 0 + k, 0 + j);                       // pied, tourné vers l'axe
      face(iBout, P.stations * M + j, P.stations * M + k);
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position',
      new THREE.BufferAttribute(new Float32Array(sommets), 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    parts.push({ geometry: geo, material: pale });
  }

  /* --- Fusion ------------------------------------------------------ */
  const materials = [];
  const chunks = [];
  for (const { geometry, material } of parts) {
    let mi = materials.indexOf(material);
    if (mi < 0) { materials.push(material); mi = materials.length - 1; }
    // `toNonIndexed` recopie les normales : elles restent lissées
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
  out.computeBoundingBox();

  const box = out.boundingBox;
  return {
    geometry: out,
    materials,
    // un seul repère : l'alésage, c'est par là qu'elle s'enfile sur l'arbre
    anchors: [{
      index: 0, x: 0, y: 0, z: P.hubHeight / 2,
      r: P.bore / 2, axis: 'Z', coverage: 1, kind: 'hole',
    }],
    // on annonce le DIAMÈTRE, pas l'encombrement : une tripale n'a pas de
    // pale sur l'axe X, sa boîte englobante mesure 73 mm pour une hélice de
    // 88,9 — c'est le diamètre qu'on lit sur une hélice, pas sa boîte
    dims: {
      length: P.diameter,
      width: P.diameter,
      thickness: box.max.z - box.min.z,
    },
  };
}
