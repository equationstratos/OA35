/**
 * Viewer du build FPV — TinyHoop MK1.
 * Scène 3D + plan coté + calibration photo, 100 % hors-ligne.
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { PARTS, PLANNED } from './parts/index.js';
import { drawBlueprint } from './blueprint.js';
import { blueprintFromTrace } from './lib/plate.js';
import * as cal from './calibrate.js';
import * as custom from './parts/custom.js';
import * as asm from './assembly.js';
import {
  describe as describeScale, rememberPattern, usesPreferred as usesPreferredPattern,
} from './lib/patterns.js';
import { FRAME, thicknessForRole } from './frame-spec.js';
import { tintMaterial, DEFAULT_TINT } from './lib/materials.js';
import * as exporter from './lib/export.js';
import * as hw from './hardware.js';
import * as so from './standoffs.js';
import { createNavCube } from './navcube.js';
import { createHistory } from './history.js';

const $ = (id) => document.getElementById(id);

/**
 * Étiquette de version, affichée dans l'en-tête.
 *
 * Elle est écrite par le JavaScript, pas par le HTML : c'est ce qui permet de
 * distinguer une page en cache d'un script en cache. GitHub Pages sert les
 * fichiers avec dix minutes de cache, et un simple rechargement peut donc
 * rejouer l'ancien code alors que le dépôt est à jour — sans repère visible,
 * impossible de trancher entre « pas déployé » et « pas rechargé ».
 *
 * À incrémenter à chaque livraison.
 */
const BUILD = '2026-08-10f · les caches suivent leur joue a l assemblage';
$('build-stamp').textContent = BUILD;

/* Les trois groupes de visserie — sachet du plan de travail, visserie posée,
 * entretoises placées à la main — s'inscrivent ici à leur création. La
 * visibilité peut alors s'appliquer dès le premier rendu, sans dépendre de
 * l'ordre des déclarations dans le fichier. */
const visserieGroupes = new Map();

/* ------------------------------------------------------------------ *
 * Scène
 * ------------------------------------------------------------------ */

const viewport = $('viewport');

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.95;
renderer.outputColorSpace = THREE.SRGBColorSpace;
viewport.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0e14);

const camera = new THREE.PerspectiveCamera(38, 1, 0.5, 2000);
camera.position.set(95, 78, 118);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.target.set(0, 4, 0);

/* Rendu à la demande : au repos la scène ne consomme rien, et le thread
 * principal reste disponible pour l'interface. */
let needsRender = true;
const invalidate = () => { needsRender = true; };
controls.addEventListener('change', invalidate);

// Éclairage studio
scene.add(new THREE.HemisphereLight(0x9ba2aa, 0x05070a, 0.22));

const key = new THREE.DirectionalLight(0xfff4e6, 2.0);
key.position.set(80, 120, 60);
key.castShadow = true;
key.shadow.mapSize.set(1536, 1536);
key.shadow.camera.near = 10;
key.shadow.camera.far = 400;
const d = 110;
Object.assign(key.shadow.camera, { left: -d, right: d, top: d, bottom: -d });
key.shadow.bias = -0.0006;
scene.add(key);

const rim = new THREE.DirectionalLight(0x93b4dd, 0.4);
rim.position.set(-90, 40, -80);
scene.add(rim);

const fill = new THREE.DirectionalLight(0xffffff, 0.35);
fill.position.set(-30, 20, 90);
scene.add(fill);

// Sol + grille
const ground = new THREE.Mesh(
  new THREE.CircleGeometry(260, 64),
  new THREE.ShadowMaterial({ opacity: 0.4 }),
);
ground.rotation.x = -Math.PI / 2;
ground.position.y = -14;
ground.receiveShadow = true;
scene.add(ground);

/** Côté de la grille, en mm : suit l'étalement des pièces sur l'établi. */
let gridSize = 300;
const GRID_CELL_MM = 10;

let grid = new THREE.GridHelper(gridSize, gridSize / GRID_CELL_MM, 0x1e3550, 0x142236);
grid.position.y = -14;
scene.add(grid);

/**
 * Redimensionne la grille pour qu'aucune pièce ne déborde.
 *
 * GridHelper fige sa taille à la construction : il faut le refaire. On garde
 * ses couleurs (le choix de fond les change) et la maille de 10 mm, qui sert
 * de repère de mesure autant que de décor.
 */
function resizeGrid(needed) {
  const size = Math.max(300, Math.ceil(needed / 100) * 100);
  if (size === gridSize) return;
  gridSize = size;
  const colors = grid.userData.colors || [0x1e3550, 0x142236];
  const visible = grid.visible;
  scene.remove(grid);
  disposeObject(grid);
  grid = new THREE.GridHelper(size, size / GRID_CELL_MM, colors[0], colors[1]);
  grid.userData.colors = colors;
  grid.position.y = -14;
  grid.visible = visible;
  scene.add(grid);
  invalidate();
}

/* ------------------------------------------------------------------ *
 * Montage des pièces
 * ------------------------------------------------------------------ */

const buildRoot = new THREE.Group();
scene.add(buildRoot);

let entries = [];

/** Pièces du projet dont le fichier de maillage n'a pas pu être chargé. */
let missingAssets = [];

/**
 * Reconstruit la liste des pièces : celles du projet + celles créées ici.
 *
 * Une pièce du projet dont le fichier d'assets manque est écartée plutôt que
 * montée : sans ça, une géométrie nulle ferait échouer le montage et
 * emporterait tout le reste du build, y compris les pièces créées depuis
 * l'outil, qui n'ont pourtant aucun rapport avec ce fichier.
 */
function collectParts() {
  missingAssets = PARTS.filter((mod) => mod.meta.missingAsset)
    .map((mod) => mod.meta.name);
  return [
    ...PARTS.filter((mod) => !mod.meta.missingAsset),
    ...custom.loadPartModules(PARTS.length + 1),
  ].map((mod) => ({ mod, object: null, baseY: mod.meta.stackHeight }));
}

function disposeObject(obj) {
  obj.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose());
  });
}

/** (Re)construit une pièce, depuis le tracé photo s'il a été appliqué. */
function mountPart(entry, traceMm) {
  if (entry.holder) {
    buildRoot.remove(entry.holder);
    disposeObject(entry.holder);
  }
  const placement = placements[entry.mod.meta.id];
  entry.object = traceMm && entry.mod.buildFromTrace
    ? entry.mod.buildFromTrace(traceMm)
    : entry.mod.build(!!(placement && placement.mirrored));

  // le porteur découple le placement (position + rotation autour de la
  // verticale) de l'orientation propre de la plaque
  entry.holder = new THREE.Group();
  entry.holder.name = `holder-${entry.mod.meta.id}`;
  entry.holder.userData.partId = entry.mod.meta.id;
  entry.holder.add(entry.object);
  buildRoot.add(entry.holder);

  entry.markers = [];
  const group = entry.object.getObjectByName('hole-markers');
  if (group) {
    for (const marker of group.children) {
      marker.userData.partId = entry.mod.meta.id;
      entry.markers.push(marker);
    }
  }
  // ce que traverse chaque perçage : relevé une fois, ici, pièce neuve
  measureHoles(entry);
  applyDisplayOptions();
}

/** Remonte toute la scène après ajout ou suppression d'une pièce. */
function remountAll() {
  entries.forEach((e) => {
    if (e.holder) { buildRoot.remove(e.holder); disposeObject(e.holder); }
  });
  entries = collectParts();
  entries.forEach((e) => mountPart(e, e.mod.isCustom ? null : appliedTrace()));
  layoutParts();
  frameAll();
  renderPartList();
  applySelectionLook();
  renderPartToolbar();
  // les pièces viennent d'être reconstruites : elles sont toutes visibles,
  // et repeintes de la teinte d'origine de leur matière
  applyHidden();
  applyColors();
}

/** Le tracé photo ne remplace que la pièce 01, et seulement si demandé. */
function appliedTrace() {
  return cal.state.applied ? cal.state.traceMm : null;
}

/* ------------------------------------------------------------------ *
 * Disposition des pièces
 * ------------------------------------------------------------------ */

const deg = (d) => (d * Math.PI) / 180;

/**
 * L'établi, réparti dans les quatre quadrants de la grille.
 *
 * La plaque inférieure occupe le centre — c'est l'origine du build, elle ne
 * bouge pas. Les autres familles se rangent chacune dans son quadrant, à une
 * marge fixe des axes, alignées sur le bord extérieur : les pièces se lisent
 * en colonnes propres au lieu de s'étaler en une longue bande, et le plan
 * tient sur bien moins de surface.
 *
 * Deux quadrants portent des emplacements RÉSERVÉS, sans pièce : la visserie
 * et les entretoises d'un côté, l'électronique à venir de l'autre (moteurs,
 * hélices, batterie). Ils sont dessinés sur le plan pour que la place reste
 * libre.
 */
const BENCH_BLOCKS = [
  {
    label: 'Covers et pièces imprimées',
    quadrant: [-1, -1],                 // en haut à gauche
    // les covers d'abord, donc à gauche du bloc ; le reste des pièces
    // imprimées suit et passe à la ligne tout seul
    ids: [
      'cover-01-g', 'cover-01-d', 'cover-02-g', 'cover-02-d',
      'gps-mount', 'vtx-mount', 'camera-mount', 'camera-mount-mirror',
      'footpad-ar-l', 'footpad-ar-r', 'footpad-av-l', 'footpad-av-r',
    ],
    maxWidth: 190,
  },
  {
    label: 'Bras',
    quadrant: [1, -1],                  // en haut à droite
    ids: ['arm-long-l', 'arm-long-r', 'arm-short-l', 'arm-short-r'],
    maxWidth: 190,
  },
  {
    label: 'Plaques',
    quadrant: [-1, 1],                  // en bas à gauche
    ids: ['middle-plate', 'top-plate', 'clamp-plate'],
    maxWidth: 190,
  },
];

/**
 * Emplacements du quadrant bas-droite. Les deux premiers reçoivent vraiment
 * quelque chose — le sachet de visserie et les entretoises créées à la main —,
 * le dernier réserve la place de ce qui n'est pas encore modélisé.
 */
const BENCH_RESERVED = [
  { id: 'kit', label: 'Visserie du kit', size: [120, 120] },
  { id: 'standoffs', label: 'Entretoises', size: [120, 45] },
  { id: 'futur', label: 'Électronique · moteurs, hélices, batterie', size: [150, 100] },
];

/** Pièce qui sert d'origine au build : le reste se monte autour d'elle. */
const ANCHOR_ID = 'bottom-plate';

/** Espaces, en mm : entre pièces, entre lignes d'un bloc, et autour des axes. */
const BENCH_GAP_MM = 14;
const BENCH_LINE_GAP_MM = 18;
const BENCH_MARGIN_MM = 55;      // dégage la plaque inférieure, qui tient le centre

/** Places calculées à la dernière disposition : { id: {x, z, rotY…} }. */
let benchZones = {};

/** Emplacements réservés calculés : { label, x, z, w, d }. */
let reservedZones = [];

/**
 * Encombrement au sol d'une pièce, dans son orientation d'établi.
 *
 * Mesuré sur la géométrie DANS LE REPÈRE DE SON PORTEUR, et non dans le monde.
 * C'est la correction d'un défaut visible : une pièce prise dans le build est
 * tournée et posée en l'air, sa boîte monde ne dit donc plus rien de la place
 * qu'elle prend à plat. La disposition de l'établi, qui se calcule à partir de
 * ces encombrements, sortait différente selon que le build était monté ou non
 * — et au désassemblage les pièces ne retombaient pas dans la même case que
 * celle d'où elles étaient parties.
 *
 * Le relevé ne dépend plus que de la géométrie : il est fait une fois et gardé,
 * la clé étant la géométrie elle-même (une pièce remise en miroir ou remise à
 * l'échelle en reçoit une neuve, et se fait donc remesurer).
 *
 * Mesuré, et non déduit des cotes nominales : une plaque est couchée, un
 * maillage peut être basculé, et une pièce tournée d'un quart de tour échange
 * sa longueur et sa largeur.
 */
function benchFootprint(entry, rotY = 0) {
  const body = entry.object && entry.object.getObjectByName('body');
  const key = body ? body.geometry.uuid : null;
  if (!entry.footprint || entry.footprintKey !== key) {
    const keep = { p: entry.holder.position.clone(), q: entry.holder.quaternion.clone() };
    entry.holder.position.set(0, 0, 0);
    entry.holder.quaternion.identity();
    entry.holder.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(entry.object);
    entry.footprint = { x: box.max.x - box.min.x, z: box.max.z - box.min.z };
    entry.footprintKey = key;
    entry.holder.position.copy(keep.p);
    entry.holder.quaternion.copy(keep.q);
    entry.holder.updateMatrixWorld(true);
  }
  const { x: sx, z: sz } = entry.footprint;
  const c = Math.abs(Math.cos(rotY));
  const s = Math.abs(Math.sin(rotY));
  return { x: sx * c + sz * s, z: sx * s + sz * c };
}

/** Arrondi au demi-carreau : des pièces alignées sur la grille se lisent mieux. */
const snap = (v) => Math.round(v / 5) * 5;

/**
 * Range une liste de pièces en lignes, dans un rectangle dont on donne le coin
 * le plus proche du centre. Renvoie les places et l'encombrement du bloc.
 */
function packBlock(items, sizes, maxWidth) {
  const lines = [];
  let line = [];
  let width = 0;
  for (const id of items) {
    const w = sizes[id].x;
    if (line.length && width + BENCH_GAP_MM + w > maxWidth) {
      lines.push({ items: line, width });
      line = [];
      width = 0;
    }
    width += (line.length ? BENCH_GAP_MM : 0) + w;
    line.push(id);
  }
  if (line.length) lines.push({ items: line, width });

  const blockWidth = Math.max(...lines.map((l) => l.width));
  let depth = 0;
  const placed = [];
  for (const l of lines) {
    const lineDepth = Math.max(...l.items.map((id) => sizes[id].z));
    let x = 0;                       // aligné sur le bord GAUCHE du bloc
    for (const id of l.items) {
      placed.push({ id, x: x + sizes[id].x / 2, z: depth + lineDepth / 2 });
      x += sizes[id].x + BENCH_GAP_MM;
    }
    depth += lineDepth + BENCH_LINE_GAP_MM;
  }
  return { placed, width: blockWidth, depth: depth - BENCH_LINE_GAP_MM };
}

/**
 * Recalcule les places de l'établi. Renvoie l'étalement total, qui sert à
 * dimensionner la grille.
 */
function computeBenchZones() {
  const zones = {};
  const byId = new Map(entries.map((e) => [e.mod.meta.id, e]));
  const used = new Set([ANCHOR_ID]);
  let reach = 0;

  const blocks = BENCH_BLOCKS
    .map((b) => ({ ...b, items: b.ids.filter((id) => byId.has(id)) }))
    .filter((b) => b.items.length);

  // ce qui n'entre dans aucune famille connue (pièce créée dans l'outil,
  // pièce ajoutée plus tard) va sous les plaques, dans le même quadrant
  blocks.forEach((b) => b.items.forEach((id) => used.add(id)));
  const others = entries.map((e) => e.mod.meta.id).filter((id) => !used.has(id));
  if (others.length) {
    blocks.push({
      label: 'Autres pièces', quadrant: [-1, 1], items: others, maxWidth: 190, extraLine: true,
    });
  }

  // les blocs d'un même quadrant s'empilent vers l'extérieur
  const nextZ = new Map();
  for (const block of blocks) {
    const [sx, sz] = block.quadrant;
    const sizes = {};
    for (const id of block.items) sizes[id] = benchFootprint(byId.get(id));
    const { placed, width, depth } = packBlock(block.items, sizes, block.maxWidth);

    const key = `${sx},${sz}`;
    const z0 = nextZ.get(key) || BENCH_MARGIN_MM;
    for (const p of placed) {
      // à gauche, le bloc s'étend vers -X et ses lignes sont calées à gauche ;
      // à droite, il s'étend vers +X, calées à droite
      const x = sx < 0 ? -(BENCH_MARGIN_MM + width) + p.x : BENCH_MARGIN_MM + p.x;
      const z = sz < 0 ? -(z0 + depth) + p.z : z0 + p.z;
      zones[p.id] = { x: snap(x), z: snap(z) };
      reach = Math.max(reach, Math.abs(x) + sizes[p.id].x / 2, Math.abs(z) + sizes[p.id].z / 2);
    }
    nextZ.set(key, z0 + depth + BENCH_LINE_GAP_MM);
  }

  // emplacements réservés : quadrant bas-droite, en lignes plutôt qu'en
  // colonne — empilés, ils repoussaient à eux seuls la grille de 200 mm
  reservedZones = [];
  const ROW_MAX = 260;
  let rx = BENCH_MARGIN_MM;
  let rz = BENCH_MARGIN_MM;
  let rowDepth = 0;
  for (const spot of BENCH_RESERVED) {
    const [w, d] = spot.size;
    if (rx > BENCH_MARGIN_MM && (rx - BENCH_MARGIN_MM) + w > ROW_MAX) {
      rz += rowDepth + BENCH_LINE_GAP_MM;
      rx = BENCH_MARGIN_MM;
      rowDepth = 0;
    }
    reservedZones.push({
      id: spot.id, label: spot.label, w, d,
      x: snap(rx + w / 2), z: snap(rz + d / 2),
    });
    reach = Math.max(reach, rx + w, rz + d);
    rx += w + BENCH_LINE_GAP_MM;
    rowDepth = Math.max(rowDepth, d);
  }

  benchZones = zones;
  return reach * 2 + BENCH_GAP_MM * 2;
}

/* ------------------------------------------------------------------ *
 * Emplacements réservés, dessinés sur le plan
 * ------------------------------------------------------------------ */

const reservedGroup = new THREE.Group();
reservedGroup.name = 'reserved-zones';
scene.add(reservedGroup);

/** Étiquette de texte posée à plat sur le plan, dessinée sur un canvas. */
function zoneLabel(text, widthMm) {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#7fb2e5';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  // la police se règle sur la longueur du texte : « Électronique · moteurs,
  // hélices, batterie » sortait du canvas et arrivait tronqué sur le plan
  let size = 34;
  do {
    ctx.font = `600 ${size}px ui-monospace, monospace`;
    size -= 1;
  } while (size > 10 && ctx.measureText(text).width > canvas.width - 24);
  ctx.fillText(text, 256, 34);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(widthMm, widthMm / 8),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }),
  );
  mesh.rotation.x = -Math.PI / 2;
  return mesh;
}

/**
 * Redessine les carrés réservés : la place de la visserie et celle de
 * l'électronique à venir. Rien n'y est posé — c'est justement le propos, ils
 * réservent la surface pour que le rangement ne s'y étale pas.
 */
function renderReservedZones() {
  while (reservedGroup.children.length) {
    const c = reservedGroup.children[0];
    reservedGroup.remove(c);
    disposeObject(c);
  }
  const y = -13.8;   // juste au-dessus de la grille, sinon les traits clignotent
  for (const zone of reservedZones) {
    const hw = zone.w / 2;
    const hd = zone.d / 2;
    const pts = [
      new THREE.Vector3(-hw, 0, -hd), new THREE.Vector3(hw, 0, -hd),
      new THREE.Vector3(hw, 0, hd), new THREE.Vector3(-hw, 0, hd),
      new THREE.Vector3(-hw, 0, -hd),
    ];
    const line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.LineDashedMaterial({
        color: 0x3f6ea8, dashSize: 6, gapSize: 4, transparent: true, opacity: 0.9,
      }),
    );
    line.computeLineDistances();
    line.position.set(zone.x, y, zone.z);
    reservedGroup.add(line);

    const label = zoneLabel(zone.label, zone.w * 0.92);
    label.position.set(zone.x, y + 0.1, zone.z - hd + zone.w / 16 + 4);
    reservedGroup.add(label);
  }
  invalidate();
}

/* ------------------------------------------------------------------ *
 * Le sachet de visserie, posé sur le plan
 * ------------------------------------------------------------------ */

const kitGroup = new THREE.Group();
kitGroup.name = 'screw-kit';
visserieGroupes.set('kit', kitGroup);
scene.add(kitGroup);

/** Ce qui reste du sachet : { id de ligne -> nombre encore disponible }. */
let kitStock = new Map(hw.SCREW_KIT.map((l) => [l.id, l.count]));

/** Où se trouve chaque pièce du sachet : { id de ligne -> positions }. */
let kitSlots = new Map();

/**
 * Étale le sachet dans son carré : une ligne par référence, les pièces
 * rangées par blocs de huit, avec le libellé et le compte à gauche.
 *
 * Tout part sur le plan de travail — c'est le stock, il attend d'être posé.
 * Ce qui a été utilisé par « Détecter et poser » disparaît du carré : le
 * sachet se vide à mesure que le build se visse, comme le vrai.
 */
function renderKit() {
  while (kitGroup.children.length) {
    const c = kitGroup.children[0];
    kitGroup.remove(c);
    disposeObject(c);
  }
  const zone = reservedZones.find((z) => z.id === 'kit');
  if (!zone) return;

  const PITCH = 6.5;          // écart entre deux pièces, tête de 3,8 mm
  const PER_ROW = 8;
  const LABEL_W = 50;         // colonne de gauche, pour le libellé
  const x0 = zone.x - zone.w / 2 + LABEL_W;
  let z = zone.z - zone.d / 2 + 8;

  kitSlots = new Map();
  for (const line of hw.SCREW_KIT) {
    const left = kitStock.get(line.id) || 0;
    const slots = [];
    kitSlots.set(line.id, slots);
    const rows = Math.max(1, Math.ceil(left / PER_ROW));
    const thread = hw.THREADS[line.thread];

    // le libellé tient dans la colonne de gauche, à l'intérieur du carré :
    // débordant, il empiétait sur le quadrant voisin
    const label = zoneLabel(`${line.label} ×${left}`, LABEL_W - 6);
    label.position.set(zone.x - zone.w / 2 + LABEL_W / 2 - 2, -13.7,
      z + (rows - 1) * PITCH / 2);
    kitGroup.add(label);

    for (let i = 0; i < left; i++) {
      const col = i % PER_ROW;
      const row = Math.floor(i / PER_ROW);
      const mesh = line.kind === 'nut'
        ? hw.nutMesh(thread)
        : hw.screwMesh(thread, line.length);
      // les vis reposent sur leur tête, l'écrou à plat : c'est ainsi qu'un
      // sachet vidé sur l'établi se présente
      mesh.position.set(x0 + col * PITCH, line.kind === 'nut' ? -14 : -14 + line.length, z + row * PITCH);
      mesh.userData.kitLine = line.id;
      slots.push(mesh.position.clone());
      kitGroup.add(mesh);
    }
    z += rows * PITCH + 4;
  }
  applyHardwareVisibility();
}

/** Vis du sachet visables au lancer de rayon. */
function kitTargets() {
  if (!kitGroup.visible) return [];
  const out = [];
  kitGroup.traverse((o) => { if (o.isMesh && o.parent && o.parent.userData.kitLine) out.push(o); });
  return out;
}

/** Vis choisie dans le sachet, en attente d'un perçage. */
let selectedScrew = null;

function selectScrew(lineId) {
  selectedScrew = selectedScrew === lineId ? null : lineId;
  const line = hw.SCREW_KIT.find((l) => l.id === lineId);
  updateAsmHint(
    selectedScrew
      ? `Vis ${line.label} sélectionnée. Clique le perçage qui doit la recevoir : `
        + 'elle s\'y enfonce jusqu\'à la butée de tête.'
      : 'Vis reposée dans le sachet.',
    'ok',
  );
  invalidate();
}

/**
 * Enfonce la vis choisie dans le perçage cliqué, tête en butée.
 *
 * Et surtout, dit ce que ça donne : une vis trop courte ne prend pas, une vis
 * trop longue ressort sous la pièce — dans un drone, elle touche
 * l'électronique ou la batterie. La longueur nécessaire est celle du point de
 * fixation quand le perçage en est un, sinon la matière du perçage plus la
 * prise du filetage.
 */
function placeScrewOnMarker(marker) {
  const line = hw.SCREW_KIT.find((l) => l.id === selectedScrew);
  const entry = entryById(marker.userData.partId);
  if (!line || !entry) return;
  if ((kitStock.get(line.id) || 0) <= 0) {
    updateAsmHint(`Le sachet n'a plus de ${line.label}.`, 'warn');
    return;
  }

  const world = marker.getWorldPosition(new THREE.Vector3());
  const parts = assembledParts();
  const self = parts.find((p) => p.id === entry.mod.meta.id);
  const hole = (self ? self.holes : [])
    .map((h) => ({ h, d: Math.hypot(h.x - world.x, h.z - world.z) }))
    .sort((a, b) => a.d - b.d)[0];
  const under = marker.userData.face === 'bottom';

  // le point de fixation correspondant, s'il existe : c'est lui qui donne la
  // longueur juste, entretoise comprise
  const site = hw.findFastenerSites(parts)
    .filter((x) => Math.hypot(x.x - world.x, x.z - world.z) < 1.2)
    .sort((a, b) => Math.hypot(a.x - world.x, a.z - world.z)
      - Math.hypot(b.x - world.x, b.z - world.z))[0];

  const thread = hw.THREADS[line.thread];
  let needed;
  if (site) {
    const grip = site.gap > 0.5 ? thread.engagement
      : Math.min(site.lowerMaterial, thread.engagement);
    needed = site.upperMaterial + site.gap + (site.gap > 0.5 ? grip : grip);
  } else {
    const material = hole && Number.isFinite(hole.h.material) ? hole.h.material : entry.mod.meta.dims.thickness;
    needed = material + Math.min(material, thread.engagement);
  }

  const seat = hole ? (under ? hole.h.bottom : hole.h.top) : world.y;
  const screw = hw.screwMesh(thread, line.length);
  screw.position.set(world.x, seat, world.z);
  if (under) screw.rotation.z = Math.PI;      // vissée par en dessous, tête en bas
  hardwareGroup.add(screw);
  kitStock.set(line.id, kitStock.get(line.id) - 1);
  renderKit();
  applyHardwareVisibility();

  const play = line.length - needed;
  const where = `${entry.mod.meta.name} #${marker.userData.anchor.index}`;
  if (play < -0.01) {
    updateAsmHint(
      `${line.label} posée sur ${where} — TROP COURTE de ${(-play).toFixed(1)} mm : `
      + `il faut au moins ${needed.toFixed(1)} mm pour prendre.`,
      'warn',
    );
  } else if (play > 1.5) {
    updateAsmHint(
      `${line.label} posée sur ${where} — elle DÉPASSE de ${play.toFixed(1)} mm `
      + `sous la pièce (${needed.toFixed(1)} mm suffisaient).`,
      'warn',
    );
  } else {
    updateAsmHint(
      `${line.label} posée sur ${where} : ${needed.toFixed(1)} mm nécessaires, `
      + `${play < 0.05 ? 'pile la bonne longueur' : `${play.toFixed(1)} mm de marge`}.`,
      'ok',
    );
  }
  selectedScrew = null;
}

/* ------------------------------------------------------------------ *
 * Assemblage animé
 * ------------------------------------------------------------------ */

/** Mouvement en cours : null quand la scène est au repos. */
let motion = null;

/**
 * État « désassemblé » : toutes les pièces reprennent leur place de rangement,
 * y compris celles qui portent un placement à elles.
 *
 * Sans ça, un plan chargé laisse la moitié du build monté même en vue côte à
 * côte — les placements marqués « à la main » s'y appliquent — et le bouton
 * Désassembler n'aurait presque rien à faire. Le drapeau tombe dès que
 * l'utilisateur déplace une pièce lui-même : sa main l'emporte sur le
 * rangement automatique.
 */
let forceBench = false;

/** Adoucit départ et arrivée — un déplacement linéaire fait mécanique. */
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - ((-2 * t + 2) ** 3) / 2);

/**
 * Déplace les pièces d'un état à l'autre, en mouvement.
 *
 * Les pièces partent décalées dans le temps, de la plus basse à la plus haute :
 * on voit la plaque inférieure se poser, puis les bras, puis les plaques du
 * dessus — l'ordre dans lequel le châssis se monte réellement.
 *
 * @param {Map} targets id -> { position, quaternion } visés
 * @param {function} done appelée à la fin
 */
function animateTo(targets, done, timing = {}) {
  const moves = [];
  entries.forEach((e) => {
    const target = targets.get(e.mod.meta.id);
    if (!e.holder || !target) return;
    moves.push({
      object: e.holder,
      from: { p: e.holder.position.clone(), q: e.holder.quaternion.clone() },
      to: target,
    });
  });
  runMotion(moves, done, timing);
}

/**
 * Fait glisser une liste d'objets vers leur place, en décalant les départs.
 *
 * Sert aux pièces comme à la visserie : une vis part de son casier sur le
 * plan de travail et va se poser dans son perçage, exactement comme une
 * plaque rejoint le châssis.
 *
 * @param {{object:THREE.Object3D, from:{p,q}, to:{position,quaternion}}[]} moves
 * @param {function} [done]
 * @param {{duration:number, stagger:number}} [timing]
 */
function runMotion(moves, done, timing = {}) {
  const DURATION = timing.duration || 900;   // par objet, en ms
  const STAGGER = timing.stagger || 120;     // décalage d'un objet au suivant
  // Au montage : du plus bas au plus haut, c'est l'ordre où l'on visse.
  // Au démontage : du plus haut au plus bas, comme on démonte pour de vrai —
  // et là c'est la hauteur DE DÉPART qui compte, puisque toutes les pièces
  // vont au même niveau, sur l'établi. Trier sur l'arrivée les faisait partir
  // dans un ordre quelconque, capot avant plaque supérieure.
  moves.sort((a, b) => (timing.descending
    ? b.from.p.y - a.from.p.y
    : a.to.position.y - b.to.position.y));
  moves.forEach((m, i) => { m.delay = i * STAGGER; });

  const total = DURATION + Math.max(0, moves.length - 1) * STAGGER;
  motion = { moves, start: performance.now(), total, done, DURATION };
  invalidate();
}

/** Avance le mouvement d'une image. Renvoie vrai s'il reste du travail. */
function stepMotion(now) {
  if (!motion) return false;
  const elapsed = now - motion.start;
  for (const m of motion.moves) {
    const t = Math.min(1, Math.max(0, (elapsed - m.delay) / motion.DURATION));
    const k = easeInOut(t);
    m.object.position.lerpVectors(m.from.p, m.to.position, k);
    if (m.to.quaternion) m.object.quaternion.slerpQuaternions(m.from.q, m.to.quaternion, k);
    m.object.updateMatrixWorld(true);
  }
  if (elapsed < motion.total) return true;
  const { done } = motion;
  motion = null;
  if (done) done();
  return false;
}

/**
 * Deux dispositions :
 * - côte à côte : les pièces sont rangées à plat par famille, à la place que
 *   leur calcule computeBenchZones() ; c'est la vue de travail
 * - assemblée : chaque pièce reprend son altitude dans le build, et la vue
 *   éclatée les écarte verticalement. Une pièce jamais assemblée y reste
 *   quand même à sa place d'établi, sinon elle serait invisible sous les
 *   autres.
 */
function layoutParts() {
  const sideBySide = $('opt-layout').checked;
  const spread = Number($('explode').value);

  // les places dépendent de l'encombrement des pièces montées : recalculées
  // ici, après tout ajout, retrait ou mise en miroir
  const extent = computeBenchZones();
  resizeGrid(extent);
  renderReservedZones();
  renderKit();
  // les carrés réservés n'ont de sens que sur l'établi ; le sachet, lui, reste
  // là même une fois le build monté — c'est dedans qu'on va prendre les vis à
  // poser une par une
  reservedGroup.visible = sideBySide;
  applyHardwareVisibility();

  entries.forEach((e, i) => {
    if (!e.holder) return;
    const stored = placements[e.mod.meta.id];
    // un placement peut n'exister que pour le miroir, sans coordonnées : il ne
    // vaut position que s'il en porte une. Une pièce déplacée à la main
    // (curseurs de la barre d'outils) garde sa position partout, y compris
    // « côte à côte » — sinon les curseurs n'auraient aucun effet visible là
    // où on s'en sert le plus, en train d'organiser l'établi.
    const hasPosition = stored && Number.isFinite(stored.x);
    const placement = !forceBench && hasPosition && (stored.manual || !sideBySide)
      ? stored : null;
    if (placement) {
      e.holder.position.set(placement.x, placement.y + i * spread, placement.z);
      e.holder.rotation.set(placement.rotX || 0, placement.rotY || 0, placement.rotZ || 0);
    } else {
      // La plaque inférieure est l'origine du build : tant qu'elle n'a pas de
      // placement à elle, elle reste au centre en vue assemblée. Sans ça, un
      // plan qui ne la mentionne pas — c'est le cas dès qu'on n'y a jamais
      // touché — la verrait partir à sa place d'établi, et le châssis se
      // monterait autour d'une plaque absente.
      const anchored = !sideBySide && e.mod.meta.id === ANCHOR_ID;
      const zone = anchored ? { x: 0, z: 0 } : benchZones[e.mod.meta.id];
      const bx = zone ? zone.x : 0;
      const bz = zone ? zone.z : 0;
      // une pièce non assemblée reste sur l'établi : la poser à l'origine la
      // rendrait indiscernable, donc impossible à viser
      const defaultY = sideBySide ? 0 : e.baseY + i * spread;
      // une zone peut imposer son altitude : une pièce retournée a son origine
      // en haut, il faut la relever d'autant pour qu'elle repose sur le plan
      const by = zone && Number.isFinite(zone.y) ? zone.y + (sideBySide ? 0 : i * spread) : defaultY;
      e.holder.position.set(bx, by, bz);
      e.holder.rotation.set(
        zone ? (zone.rotX || 0) : 0,
        zone ? (zone.rotY || 0) : 0,
        zone ? (zone.rotZ || 0) : 0,
      );
    }
  });

  // PIÈCES PORTÉES. Un cache clipsé n'a pas de place à lui dans le châssis :
  // il est là où est la pièce qu'il habille, et nulle part ailleurs. Faute de
  // contrainte d'assemblage il restait donc sur l'établi pendant que le build
  // se montait, et ne bougeait ni à l'assemblage ni au désassemblage.
  //
  // Il suit maintenant son hôte en vue assemblée, décalage compris — le
  // décalage est celui des deux fichiers d'origine, chacun ayant été recentré
  // sur son propre encombrement. Sur l'établi il garde sa place à lui : c'est
  // là qu'on le regarde seul.
  if (!sideBySide) {
    const ride = new THREE.Vector3();
    entries.forEach((e) => {
      const r = e.mod.meta.rides;
      if (!e.holder || !r) return;
      const stored = placements[e.mod.meta.id];
      if (stored && stored.manual) return;      // posée à la main : on respecte
      const host = entries.find((h) => h.mod.meta.id === r.host);
      if (!host || !host.holder) return;
      ride.set(r.offset[0], r.offset[1], r.offset[2]).applyEuler(host.holder.rotation);
      e.holder.position.copy(host.holder.position).add(ride);
      e.holder.rotation.copy(host.holder.rotation);
    });
  }

  entries.forEach((e) => { if (e.holder) e.holder.updateMatrixWorld(true); });
  setMarkersVisible(!sideBySide);
  // la visserie a été calculée pour les positions précédentes
  if (hardwareGroup.children.length) clearHardware();
  // la colonne d'attente des entretoises est calée sur l'encombrement du build
  if (standoffs.some((s) => s.x === null)) renderStandoffs();
  invalidate();
}

/* ------------------------------------------------------------------ *
 * Assemblage par clic sur les perçages
 * ------------------------------------------------------------------ */

let placements = asm.loadPlacements();

/**
 * Nettoyage unique des plans écrits par la version du 10/08/2026.
 *
 * Changer l'habillage d'un cover y enregistrait sa position en « placée à la
 * main », pour qu'elle ne saute pas d'un créneau d'établi à l'autre. Ce
 * drapeau fige une pièce PARTOUT, y compris en vue assemblée : le cover ne
 * suivait plus l'animation d'assemblage, et le plan restait dans le navigateur
 * même une fois le code corrigé.
 *
 * Seules les pièces à habillage sont concernées, et seulement si leur plan
 * porte ce drapeau. Le geste est celui du bouton ↺ de la barre : la pièce
 * repart à sa position automatique.
 */
const PLAN_FIX_KEY = 'tinyhoop-mk1:plan-fix-habillages';
try {
  if (!localStorage.getItem(PLAN_FIX_KEY)) {
    const styled = new Set(PARTS.filter((m) => m.meta.styles).map((m) => m.meta.id));
    let cleaned = 0;
    for (const id of styled) {
      if (placements[id] && placements[id].manual) { delete placements[id]; cleaned += 1; }
    }
    if (cleaned) asm.savePlacements(placements);
    localStorage.setItem(PLAN_FIX_KEY, '1');
  }
} catch { /* pas de stockage : rien à réparer */ }

/* ------------------------------------------------------------------ *
 * Pièces masquées
 * ------------------------------------------------------------------ */

const HIDDEN_KEY = 'tinyhoop-mk1:hidden-parts';

/**
 * Pièces masquées, conservées d'une session à l'autre.
 *
 * L'état de la case à cocher était auparavant perdu à chaque reconstruction
 * de la scène (miroir, changement de rôle, import d'un plan…) : la pièce
 * revenait cochée et visible, ce qui la rendait impossible à retirer
 * durablement. Il faut donc le mémoriser hors de la liste, qui est réécrite
 * à chaque rendu.
 */
function loadHidden() {
  try {
    const raw = localStorage.getItem(HIDDEN_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(list) ? list : []);
  } catch {
    return new Set();
  }
}

let hiddenParts = loadHidden();

function saveHidden() {
  try {
    localStorage.setItem(HIDDEN_KEY, JSON.stringify([...hiddenParts]));
  } catch { /* stockage indisponible : valable pour la session */ }
}

/* Pièce mise en avant par le mode isolé. La sélection elle-même est déclarée
 * plus bas ; on garde l'identifiant ici pour qu'applyHidden puisse en tenir
 * compte sans dépendre de l'ordre des déclarations. */
let isolatedId = null;

/** Applique l'état masqué/visible à toutes les pièces montées. */
function applyHidden() {
  entries.forEach((e) => {
    if (!e.object) return;
    const id = e.mod.meta.id;
    // le mode isolé ne touche pas à la liste des pièces masquées : il se
    // superpose, et tout revient en le décochant
    e.object.visible = !hiddenParts.has(id) && (!isolatedId || id === isolatedId);
  });
  invalidate();
}

/** Met à jour la pièce isolée d'après la case et la sélection courante. */
function applyIsolation(id) {
  isolatedId = $('opt-isolate').checked ? (id || null) : null;
  applyHidden();
}

/* ------------------------------------------------------------------ *
 * Couleur des pièces
 * ------------------------------------------------------------------ */

const COLORS_KEY = 'tinyhoop-mk1:colors';

/** Couleur choisie par pièce, { id: '#rrggbb' }, conservée entre sessions. */
function loadColors() {
  try {
    const raw = localStorage.getItem(COLORS_KEY);
    const obj = raw ? JSON.parse(raw) : {};
    return obj && typeof obj === 'object' ? obj : {};
  } catch {
    return {};
  }
}

let partColors = loadColors();

function saveColors() {
  try {
    localStorage.setItem(COLORS_KEY, JSON.stringify(partColors));
  } catch { /* stockage indisponible : valable pour la session */ }
}

/** La matière d'une pièce décide de la façon dont la couleur se pose. */
function materialKind(entry) {
  return entry.mod.meta.isMesh ? 'imprime' : 'carbone';
}

/** Teinte affichée pour une pièce : la sienne, ou celle de sa matière. */
function colorOf(entry) {
  const chosen = partColors[entry.mod.meta.id];
  if (chosen) return chosen;
  const hex = DEFAULT_TINT[materialKind(entry) === 'carbone' ? 'carbone' : 'imprime'];
  // le blanc du carbone n'est pas une couleur, c'est l'absence de teinte :
  // dans le sélecteur on montre plutôt la couleur qu'a la pièce à l'écran
  return materialKind(entry) === 'carbone' ? '#3a3d42' : `#${hex.toString(16).padStart(6, '0')}`;
}

/** Applique les couleurs mémorisées à toutes les pièces montées. */
function applyColors() {
  entries.forEach((e) => {
    const body = e.object && e.object.getObjectByName('body');
    if (!body || !body.material) return;
    const chosen = partColors[e.mod.meta.id];
    tintMaterial(body.material, materialKind(e), chosen ? Number(`0x${chosen.slice(1)}`) : null);
  });
  invalidate();
}

function setPartColor(id, hex) {
  if (hex) partColors[id] = hex;
  else delete partColors[id];
  saveColors();
  applyColors();
  // une teinte se défait comme le reste : par le bouton retour
  pushHistory();
}

/* ------------------------------------------------------------------ *
 * Historique (annuler / rétablir)
 * ------------------------------------------------------------------ */

const history = createHistory();

/** État complet du plan de travail, tel qu'il est mémorisé et restauré. */
function snapshot() {
  return { placements, standoffs, hidden: [...hiddenParts], colors: partColors };
}

/** Vrai pendant une restauration : les sauvegardes ne doivent alors rien empiler. */
let restoring = false;

/** Enregistre l'état courant comme point de retour. */
function pushHistory() {
  if (restoring) return;
  if (history.push(snapshot())) renderHistoryButtons();
}

/**
 * Sauvegardes du plan de travail, passage obligé de toute modification.
 *
 * L'historique est alimenté ici plutôt qu'à chaque geste : les points de
 * mutation sont nombreux (contrainte de perçage, curseurs, assemblage
 * automatique, entretoises, masquage…) et en oublier un rendrait le retour
 * arrière incohérent — il sauterait par-dessus une action.
 */
function savePlacements() {
  asm.savePlacements(placements);
  pushHistory();
}

function saveStandoffs() {
  so.save(standoffs);
  pushHistory();
}

function applySnapshot(state) {
  restoring = true;
  try {
    placements = state.placements || {};
    standoffs = state.standoffs || [];
    hiddenParts = new Set(state.hidden || []);
    partColors = state.colors || {};
    asm.savePlacements(placements);
    so.save(standoffs);
    saveHidden();
    saveColors();

    clearSelection();
    clearStandoffSelection();
    layoutParts();
    renderStandoffs();
    renderStandoffList();
    renderPartList();
    applyHidden();
    applyColors();
    renderPartToolbar();
  } finally {
    restoring = false;
  }
  renderHistoryButtons();
}

function renderHistoryButtons() {
  $('hist-undo').disabled = !history.canUndo();
  $('hist-redo').disabled = !history.canRedo();
}

/** Repères de perçage visibles et cliquables uniquement en assemblage. */
function setMarkersVisible(visible) {
  // les anneaux débordent des pièces et se recouvrent une fois le châssis
  // assemblé : on doit pouvoir les éteindre pour regarder le modèle. Éteints,
  // ils ne sont plus cliquables non plus — viser une cible invisible ne
  // donnerait que des assemblages faits au hasard.
  const shown = visible && $('opt-markers').checked;
  entries.forEach((e) => {
    const group = e.object && e.object.getObjectByName('hole-markers');
    if (group) group.visible = shown;
  });
  if (!shown) clearSelection();
  $('asm-hint').classList.toggle('hidden', !shown);
}

function pickTargets() {
  const targets = [];
  entries.forEach((e) => {
    if (!e.object) return;
    const group = e.object.getObjectByName('hole-markers');
    if (!group || !group.visible) return;
    for (const marker of group.children) {
      const pick = marker.getObjectByName('pick');
      if (pick) targets.push(pick);
    }
  });
  return targets;
}

function entryById(id) {
  return entries.find((e) => e.mod.meta.id === id);
}

/* ------------------------------------------------------------------ *
 * Visserie
 * ------------------------------------------------------------------ */

const hardwareGroup = new THREE.Group();
hardwareGroup.name = 'hardware';
visserieGroupes.set('hardware', hardwareGroup);
scene.add(hardwareGroup);

/** Perçages d'une pièce, en coordonnées monde. */
const holeRay = new THREE.Raycaster();

/**
 * Relève, UNE FOIS À LA POSE de la pièce, ce que traverse chaque perçage.
 *
 * Une vis ne traverse pas « l'épaisseur de la pièce » mais l'épaisseur qu'il y
 * a À CET ENDROIT-LÀ. Sur une plaque les deux se confondent ; sur un support
 * caméra haut de 30 mm dont on ne visse que la patte, s'en tenir à la cote
 * hors-tout demandait une vis de 34 mm qui n'existe pas.
 *
 * Le relevé se fait dans le repère du porteur, pièce ramenée à l'origine :
 * il ne dépend donc pas de l'endroit où la pièce se trouve, et n'est fait
 * qu'une fois. Le refaire à chaque détection de visserie gelait la page —
 * 24 lancers de rayon par perçage contre un maillage de 92 000 triangles.
 */
function measureHoles(entry) {
  const body = entry.object && entry.object.getObjectByName('body');
  const markers = (entry.markers || []).filter((m) => m.userData.face !== 'bottom');
  if (!body || !markers.length) { entry.holeProbes = []; return; }

  const keep = {
    p: entry.holder.position.clone(),
    q: entry.holder.quaternion.clone(),
  };
  entry.holder.position.set(0, 0, 0);
  entry.holder.quaternion.identity();
  entry.holder.updateMatrixWorld(true);

  const box = new THREE.Box3().setFromObject(body);
  const v = new THREE.Vector3();
  const mq = new THREE.Quaternion();
  const dir = new THREE.Vector3();
  entry.holeProbes = markers.map((marker) => {
    marker.getWorldPosition(v);
    const a = marker.userData.anchor;
    // Axe du perçage, ramené au repère du porteur. Il faut passer par
    // l'orientation du repère lui-même : une plaque est extrudée sur son Z,
    // mais couchée d'un quart de tour pour être posée à plat — son axe de
    // perçage est donc vertical, pas horizontal.
    marker.getWorldQuaternion(mq);
    dir.set(a.axis === 'X' ? 1 : 0, a.axis === 'Y' ? 1 : 0, a.axis === 'Z' ? 1 : 0);
    if (!a.axis) dir.set(0, 0, 1);
    dir.applyQuaternion(mq);
    const probe = { lx: v.x, lz: v.z, r: a.r, ax: dir.x, ay: dir.y, az: dir.z };
    const r0 = Math.max(a.r, 0.8);
    let best = null;
    for (const ring of [r0 + 0.35, r0 + 0.8, r0 + 1.6]) {
      for (let k = 0; k < 8 && !best; k++) {
        const ang = (k * Math.PI) / 4;
        holeRay.set(
          new THREE.Vector3(v.x + ring * Math.cos(ang), box.max.y + 50, v.z + ring * Math.sin(ang)),
          new THREE.Vector3(0, -1, 0),
        );
        const hits = holeRay.intersectObject(body, false);
        if (hits.length < 2) continue;
        // La vis serre la matière qui touche la pièce d'en dessous, pas tout
        // ce que le rayon rencontre. Un support VTX creux mesure 16 mm du
        // haut au bas alors que son pied ne fait que 2 mm : demander une vis
        // de 20 mm rendait la fixation impossible.
        const last = hits.length - 1;
        best = {
          top: hits[0].point.y,
          bottom: hits[last].point.y,
          footTop: hits[last - 1].point.y,
          material: hits[last - 1].point.y - hits[last].point.y,
        };
      }
      if (best) break;
    }
    // sonde infructueuse (perçage au bord d'une paroi mince) : on retombe sur
    // l'encombrement mesuré de la pièce, jamais sur son origine
    return Object.assign(probe, best || {
      top: box.max.y, bottom: box.min.y, footTop: box.max.y,
      material: box.max.y - box.min.y,
    });
  });

  entry.holder.position.copy(keep.p);
  entry.holder.quaternion.copy(keep.q);
  entry.holder.updateMatrixWorld(true);
}

/** Perçages d'une pièce en coordonnées monde, d'après le relevé de pose. */
function partHolesInWorld(entry) {
  const m = entry.holder.matrixWorld;
  const q = entry.holder.quaternion;
  const top = new THREE.Vector3();
  const bottom = new THREE.Vector3();
  const foot = new THREE.Vector3();
  const axis = new THREE.Vector3();
  return (entry.holeProbes || []).map((p) => {
    top.set(p.lx, p.top, p.lz).applyMatrix4(m);
    bottom.set(p.lx, p.bottom, p.lz).applyMatrix4(m);
    foot.set(p.lx, p.footTop, p.lz).applyMatrix4(m);
    axis.set(p.ax, p.ay, p.az).applyQuaternion(q);
    return {
      x: (top.x + bottom.x) / 2,
      z: (top.z + bottom.z) / 2,
      diameter: p.r * 2,
      // une pièce retournée met son « haut » local en bas : on reclasse
      top: Math.max(top.y, bottom.y),
      bottom: Math.min(top.y, bottom.y),
      // face sur laquelle la tête de vis vient appuyer : le dessus de la
      // semelle, pas le sommet de la pièce
      seat: Math.max(Math.min(top.y, bottom.y), Math.min(foot.y, Math.max(top.y, bottom.y))),
      material: p.material,
      vertical: Math.abs(axis.y) > 0.85,
    };
  });
}

/** Pièces assemblées, sous la forme attendue par la détection. */
function assembledParts() {
  return entries
    .filter((e) => e.holder && e.object.visible !== false)
    .map((e) => {
      const body = e.object && e.object.getObjectByName('body');
      const box = new THREE.Box3();
      if (body) box.setFromObject(body);
      return {
        id: e.mod.meta.id,
        name: e.mod.meta.name,
        y: e.holder.position.y,
        thickness: e.mod.meta.dims.thickness,
        // faces réelles, mesurées : l'origine d'un maillage importé est à sa
        // base, pas en son milieu — y ± épaisseur/2 le plaçait n'importe où
        top: box.isEmpty() ? e.holder.position.y : box.max.y,
        bottom: box.isEmpty() ? e.holder.position.y : box.min.y,
        holes: partHolesInWorld(e),
      };
    });
}

/* ------------------------------------------------------------------ *
 * Visibilité de la visserie
 *
 * Vis et entretoises se montrent séparément : on veut souvent voir les
 * entretoises seules pour juger d'un empilement, ou les vis seules pour
 * vérifier ce qui dépasse. Les deux cases vivent dans le menu Affichage ;
 * un seul point de vérité, appelé partout où la visserie change.
 * ------------------------------------------------------------------ */

function applyHardwareVisibility() {
  const vis = $('opt-screws').checked;
  const entretoises = $('opt-standoffs').checked;
  // Toute la visserie de la scène, pas seulement celle posée sur le build : le
  // sachet étalé sur le plan de travail en fait partie. C'est là qu'on voyait
  // encore des vis après avoir décoché la case. Une étiquette de ligne du
  // sachet suit les vis — le sachet n'est fait que de ça.
  for (const g of visserieGroupes.values()) {
    for (const o of g.children) o.visible = o.name === 'standoff' ? entretoises : vis;
  }
  const pose = visserieGroupes.get('hardware');
  const manuelles = visserieGroupes.get('standoffs');
  const sachet = visserieGroupes.get('kit');
  if (pose) pose.visible = vis || entretoises;
  if (manuelles) manuelles.visible = entretoises;
  if (sachet) sachet.visible = $('opt-kit').checked && (vis || entretoises);
  invalidate();
}

function clearHardware() {
  while (hardwareGroup.children.length) {
    const child = hardwareGroup.children[0];
    hardwareGroup.remove(child);
    disposeObject(child);
  }
  // les vis retirées du build retournent au sachet : le stock est le même
  // objet, il ne se perd pas en route
  kitStock = new Map(hw.SCREW_KIT.map((l) => [l.id, l.count]));
  if (typeof renderKit === 'function') renderKit();
  $('bom').innerHTML = '';
  invalidate();
}

/**
 * Déduit la visserie de l'assemblage et la pose.
 *
 * Rien n'est demandé à l'auteur : le diamètre vient du perçage, la longueur
 * d'entretoise de l'écart entre les plaques, la longueur de vis de l'épaisseur
 * traversée. Les valeurs sont arrondies aux longueurs du commerce.
 */
function placeHardware(options = {}) {
  const animated = !!options.animated;
  clearHardware();

  const parts = assembledParts();
  const candidates = hw.findFastenerSites(parts);
  const spacing = Number($('hw-spacing').value);
  let sites = hw.spaceOut(candidates, spacing);
  if (!candidates.length) {
    updateAsmHint(
      "Aucun perçage ne s'aligne entre deux pièces d'altitudes différentes. "
      + 'Assemble d\'abord le build.',
      'warn',
    );
    return;
  }

  // AUCUNE PIÈCE NE DOIT RESTER LIBRE. L'espacement écarte les fixations
  // redondantes, mais il ne doit jamais laisser une pièce tenir toute seule :
  // on rattrape ici celles qu'il a désarmées, en leur rendant leurs points.
  const heldBy = (list) => {
    const n = new Map();
    for (const s of list) {
      n.set(s.lower.id, (n.get(s.lower.id) || 0) + 1);
      n.set(s.upper.id, (n.get(s.upper.id) || 0) + 1);
    }
    return n;
  };
  const MIN_PER_PART = 2;      // une seule vis laisse la pièce pivoter
  let held = heldBy(sites);
  for (const part of parts) {
    const own = candidates.filter((s) => s.lower.id === part.id || s.upper.id === part.id);
    if (!own.length) continue;                       // rien à visser sur cette pièce
    while ((held.get(part.id) || 0) < Math.min(MIN_PER_PART, own.length)) {
      // on reprend le point le plus éloigné de ceux déjà retenus : deux vis
      // côte à côte ne bloquent pas mieux qu'une
      const kept = sites.filter((s) => s.lower.id === part.id || s.upper.id === part.id);
      const next = own
        .filter((s) => !sites.includes(s))
        .sort((a, b) => Math.min(...kept.map((k) => Math.hypot(k.x - b.x, k.z - b.z)), 1e9)
          - Math.min(...kept.map((k) => Math.hypot(k.x - a.x, k.z - a.z)), 1e9))[0];
      if (!next) break;
      sites.push(next);
      held = heldBy(sites);
    }
  }

  // les vis sortent du sachet livré avec le châssis, pas d'un catalogue
  // infini : c'est lui qui décide des longueurs disponibles
  const { assigned, stock, missing } = hw.allocateFromKit(sites);
  kitStock = stock;

  // d'où part chaque vis : de son casier sur le plan quand on assemble le
  // build, directement en place quand on ne fait que recalculer la visserie
  const moves = [];
  const spare = new Map([...kitSlots].map(([id, list]) => [id, [...list]]));
  const spacerZone = reservedZones.find((z) => z.id === 'standoffs');

  for (const item of assigned) {
    const { site } = item;
    if (item.standoffLength > 0) {
      const standoff = hw.standoffMesh(site.thread, item.standoffLength);
      const to = new THREE.Vector3(site.x, site.lowerTop, site.z);
      if (animated && spacerZone) {
        standoff.position.set(
          spacerZone.x + (moves.length % 8) * 9 - 32, -14, spacerZone.z,
        );
        moves.push({ object: standoff, from: { p: standoff.position.clone() }, to: { position: to } });
      } else {
        standoff.position.copy(to);
      }
      hardwareGroup.add(standoff);
    }
    // la vis appuie sur la face supérieure de la pièce haute, au droit du trou
    const screw = hw.screwMesh(site.thread, item.screwLength);
    const to = new THREE.Vector3(site.x, site.upperTop, site.z);
    const slot = (spare.get(item.line.id) || []).pop();
    if (animated && slot) {
      screw.position.copy(slot);
      moves.push({ object: screw, from: { p: screw.position.clone() }, to: { position: to } });
    } else {
      screw.position.copy(to);
    }
    hardwareGroup.add(screw);
  }

  renderBom(assigned, sites, candidates.length, missing, hw.unfastened(parts, assigned), parts);
  renderKit();
  applyHardwareVisibility();

  // la visserie part du plan et va se poser : plus courte que le mouvement
  // des pièces, une vis n'a que quelques centimètres à faire
  if (animated && moves.length) {
    applyHardwareVisibility();
    runMotion(moves, null, { duration: 700, stagger: 45 });
  }
  return assigned.length;
}

function renderBom(items, sites, candidateCount, missing = [], free = [], parts = []) {
  const used = new Map();
  for (const item of items) used.set(item.line.id, (used.get(item.line.id) || 0) + 1);

  // la nomenclature suit le sachet, ligne par ligne : ce qui sert, ce qui reste
  const rows = hw.SCREW_KIT.map((line) => {
    const u = used.get(line.id) || 0;
    return `<div${u ? '' : ' class="dim"'}><dt>${line.label}</dt>`
      + `<dd>${u} / ${line.count}</dd></div>`;
  }).join('');

  // entretoises : regroupées par longueur exacte, c'est une liste de courses
  const spacers = new Map();
  for (const i of items.filter((x) => x.standoffLength > 0)) {
    const key = i.standoffLength.toFixed(2);
    spacers.set(key, (spacers.get(key) || 0) + 1);
  }
  const spacerRows = [...spacers.entries()]
    .sort((a, b) => Number(a[0]) - Number(b[0]))
    .map(([len, n]) => `<div><dt>Entretoise M2×${len.replace(/\.?0+$/, '')} mm</dt><dd>× ${n}</dd></div>`)
    .join('');

  const longest = Math.max(0, ...items.map((i) => i.protrusion));
  // une pièce vissable doit l'être par au moins deux vis ; une pièce sans
  // perçage de vis (cover clipsée) n'entre pas dans ce compte
  const per = hw.screwsPerPart(items);
  const screwable = parts.filter((p) => hw.hasScrewSeat(p));
  const weak = screwable.filter((p) => (per.get(p.id) || 0) < 2);
  const clipped = free.filter((p) => !hw.hasScrewSeat(p));

  $('bom').innerHTML = rows + spacerRows
    + `<div><dt>Fixations</dt><dd>${items.length} / ${candidateCount} candidates</dd></div>`
    + `<div${weak.length ? ' class="warn"' : ''}><dt>Pièces vissables tenues</dt>`
    + `<dd>${screwable.length - weak.length} / ${screwable.length}</dd></div>`
    + (clipped.length
      ? `<div class="dim"><dt>Sans perçage de vis</dt><dd>${clipped.map((p) => p.name).join(', ')}</dd></div>`
      : '');

  let short = '';
  if (missing.length) {
    const needed = Math.max(...missing.map((m) => m.needed));
    const line = hw.SCREW_KIT.find((l) => l.kind === 'screw' && l.length >= needed - 0.01);
    short = ` ${missing.length} fixation${missing.length > 1 ? 's' : ''} sans vis : `
      + (line
        ? `le sachet n'a plus de ${line.label} (les ${line.count} sont posées).`
        : `il faudrait du M2×${Math.ceil(needed)}, absent du sachet.`);
  }
  updateAsmHint(
    `${items.length} fixation${items.length > 1 ? 's' : ''} posée${items.length > 1 ? 's' : ''} `
    + `avec les vis du sachet${spacers.size ? `, ${[...spacers.values()].reduce((a, b) => a + b, 0)} entretoises à la cote exacte (aucun jeu)` : ''}`
    + (longest > 0.01 ? `, dépassement maximal sous la pièce ${longest.toFixed(1)} mm` : '')
    + '.'
    + (weak.length ? ` ${weak.length} pièce(s) tenue(s) par moins de 2 vis : ${weak.map((p) => p.name).join(', ')}.` : '')
    + (clipped.length
      ? ` ${clipped.map((p) => p.name).join(', ')} n'a/n'ont aucun perçage de vis : `
        + 'ces pièces se clipsent, rien à visser dessus.'
      : '')
    + short,
    (short || weak.length) ? 'warn' : 'ok',
  );
}

$('hw-place').addEventListener('click', () => placeHardware({ animated: true }));
$('hw-spacing').addEventListener('input', () => {
  $('v-spacing').value = `${$('hw-spacing').value} mm`;
  if (hardwareGroup.children.length) placeHardware();
});
$('hw-clear').addEventListener('click', () => {
  clearHardware();
  updateAsmHint('Visserie retirée.');
});
$('opt-screws').addEventListener('change', applyHardwareVisibility);
$('opt-standoffs').addEventListener('change', applyHardwareVisibility);

// le sachet sur le plan se montre indépendamment de la visserie posée : on
// veut souvent voir le build vissé sans le stock étalé à côté, et l'inverse
$('opt-kit').addEventListener('change', applyHardwareVisibility);

/* ------------------------------------------------------------------ *
 * Entretoises posées à la main
 * ------------------------------------------------------------------ */

/* Dans buildRoot, et non dans la scène : une entretoise appartient au châssis,
 * elle doit suivre la rotation automatique comme les plaques. */
const standoffGroup = new THREE.Group();
standoffGroup.name = 'standoffs';
visserieGroupes.set('standoffs', standoffGroup);
buildRoot.add(standoffGroup);

let standoffs = so.load();
let selectedStandoff = null;

/** Écart laissé entre deux entretoises en attente, sur leur rangée. */
const PARK_PITCH_MM = 9;

/**
 * Emplacement d'attente : une colonne à gauche du build, groupée avec les
 * autres pièces de cette zone plutôt que reléguée hors du build.
 *
 * Une entretoise non placée doit rester visible et visable. La poser à
 * l'origine la mettrait sous les plaques, où elle serait invisible et
 * incliquable — donc impossible à placer.
 */
function parkingSpot(rank, total) {
  // dans le carré réservé à la visserie, en rangées : c'est la place prévue
  // pour elle sur le plan, autant qu'elle s'y trouve vraiment
  const spot = reservedZones.find((z) => z.id === 'standoffs');
  if (!spot) return { x: 0, y: 0, z: (rank - (total - 1) / 2) * PARK_PITCH_MM };
  const perRow = Math.max(1, Math.floor((spot.w - 12) / PARK_PITCH_MM));
  const rows = Math.ceil(total / perRow);
  const col = rank % perRow;
  const row = Math.floor(rank / perRow);
  const cols = Math.min(total - row * perRow, perRow);
  return {
    x: spot.x + (col - (cols - 1) / 2) * PARK_PITCH_MM,
    y: 0,
    z: spot.z + (row - (rows - 1) / 2) * PARK_PITCH_MM * 2,
  };
}

/** (Re)construit les entretoises de la scène d'après leur description. */
function renderStandoffs() {
  while (standoffGroup.children.length) {
    const child = standoffGroup.children[0];
    standoffGroup.remove(child);
    disposeObject(child);
  }
  standoffs.forEach((spec, i) => {
    const mesh = so.standoffMesh(spec, spec.id === selectedStandoff);
    const at = spec.x === null ? parkingSpot(i, standoffs.length) : spec;
    mesh.position.set(at.x, at.y, at.z);
    standoffGroup.add(mesh);
  });
  applyHardwareVisibility();
  invalidate();
}

function renderStandoffList() {
  const list = $('so-list');
  list.innerHTML = standoffs.map((s, i) => {
    const cls = [s.x === null ? 'pending' : '', s.id === selectedStandoff ? 'on' : '']
      .filter(Boolean).join(' ');
    const pos = s.x === null
      ? 'à placer'
      : `${s.x.toFixed(1)} · ${s.y.toFixed(1)} · ${s.z.toFixed(1)}`;
    return `<li class="${cls}" data-id="${s.id}">`
      + `<span class="so-ref">${i + 1}. ${so.reference(s)}</span>`
      + `<span class="so-pos">${pos}</span></li>`;
  }).join('');

  list.querySelectorAll('li').forEach((li) => {
    li.addEventListener('click', () => selectStandoff(li.dataset.id));
  });
  $('so-copy').disabled = standoffs.length === 0;
}

function selectStandoff(id) {
  selectedStandoff = selectedStandoff === id ? null : id;
  if (selectedStandoff) {
    clearPartSelection();
    const spec = standoffs.find((s) => s.id === selectedStandoff);
    updateAsmHint(
      `Entretoise ${so.reference(spec)} sélectionnée. Clique le perçage qui doit `
      + 'la recevoir : elle se pose dessus, base sur la face supérieure de la plaque.',
      'ok',
    );
  } else {
    updateAsmHint();
  }
  renderStandoffs();
  renderStandoffList();
}

function clearStandoffSelection() {
  if (!selectedStandoff) return;
  selectedStandoff = null;
  renderStandoffs();
  renderStandoffList();
}

function standoffTargets() {
  if (!standoffGroup.visible) return [];
  return standoffGroup.children
    .map((g) => g.getObjectByName('standoff-body'))
    .filter(Boolean);
}

/** Pose l'entretoise sélectionnée sur le perçage cliqué. */
function placeStandoffOnMarker(marker) {
  const spec = standoffs.find((s) => s.id === selectedStandoff);
  const entry = entryById(marker.userData.partId);
  if (!spec || !entry) return;

  // la base appuie sur la face supérieure de la plaque percée, pas sur le
  // repère de perçage — celui-ci flotte quelques dixièmes au-dessus
  const world = marker.getWorldPosition(new THREE.Vector3());
  world.y = entry.holder.position.y + entry.mod.meta.dims.thickness / 2;
  const local = buildRoot.worldToLocal(world);

  spec.x = local.x; spec.y = local.y; spec.z = local.z;
  spec.source = 'click';
  spec.holeLabel = `${entry.mod.meta.name} #${marker.userData.anchor.index}`;
  saveStandoffs();

  const remaining = standoffs.filter((s) => s.x === null);
  selectedStandoff = remaining.length ? remaining[0].id : null;
  renderStandoffs();
  renderStandoffList();
  updateAsmHint(
    `Entretoise posée sur ${spec.holeLabel} — X ${spec.x.toFixed(2)} · `
    + `Y ${spec.y.toFixed(2)} · Z ${spec.z.toFixed(2)} mm.`
    + (remaining.length
      ? ` ${remaining.length} entretoise${remaining.length > 1 ? 's' : ''} en attente, `
        + 'la suivante est sélectionnée.'
      : ' Lot complet.'),
    'ok',
  );
}

$('so-create').addEventListener('click', () => {
  const threadId = $('so-thread').value;
  const thread = hw.THREADS[threadId];
  const spec = {
    threadId,
    diameter: thread.diameter,
    acrossFlats: Number($('so-flats').value),
    length: Number($('so-len').value),
    count: Math.max(1, Math.min(16, Number($('so-count').value))),
  };
  const lot = so.create(spec);

  // tentative de pose automatique : seulement si des plaques sont écartées
  // exactement de la longueur de l'entretoise
  const sites = hw.findFastenerSites(assembledParts())
    .filter((s) => s.thread.id === threadId);
  const proposal = so.proposeSites(sites, spec.length, spec.count);
  proposal.sites.forEach((site, i) => {
    const s = lot[i];
    const world = new THREE.Vector3(site.x, site.lower.y + site.lower.thickness / 2, site.z);
    const local = buildRoot.worldToLocal(world);
    s.x = local.x; s.y = local.y; s.z = local.z;
    s.source = 'auto';
    s.holeLabel = `${site.lower.name} → ${site.upper.name}`;
  });

  standoffs = standoffs.concat(lot);
  saveStandoffs();
  selectedStandoff = lot.find((s) => s.x === null)?.id ?? null;
  renderStandoffs();
  renderStandoffList();

  const placed = proposal.sites.length;
  if (placed === spec.count) {
    updateAsmHint(
      `${placed} entretoises ${so.reference(lot[0])} posées : `
      + `l'écart entre plaques vaut ${proposal.gap.toFixed(2)} mm.`,
      'ok',
    );
  } else {
    updateAsmHint(
      `${spec.count} entretoises ${so.reference(lot[0])} créées`
      + (placed ? `, ${placed} posée${placed > 1 ? 's' : ''}` : '')
      + '. Pas d\'écart entre plaques égal à leur longueur'
      + (proposal.nearest !== null
        ? ` — le plus proche vaut ${proposal.nearest.toFixed(2)} mm`
        : ' — aucune plaque n\'est assemblée au-dessus d\'une autre')
      + '. Elles attendent en rangée à droite du build : sélectionne-en une, '
      + 'puis clique son perçage.',
      'warn',
    );
  }
  frameAll();
});

// les 4 entretoises du châssis restent posables d'un geste, mais à la
// demande : l'assemblage ne les met plus tout seul
$('so-chassis').addEventListener('click', () => {
  const posed = placeChassisStandoffs();
  updateAsmHint(
    posed
      ? `${posed} entretoises M2×4×22 posées sur la plaque intermédiaire, `
        + `perçages #${CHASSIS_STANDOFF_HOLES.join(', #')}.`
      : 'Plaque intermédiaire introuvable.',
    posed ? 'ok' : 'warn',
  );
});

$('so-clear').addEventListener('click', () => {
  standoffs = [];
  selectedStandoff = null;
  saveStandoffs();
  renderStandoffs();
  renderStandoffList();
  updateAsmHint('Entretoises retirées.');
});

$('so-copy').addEventListener('click', async () => {
  const text = so.coordinateReport(standoffs);
  try {
    await navigator.clipboard.writeText(text);
    updateAsmHint('Coordonnées copiées dans le presse-papiers.', 'ok');
  } catch {
    // presse-papiers refusé (page non sécurisée, permission) : on affiche le
    // texte, il reste sélectionnable à la main
    updateAsmHint(text, 'ok');
  }
});

/**
 * Assemble le châssis en un clic : pose 4 entretoises M2×4×22 sur la
 * middle-plate, aux perçages repérés à la main.
 *
 * Ces 4 perçages avaient été repérés #16, #17, #27, #28 sur l'ancien tracé
 * photo de cette pièce (alors mal nommée « bottom-plate ») ; le contour vient
 * maintenant du fichier middleplate.stl fourni, dont l'extraction numérote
 * les mêmes perçages dans un autre ordre — #26, #10, #22, #16 ci-dessous.
 * Les positions concordent à 0,22 mm près avec l'ancien tracé : ce sont bien
 * les mêmes trous physiques.
 *
 * La position vient de l'index du perçage sur la pièce, pas de coordonnées
 * figées : elle reste juste quelle que soit la disposition courante de la
 * plaque (établi ou assemblée), contrairement à des coordonnées monde notées
 * une fois puis recopiées.
 */
const CHASSIS_STANDOFF_HOLES = [26, 10, 22, 16];
const CHASSIS_STANDOFF_SPEC = { threadId: 'M2', diameter: 2, acrossFlats: 4, length: 22 };

/**
 * Relève l'état des pièces pour une disposition donnée, SANS la laisser en
 * place : on bascule la vue, on note où chacune atterrit, puis on remet tout
 * comme c'était. C'est ce qui permet d'y aller en mouvement plutôt que d'un
 * coup.
 */
function captureLayout(sideBySide, bench = false) {
  const before = entries.map((e) => ({
    e, p: e.holder.position.clone(), q: e.holder.quaternion.clone(),
  }));
  const box = $('opt-layout');
  const was = box.checked;
  const wasForced = forceBench;
  box.checked = sideBySide;
  forceBench = bench;
  layoutParts();
  const targets = new Map(entries.map((e) => [e.mod.meta.id, {
    position: e.holder.position.clone(), quaternion: e.holder.quaternion.clone(),
  }]));
  // le cadrage se relève ici, pièces en place : à l'arrivée il n'y aura plus
  // rien à recalculer, donc plus de saut
  const sphere = buildSphere();
  box.checked = was;
  forceBench = wasForced;
  before.forEach((b) => {
    b.e.holder.position.copy(b.p);
    b.e.holder.quaternion.copy(b.q);
    b.e.holder.updateMatrixWorld(true);
  });
  return { targets, sphere };
}

/**
 * Recale chaque pièce sur les perçages de celle qui la porte.
 *
 * Une pièce posée à la main tombe rarement au dixième : sur ce build, la
 * plaque supérieure était à 1,3 mm des perçages de la plaque intermédiaire.
 * Une vis ne passe pas dans un décalage pareil — la fixation n'était même pas
 * reconnue. On aligne donc les perçages avant de visser, par une translation
 * dans le plan, sans toucher aux hauteurs ni aux angles.
 *
 * @returns {{id:string, name:string, dx:number, dz:number}[]} corrections faites
 */
function snapToReferenceHoles() {
  const MAX_SNAP = 2;          // au-delà, ce n'est plus un décalage mais un autre trou
  const parts = assembledParts();
  const byId = new Map(parts.map((p) => [p.id, p]));
  const moved = [];

  // du bas vers le haut : une pièce se recale sur son support, déjà en place
  const order = entries
    .filter((e) => byId.has(e.mod.meta.id))
    .sort((a, b) => a.holder.position.y - b.holder.position.y);

  for (const entry of order) {
    const id = entry.mod.meta.id;
    const placement = placements[id];
    if (!placement || !placement.refId) continue;
    const self = byId.get(id);
    const ref = byId.get(placement.refId);
    if (!self || !ref) continue;

    // seulement les vrais perçages de vis, verticaux et au filetage du
    // sachet : recaler une pièce sur un passage de câble ou sur un perçage
    // Ø3,5 qui ne verra jamais de vis, c'est la déplacer pour rien — le
    // cover en avait pris 2,5 mm
    const seats = (p) => p.holes.filter((h) => h.vertical !== false
      && (hw.threadForHole(h.diameter) || {}).id === 'M2');
    const mine = seats(self);
    const theirs = seats(ref);
    if (mine.length < 2 || theirs.length < 2) continue;

    let sx = 0, sz = 0, n = 0;
    for (const h of mine) {
      let best = null;
      for (const k of theirs) {
        const d = Math.hypot(h.x - k.x, h.z - k.z);
        if (d <= MAX_SNAP && (!best || d < best.d)) best = { d, k };
      }
      if (!best) continue;
      sx += best.k.x - h.x;
      sz += best.k.z - h.z;
      n++;
    }
    if (n < 2) continue;
    const dx = sx / n;
    const dz = sz / n;
    if (Math.hypot(dx, dz) < 0.05) continue;         // déjà en face

    entry.holder.position.x += dx;
    entry.holder.position.z += dz;
    entry.holder.updateMatrixWorld(true);
    placement.x = entry.holder.position.x;
    placement.z = entry.holder.position.z;
    placements[id] = placement;
    moved.push({ id, name: entry.mod.meta.name, dx, dz });
    // les pièces suivantes doivent voir la nouvelle position
    byId.set(id, assembledParts().find((p) => p.id === id));
  }
  if (moved.length) savePlacements();
  return moved;
}

/** Pose les 4 entretoises du châssis sur la plaque intermédiaire. */
function placeChassisStandoffs() {
  const plate = entryById('middle-plate');
  if (!plate || !plate.holder) {
    updateAsmHint('Middle-plate introuvable.', 'warn');
    return;
  }

  const targets = CHASSIS_STANDOFF_HOLES.map(
    (idx) => (plate.markers || []).find((m) => m.userData.anchor.index === idx),
  );
  const missing = CHASSIS_STANDOFF_HOLES.filter((_, i) => !targets[i]);
  if (missing.length) {
    updateAsmHint(
      `Perçage${missing.length > 1 ? 's' : ''} #${missing.join(', #')} introuvable`
      + `${missing.length > 1 ? 's' : ''} sur la plaque intermédiaire — le tracé a peut-être changé.`,
      'warn',
    );
    return;
  }

  // ré-appuyer sur le bouton doit reposer les MÊMES entretoises, pas en créer
  // de nouvelles : on retrouve d'abord celles déjà posées par ce bouton sur
  // chacun de ces perçages, avant de piocher dans les non placées, avant de
  // n'en créer que s'il en manque encore
  const labelFor = (idx) => `${plate.mod.meta.name} #${idx}`;
  const free = standoffs.filter((s) => s.x === null && s.threadId === 'M2');
  const batch = CHASSIS_STANDOFF_HOLES.map((idx) => {
    const already = standoffs.find((s) => s.source === 'assemble' && s.holeLabel === labelFor(idx));
    if (already) return already;
    if (free.length) return free.shift();
    const [s] = so.create({ ...CHASSIS_STANDOFF_SPEC, count: 1 });
    standoffs.push(s);
    return s;
  });

  plate.holder.updateMatrixWorld(true);
  batch.forEach((s, i) => {
    const marker = targets[i];
    const world = marker.getWorldPosition(new THREE.Vector3());
    // la base appuie sur la face supérieure de la plaque, pas sur le repère
    // de perçage — celui-ci flotte quelques dixièmes au-dessus
    world.y = plate.holder.position.y + plate.mod.meta.dims.thickness / 2;
    const local = buildRoot.worldToLocal(world);
    s.x = local.x; s.y = local.y; s.z = local.z;
    s.source = 'assemble';
    s.holeLabel = labelFor(marker.userData.anchor.index);
  });

  saveStandoffs();
  selectedStandoff = null;
  renderStandoffs();
  renderStandoffList();
  return batch.length;
}

/**
 * Assemble le build en mouvement.
 *
 * La disposition d'établi est mémorisée telle quelle avant de partir : c'est
 * elle que « Désassembler » restitue, pièce par pièce, et pas un rangement
 * recalculé qui aurait pu changer entre-temps.
 */
$('asm-assemble-chassis').addEventListener('click', () => {
  if (motion) return;                       // un mouvement est déjà en cours
  const box = $('opt-layout');
  if (!box.checked && !forceBench) {
    updateAsmHint('Le build est déjà assemblé.', 'warn');
    return;
  }
  const { targets, sphere } = captureLayout(false);
  setMarkersVisible(false);
  reservedGroup.visible = false;
  updateAsmHint('Assemblage en cours…');
  animateTo(targets, () => {
    // la case ne bascule qu'à l'arrivée : sinon la disposition se ré-appliquerait
    // d'un coup au premier rendu et écraserait le mouvement
    box.checked = false;
    forceBench = false;
    layoutParts();
    // les perçages doivent tomber en face avant qu'on parle de visser
    const snapped = snapToReferenceHoles();
    // Ni vis ni entretoises ne partent toutes seules : elles se posent à la
    // demande, depuis le menu Visserie, pour laisser la main sur chacune.
    updateAsmHint(
      'Build assemblé'
      + (snapped.length
        ? `, ${snapped.length} pièce(s) recalée(s) sur les perçages `
          + `(jusqu'à ${Math.max(...snapped.map((m) => Math.hypot(m.dx, m.dz))).toFixed(2)} mm)`
        : '')
      + '.',
      'ok',
    );
  });
  // la caméra part en même temps que les pièces et arrive avec elles
  flyToFrame(sphere, motion ? motion.total : 900);
});

$('asm-disassemble').addEventListener('click', () => {
  if (motion) return;
  const box = $('opt-layout');
  // « rangé » ne se lit pas à la case : un plan chargé garde ses pièces
  // placées même en vue côte à côte, tant qu'on n'a pas désassemblé
  if (forceBench) {
    updateAsmHint('Les pièces sont déjà rangées sur le plan.', 'warn');
    return;
  }
  const { targets, sphere } = captureLayout(true, true);
  setMarkersVisible(false);
  // la visserie retourne au sachet avant que les pièces ne bougent, et les
  // entretoises rejoignent leur carré : posées, elles resteraient en l'air
  // là où le build se trouvait
  clearHardware();
  if (standoffs.some((so_) => so_.x !== null)) {
    standoffs.forEach((so_) => { so_.x = null; so_.y = null; so_.z = null; });
    saveStandoffs();
    renderStandoffs();
    renderStandoffList();
  }
  updateAsmHint('Désassemblage en cours…');
  animateTo(targets, () => {
    box.checked = true;
    forceBench = true;
    layoutParts();
    updateAsmHint('Pièces revenues à leur place sur le plan.', 'ok');
  }, { descending: true });
  flyToFrame(sphere, motion ? motion.total : 900);
});

/* ------------------------------------------------------------------ *
 * Sélection d'une pièce
 * ------------------------------------------------------------------ */

let selectedId = null;

const SELECT_EMISSIVE = 0x14384f;

function applySelectionLook() {
  entries.forEach((e) => {
    if (!e.object) return;
    const on = e.mod.meta.id === selectedId;
    const body = e.object.getObjectByName('body');
    const edges = e.object.getObjectByName('edges');
    if (body && body.material.emissive) {
      body.material.emissive.setHex(on ? SELECT_EMISSIVE : 0x000000);
    }
    if (edges) {
      edges.material.color.setHex(on ? 0xffb454 : 0x6cc7ff);
      edges.material.opacity = on ? 1 : 0.55;
    }
  });
  document.querySelectorAll('#part-list .part').forEach((li) => {
    li.classList.toggle('selected', li.dataset.id === selectedId);
  });
  invalidate();
}

function selectPart(id) {
  selectedId = id;
  applySelectionLook();
  applyIsolation(id);
  renderPartToolbar();
}

function clearPartSelection() {
  selectedId = null;
  applySelectionLook();
  applyIsolation(null);
  renderPartToolbar();
}

/**
 * Boîte englobante du CORPS d'une pièce, en coordonnées monde.
 * Le corps seul : les repères d'accrochage débordent de la matière.
 */
function bodyBox(entry) {
  const body = entry.object && entry.object.getObjectByName('body');
  if (!body) return null;
  entry.holder.updateMatrixWorld(true);
  return new THREE.Box3().setFromObject(body);
}

/**
 * Fait reposer une pièce sur une altitude donnée, ou l'y suspend par le haut.
 *
 * On mesure la pièce telle qu'elle est orientée plutôt que de supposer où se
 * trouve son origine locale. Une pièce retournée par les curseurs de rotation
 * a son origine en haut : la règle « origine à la base » la faisait alors
 * s'enfoncer de toute sa hauteur sous la plaque.
 *
 * @param {object} entry
 * @param {number} surfaceY altitude de la face d'appui
 * @param {boolean} [under] suspendre sous la surface au lieu de poser dessus
 */
function restOnSurface(entry, surfaceY, under = false) {
  const box = bodyBox(entry);
  if (!box) return;
  entry.holder.position.y += under ? surfaceY - box.max.y : surfaceY - box.min.y;
  entry.holder.updateMatrixWorld(true);
}

/** Corps des pièces, cibles du clic de sélection. */
function bodyTargets() {
  const targets = [];
  entries.forEach((e) => {
    const body = e.object && e.object.getObjectByName('body');
    if (body) targets.push(body);
  });
  return targets;
}

/* ------------------------------------------------------------------ *
 * Barre d'actions de la pièce sélectionnée
 * ------------------------------------------------------------------ */

/** Bornes des curseurs de déplacement, en mm : couvre toute la disposition d'établi actuelle. */
const MOVE_RANGE_XZ = 260;
const MOVE_RANGE_Y = [-20, 160];

function renderPartToolbar() {
  const bar = $('part-toolbar');
  const entry = selectedId ? entryById(selectedId) : null;
  bar.classList.toggle('hidden', !entry);
  if (!entry) return;

  const placement = placements[selectedId] || {};
  const reference = placement.refId ? entryById(placement.refId) : null;
  const noRef = "Assemble d'abord la pièce sur une autre, par leurs perçages";
  const pos = entry.holder.position;

  const rot = entry.holder.rotation;
  const deg = (rad) => (rad * 180) / Math.PI;

  const axisSlider = (axis, value, min, max) => `
    <label class="move-axis">${axis.toUpperCase()}
      <input type="range" class="mv" data-axis="${axis}" min="${min}" max="${max}" step="0.2" value="${value.toFixed(1)}">
      <output>${value.toFixed(1)}</output>
    </label>`;

  const turnSlider = (axis, value) => `
    <label class="move-axis">${axis.toUpperCase()}
      <input type="range" class="rot" data-axis="${axis}" min="-180" max="180" step="1" value="${Math.round(value)}">
      <output>${Math.round(value)}°</output>
    </label>`;

  // Sélecteur d'habillage — n'apparaît que pour les pièces qui en déclarent
  // (les covers). C'est le clic sur la pièce dans la scène qui l'ouvre :
  // choisir un motif se fait en regardant la pièce, pas dans une liste.
  const styles = entry.mod.meta.styles;
  const styleRow = styles ? `
    <div class="row styles">
      <span class="row-label" title="Le fichier change, les cotes et les surfaces de montage ne bougent pas">Habillage</span>
      ${styles.map((s) => `<button data-style="${s.id}"
        class="${s.id === entry.mod.meta.styleId ? 'on' : ''}"
        title="${s.note}">${s.name}</button>`).join('')}
    </div>` : '';

  bar.innerHTML = `
    ${styleRow}
    <div class="row actions">
      <span class="sel-name">${entry.mod.meta.name}</span>
      <button data-act="mirror" class="${placement.mirrored ? 'on' : ''}"
        title="Symétrie gauche/droite de la pièce">⇋ Miroir</button>
      <button data-act="above" class="${placement.side !== 'below' ? 'on' : ''}"
        ${reference ? '' : 'disabled'}
        title="${reference ? `Poser au-dessus de « ${reference.mod.meta.name} »` : noRef}">⬆ Dessus</button>
      <button data-act="below" class="${placement.side === 'below' ? 'on' : ''}"
        ${reference ? '' : 'disabled'}
        title="${reference ? `Poser en dessous de « ${reference.mod.meta.name} »` : noRef}">⬇ Dessous</button>
      <label class="tint" title="Couleur de la pièce — le carbone garde son tissage, l'imprimé prend la teinte pleine">
        <input type="color" id="part-tint" value="${colorOf(entry)}">
      </label>
      <button data-act="tint-reset" title="Revenir à la teinte d'origine de la matière">↺</button>
      <button data-act="clear" title="Désélectionner">✕</button>
    </div>
    <div class="row move" title="Comme dans Cura : déplace la pièce à la souris, sa position reste ensuite fixée telle quelle, dans toutes les vues.">
      ${axisSlider('x', pos.x, -MOVE_RANGE_XZ, MOVE_RANGE_XZ)}
      ${axisSlider('y', pos.y, MOVE_RANGE_Y[0], MOVE_RANGE_Y[1])}
      ${axisSlider('z', pos.z, -MOVE_RANGE_XZ, MOVE_RANGE_XZ)}
      <button data-act="reset-pos" title="Revenir à la position automatique">↺</button>
    </div>
    <div class="row move" title="Rotation de la pièce autour de son propre centre, en degrés.">
      <span class="row-label">↻</span>
      ${turnSlider('x', deg(rot.x))}
      ${turnSlider('y', deg(rot.y))}
      ${turnSlider('z', deg(rot.z))}
      <button data-act="reset-rot" title="Remettre la pièce d'aplomb">↺</button>
    </div>`;

  // `.row.actions` et non plus « la première ligne » : le sélecteur
  // d'habillage passe devant elle sur les covers, et prenait sa place.
  bar.querySelectorAll('.row.actions button').forEach((btn) => {
    btn.addEventListener('click', () => partAction(btn.dataset.act));
  });
  bar.querySelectorAll('.row.styles button').forEach((btn) => {
    btn.addEventListener('click', () => setPartStyle(entry, btn.dataset.style));
  });
  bar.querySelector('#part-tint').addEventListener('input', (e) => {
    setPartColor(selectedId, e.target.value);
  });
  bar.querySelector('[data-act="reset-pos"]').addEventListener('click', () => partAction('reset-pos'));
  bar.querySelector('[data-act="reset-rot"]').addEventListener('click', () => partAction('reset-rot'));

  bar.querySelectorAll('.rot').forEach((input) => {
    input.addEventListener('input', () => {
      const axis = input.dataset.axis;
      const value = Number(input.value);
      input.nextElementSibling.textContent = `${value}°`;
      entry.holder.rotation[axis] = (value * Math.PI) / 180;
      entry.holder.updateMatrixWorld(true);
      storePlacement(entry, { manual: true });
      invalidate();
    });
  });

  bar.querySelectorAll('.mv').forEach((input) => {
    input.addEventListener('input', () => {
      const axis = input.dataset.axis;
      const value = Number(input.value);
      input.nextElementSibling.textContent = value.toFixed(1);
      entry.holder.position[axis] = value;
      entry.holder.updateMatrixWorld(true);
      // une pièce déplacée à la main garde cette position partout, y compris
      // en vue « côte à côte » — sinon le curseur n'aurait aucun effet visible
      storePlacement(entry, { manual: true });
      invalidate();
    });
  });
}

/**
 * Change l'habillage d'un cover.
 *
 * Le fichier n'est chargé qu'ici, au moment où on le demande, et il pèse
 * plusieurs mégaoctets : les boutons sont neutralisés le temps du chargement,
 * sinon deux clics rapides lancent deux montages qui se croisent.
 *
 * SEULE la pièce concernée est remontée. Reconstruire toute la scène coûtait
 * plusieurs secondes — chaque pièce refait son maillage d'arêtes et son relevé
 * de perçages — alors que dix-neuf d'entre elles n'ont pas bougé.
 */
async function setPartStyle(entry, styleId) {
  if (!styleId || entry.mod.meta.styleId === styleId) return;
  const bar = $('part-toolbar');
  const style = entry.mod.meta.styles.find((s) => s.id === styleId);
  bar.querySelectorAll('.row.styles button').forEach((b) => {
    b.disabled = true;
    b.classList.toggle('loading', b.dataset.style === styleId);
  });
  // Le fichier pèse plusieurs mégaoctets : sans un mot tout de suite, le clic
  // paraît sans effet le temps du téléchargement.
  updateAsmHint(`Chargement de l'habillage ${style ? style.name : styleId}…`);
  try {
    await entry.mod.setStyle(styleId);
  } catch (err) {
    updateAsmHint(`Habillage « ${style ? style.name : styleId} » indisponible : ${err.message}`, 'warn');
    renderPartToolbar();
    return;
  }
  // Le rangement automatique de l'établi espace les pièces selon leur taille :
  // un habillage plus long décalait la pièce de quelques centimètres, alors
  // qu'on vient seulement de changer son motif. On lui rend sa place exacte.
  const before = {
    pos: entry.holder.position.clone(),
    rot: entry.holder.rotation.clone(),
  };
  // `mountPart` rend un porteur neuf, à l'origine : on lui remet la position
  // et l'orientation que la pièce avait, pour qu'un changement de motif ne la
  // fasse pas sauter d'un créneau d'établi à l'autre.
  //
  // SANS enregistrer ce placement, et surtout sans le marquer « à la main » :
  // ce drapeau fige une pièce partout, y compris en vue assemblée, et le cover
  // ne suivait alors plus l'animation d'assemblage. On ne touche donc pas au
  // plan enregistré — la pièce garde sa place ici et retrouve la sienne au
  // prochain rangement, assemblage compris.
  mountPart(entry, entry.mod.isCustom ? null : appliedTrace());
  entry.holder.position.copy(before.pos);
  entry.holder.rotation.copy(before.rot);
  entry.holder.updateMatrixWorld(true);
  applyHidden();
  applyColors();
  applySelectionLook();
  renderPartList();
  renderPartToolbar();
  invalidate();
  updateAsmHint(`« ${entry.mod.meta.name} » : habillage ${style.name} — ${style.note}.`, 'ok');
}

function partAction(action) {
  const entry = entryById(selectedId);
  if (!entry) return;
  const id = entry.mod.meta.id;

  if (action === 'clear') { clearPartSelection(); return; }

  if (action === 'tint-reset') {
    setPartColor(id, null);
    renderPartToolbar();
    updateAsmHint(`« ${entry.mod.meta.name} » : teinte d'origine rétablie.`, 'ok');
    return;
  }

  if (action === 'reset-rot') {
    entry.holder.rotation.set(0, 0, 0);
    entry.holder.updateMatrixWorld(true);
    storePlacement(entry, { manual: true });
    renderPartToolbar();
    invalidate();
    return;
  }

  if (action === 'reset-pos') {
    delete placements[id];
    savePlacements();
    layoutParts();
    renderPartToolbar();
    updateAsmHint(`« ${entry.mod.meta.name} » remise à sa position automatique.`, 'ok');
    return;
  }

  const placement = placements[id] || {};

  if (action === 'mirror') {
    placement.mirrored = !placement.mirrored;
    placements[id] = placement;
    savePlacements();
    // le miroir change la géométrie : la pièce est reconstruite
    mountPart(entry, entry.mod.isCustom ? null : appliedTrace());
    applyColors();          // la pièce vient d'être refaite : elle a repris sa teinte d'usine
    layoutParts();
    applySelectionLook();
    renderPartToolbar();
    updateAsmHint(
      `« ${entry.mod.meta.name} » ${placement.mirrored ? 'passée en miroir' : "remise dans son sens d'origine"}.`
      + " Les perçages ont bougé : reprends l'alignement si elle était assemblée.",
      'ok',
    );
    return;
  }

  if (action === 'above' || action === 'below') {
    const reference = placement.refId ? entryById(placement.refId) : null;
    if (!reference) {
      updateAsmHint("Assemble d'abord cette pièce sur une autre, par leurs perçages.", 'warn');
      return;
    }
    placement.side = action;
    // mesuré sur la pièce telle qu'orientée, comme pour la pose par perçages
    const refHalf = reference.mod.meta.dims.thickness / 2;
    const surface = reference.holder.position.y + (action === 'below' ? -refHalf : refHalf);
    restOnSurface(entry, surface, action === 'below');
    placement.y = entry.holder.position.y;
    placements[id] = placement;
    savePlacements();
    layoutParts();
    renderPartToolbar();
    updateAsmHint(
      `« ${entry.mod.meta.name} » posée ${action === 'below' ? 'en dessous' : 'au-dessus'} `
      + `de « ${reference.mod.meta.name} ».`,
      'ok',
    );
  }
}

function clearSelection() {
  entries.forEach((e) => (e.markers || []).forEach((m) => asm.highlight(m, 'idle')));
  asm.reset();
  updateAsmHint();
  invalidate();
}

function updateAsmHint(message, kind = '') {
  const el = $('asm-hint');
  if (message) {
    el.textContent = message;
    el.className = `asm-hint ${kind}`;
    return;
  }
  el.className = 'asm-hint';
  el.textContent = asm.state.pending
    ? 'Clique maintenant le trou correspondant sur la pièce à placer.'
    : asm.state.movingId
      ? "Pièce ancrée. Clique un 2e trou de référence, puis son équivalent, pour l'orienter."
      : 'Clique un trou de la pièce de référence, puis le trou correspondant sur la pièce à placer.';
}

/** Mémorise le placement courant d'une pièce. */
function storePlacement(entry, extra = {}) {
  // dès que l'utilisateur place une pièce lui-même, le rangement automatique
  // cesse de s'imposer : sinon son geste serait effacé au premier réaffichage
  forceBench = false;
  const spread = Number($('explode').value);
  const i = entries.indexOf(entry);
  placements[entry.mod.meta.id] = {
    ...placements[entry.mod.meta.id],
    x: entry.holder.position.x,
    y: entry.holder.position.y - i * spread,
    z: entry.holder.position.z,
    // rotY reste le nom historique (l'assemblage par perçages ne fait tourner
    // que la verticale) ; rotX/rotZ viennent des curseurs de rotation
    rotY: entry.holder.rotation.y,
    rotX: entry.holder.rotation.x,
    rotZ: entry.holder.rotation.z,
    ...extra,
  };
  savePlacements();
}

let lastPick = null;

/* ------------------------------------------------------------------ *
 * Mode « Poser » : une face contre une face
 * ------------------------------------------------------------------ */

/**
 * L'assemblage par perçages suppose deux trous en regard. Beaucoup de pièces
 * n'en ont pas — un cover posé sur une plaque, un support qui s'appuie sans
 * se visser. Ce mode-là ne demande que deux faces : celle qui doit toucher,
 * et celle sur laquelle poser.
 *
 * Rien d'autre ne bouge : ni le plan (X, Z), ni les angles. La pièce descend
 * ou monte de la différence de hauteur entre les deux points cliqués, ce qui
 * met exactement en contact les deux faces à cet endroit.
 */
let poseMode = false;
let poseFirst = null;      // { id, y, normal } de la pièce à poser

function setPoseMode(on) {
  poseMode = on;
  poseFirst = null;
  $('pose-mode').classList.toggle('on', on);
  if (on) {
    clearSelection();
    updateAsmHint(
      'Poser : clique la FACE de la pièce qui doit venir au contact '
      + '(dessus ou dessous, pas un chant).',
      'ok',
    );
  } else {
    updateAsmHint();
  }
  invalidate();
}

$('pose-mode').addEventListener('click', () => setPoseMode(!poseMode));

/** Traite un clic quand le mode Poser est actif. */
function onPosePick(event) {
  const hit = asm.pickFirstHit(event, renderer.domElement, camera, bodyTargets());
  if (!hit) {
    updateAsmHint('Rien sous le curseur — vise une pièce.', 'warn');
    return;
  }
  let node = hit.object;
  while (node && !node.userData.partId) node = node.parent;
  const entry = node && entryById(node.userData.partId);
  if (!entry) return;

  // la normale de la facette, en repère monde : c'est elle qui dit si le clic
  // vise le dessus, le dessous ou un chant
  const n = hit.face.normal.clone()
    .applyNormalMatrix(new THREE.Matrix3().getNormalMatrix(hit.object.matrixWorld))
    .normalize();
  if (Math.abs(n.y) < 0.5) {
    updateAsmHint(
      'Cette face est un chant, verticale : elle ne peut pas servir d\'appui. '
      + 'Vise le dessus ou le dessous de la pièce.',
      'warn',
    );
    return;
  }

  if (!poseFirst) {
    poseFirst = { id: entry.mod.meta.id, y: hit.point.y, up: n.y > 0 };
    selectPart(entry.mod.meta.id);
    updateAsmHint(
      `« ${entry.mod.meta.name} » : face ${n.y > 0 ? 'du dessus' : 'du dessous'} `
      + 'retenue. Clique maintenant la face sur laquelle elle doit se poser.',
      'ok',
    );
    return;
  }

  if (entry.mod.meta.id === poseFirst.id) {
    updateAsmHint('Choisis la face d\'une AUTRE pièce pour l\'appui.', 'warn');
    return;
  }

  const moving = entryById(poseFirst.id);
  const dy = hit.point.y - poseFirst.y;
  moving.holder.position.y += dy;
  moving.holder.updateMatrixWorld(true);
  // manual : la pose est un geste de l'utilisateur, elle doit tenir dans les
  // deux vues. Sans ce drapeau, la disposition d'établi ramenait aussitôt la
  // pièce à sa case et le déplacement semblait n'avoir servi à rien.
  storePlacement(moving, {
    refId: entry.mod.meta.id, side: poseFirst.up ? 'below' : 'above', manual: true,
  });
  measureHoles(moving);
  layoutParts();
  renderPartToolbar();
  poseFirst = null;
  updateAsmHint(
    `« ${moving.mod.meta.name} » posée sur « ${entry.mod.meta.name} » `
    + `(${dy >= 0 ? '+' : '−'}${Math.abs(dy).toFixed(2)} mm). `
    + 'Clique une nouvelle face pour poser une autre pièce, ou quitte le mode.',
    'ok',
  );
}

function onPick(event) {
  if (poseMode) { onPosePick(event); return; }

  // une vis du sachet sous le curseur : c'est elle qu'on veut prendre
  const kitHit = asm.pickFirst(event, renderer.domElement, camera, kitTargets());
  if (kitHit && kitHit.parent && kitHit.parent.userData.kitLine) {
    selectScrew(kitHit.parent.userData.kitLine);
    return;
  }
  // une entretoise sous le curseur prime : c'est elle qu'on veut placer, et
  // elle recouvre justement le perçage qui la porte
  const standoff = asm.pickFirst(event, renderer.domElement, camera, standoffTargets());
  if (standoff) {
    let node = standoff;
    while (node && !node.userData.standoffId) node = node.parent;
    if (node) { selectStandoff(node.userData.standoffId); return; }
  }

  // Sur l'établi, les perçages ne sont pas cliquables — on n'y assemble pas —
  // mais la PIÈCE, elle, doit l'être : c'est là qu'on la choisit pour la
  // teinter, la déplacer aux curseurs ou la retirer. Le clic ne faisait rien
  // du tout tant qu'on n'avait pas assemblé.
  if ($('opt-layout').checked) {
    const body = asm.pickFirst(event, renderer.domElement, camera, bodyTargets());
    clearStandoffSelection();
    let node = body;
    while (node && !node.userData.partId) node = node.parent;
    if (node) selectPart(node.userData.partId);
    else clearPartSelection();
    return;
  }

  const hits = asm.pickMarkers(event, renderer.domElement, camera, pickTargets());

  // une vis ou une entretoise sélectionnée détourne le clic sur perçage : il
  // la pose, au lieu d'ouvrir une contrainte d'assemblage
  if (selectedScrew && hits.length) {
    placeScrewOnMarker(hits[0]);
    return;
  }
  if (selectedStandoff && hits.length) {
    placeStandoffOnMarker(hits[0]);
    return;
  }

  if (!hits.length) {
    // pas de perçage sous le curseur : le clic sélectionne la pièce, et solde
    // les surbrillances de la contrainte précédente
    const body = asm.pickFirst(event, renderer.domElement, camera, bodyTargets());
    clearSelection();
    clearStandoffSelection();
    if (body) {
      let node = body;
      while (node && !node.userData.partId) node = node.parent;
      if (node) { selectPart(node.userData.partId); return; }
    }
    clearPartSelection();
    return;
  }

  // premier clic de la paire
  if (!asm.state.pending) {
    const marker = hits[0];
    asm.state.pending = marker;
    asm.highlight(marker, 'pending');
    updateAsmHint();
    invalidate();
    return;
  }

  const reference = asm.state.pending;
  const pendingPart = reference.userData.partId;

  // une fois les plaques empilées, le repère du dessus masque celui du
  // dessous : on préfère donc un repère d'une autre pièce que celle déjà
  // sélectionnée, plutôt que systématiquement le plus proche
  const marker = hits.find((m) => m.userData.partId !== pendingPart) || hits[0];
  const partId = marker.userData.partId;

  if (partId === pendingPart) {
    // toujours la même pièce : l'utilisateur corrige son premier clic
    asm.highlight(reference, 'idle');
    asm.state.pending = marker;
    asm.highlight(marker, 'pending');
    updateAsmHint();
    invalidate();
    return;
  }

  // la pièce en cours de placement peut être cliquée en premier ou en second
  const movingFirst = asm.state.movingId === pendingPart;
  const movMarker = movingFirst ? reference : marker;
  const refMarker = movingFirst ? marker : reference;

  const movEntry = entryById(movMarker.userData.partId);
  const refEntry = entryById(refMarker.userData.partId);
  if (!refEntry || !movEntry) return;

  const refPos = refMarker.getWorldPosition(new THREE.Vector3());
  const movPos = movMarker.getWorldPosition(new THREE.Vector3());

  lastPick = {
    reference: `${refEntry.mod.meta.name}#${refMarker.userData.anchor.index}`,
    moving: `${movEntry.mod.meta.name}#${movMarker.userData.anchor.index}`,
  };

  if (asm.state.movingId !== movEntry.mod.meta.id) {
    // --- 1re paire : superposition des deux trous
    const refThickness = refEntry.mod.meta.dims.thickness;
    // le repère cliqué dit de quel côté monter : viser le cercle du DESSOUS
    // d'un bras, c'est vouloir y visser quelque chose par en dessous (un
    // patin), pas le poser sur le dessus
    const under = refMarker.userData.face === 'bottom';
    // la hauteur saisie à la création prime ; sinon la pièce se pose au contact
    if (movEntry.baseY !== 0) {
      movEntry.holder.position.y = movEntry.baseY;
    } else {
      restOnSurface(
        movEntry,
        refEntry.holder.position.y + (under ? -refThickness / 2 : refThickness / 2),
        under,
      );
    }

    asm.translateInPlane(movEntry.holder, movPos, refPos);
    asm.state.movingId = movEntry.mod.meta.id;
    asm.state.anchor = refPos.clone();
    storePlacement(movEntry, { refId: refEntry.mod.meta.id, side: under ? 'below' : 'above' });

    asm.highlight(refMarker, 'anchored');
    asm.highlight(movMarker, 'anchored');
    asm.state.pending = null;
    updateAsmHint(
      `Trous superposés, « ${movEntry.mod.meta.name} » ${under ? 'SOUS' : 'sur'} `
      + `« ${refEntry.mod.meta.name} ». Clique un 2e trou de référence puis son `
      + "équivalent pour l'orienter.",
      'ok',
    );
  } else {
    // --- 2e paire : rotation autour du trou déjà ancré
    asm.rotateAround(movEntry.holder, asm.state.anchor, movPos, refPos);
    storePlacement(movEntry);

    const after = movMarker.getWorldPosition(new THREE.Vector3());
    const residual = asm.planarDistance(after, refPos);
    asm.highlight(refMarker, 'idle');
    asm.highlight(movMarker, 'idle');
    asm.state.pending = null;
    updateAsmHint(
      residual < 0.5
        ? `Pièce orientée : les deux paires coïncident à ${residual.toFixed(2)} mm.`
        : `Pièce orientée. Écart résiduel sur la 2e paire : ${residual.toFixed(2)} mm `
          + '— les deux entraxes ne sont pas identiques.',
      residual < 0.5 ? 'ok' : 'warn',
    );
  }
  invalidate();
}

renderer.domElement.addEventListener('pointerdown', (e) => {
  if (e.button === 0) e.currentTarget.__downAt = { x: e.clientX, y: e.clientY };
});
renderer.domElement.addEventListener('pointerup', (e) => {
  const down = e.currentTarget.__downAt;
  e.currentTarget.__downAt = null;
  // un cliquer-glisser sert à orbiter, pas à sélectionner
  if (e.button !== 0 || !down) return;
  if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > 4) return;
  onPick(e);
});

/* ------------------------------------------------------------------ *
 * Cadrage
 * ------------------------------------------------------------------ */

const ISO_DIR = new THREE.Vector3(0.85, 0.7, 1).normalize();

/** Sphère englobant le build : le cadrage suit le nombre de pièces. */
function buildSphere() {
  // Sur le corps des pièces, pas sur buildRoot : les repères d'accrochage
  // (anneaux et disques de visée) débordent largement d'un petit perçage et
  // gonflaient le cadrage — jusqu'à 9 mm autour de chaque trou, de quoi faire
  // paraître une pièce bien plus grosse qu'elle n'est.
  const box = new THREE.Box3();
  entries.forEach((e) => {
    const body = e.object && e.object.getObjectByName('body');
    if (body && e.object.visible !== false) box.expandByObject(body);
  });
  const sphere = new THREE.Sphere();
  if (box.isEmpty()) { sphere.set(new THREE.Vector3(), 60); return sphere; }
  box.getBoundingSphere(sphere);
  sphere.radius = Math.max(sphere.radius, 20);
  return sphere;
}

/** Distance à laquelle la sphère tient entièrement dans le cadre. */
function fitDistance(radius) {
  const vFov = (camera.fov * Math.PI) / 180;
  const hFov = 2 * Math.atan(Math.tan(vFov / 2) * camera.aspect);
  return (radius / Math.sin(Math.min(vFov, hFov) / 2)) * 1.08;
}

/* ------------------------------------------------------------------ *
 * Recadrage en douceur
 * ------------------------------------------------------------------ */

/** Déplacement de caméra en cours, ou null. */
let camMotion = null;

/**
 * Amène la caméra sur un cadrage, en glissant.
 *
 * Le recadrage sec convient à un changement de vue demandé ; il est brutal à
 * la fin d'un assemblage, où la caméra saute d'un coup alors que les pièces
 * viennent de se poser tranquillement. Le vol dure ici le temps du mouvement
 * des pièces, avec la même courbe : les deux se terminent ensemble.
 *
 * @param {THREE.Sphere} sphere ce qu'il faut cadrer, à l'arrivée
 * @param {number} duration en ms
 */
function flyToFrame(sphere, duration) {
  const dir = camera.position.clone().sub(controls.target).normalize();
  if (!Number.isFinite(dir.x) || dir.lengthSq() < 1e-6) dir.copy(ISO_DIR);
  const to = {
    target: sphere.center.clone(),
    position: sphere.center.clone().addScaledVector(dir, fitDistance(sphere.radius)),
  };
  // les plans de coupe sont pris sur le cadrage d'arrivée : les interpoler
  // n'apporte rien et ferait clignoter les pièces les plus proches
  camera.near = Math.max(0.1, sphere.radius / 100);
  camera.far = sphere.radius * 20;
  camera.updateProjectionMatrix();
  camMotion = {
    from: { target: controls.target.clone(), position: camera.position.clone() },
    to,
    start: performance.now(),
    duration,
  };
  invalidate();
}

/** Avance le vol de caméra d'une image. Renvoie vrai s'il reste du chemin. */
function stepCamera(now) {
  if (!camMotion) return false;
  const t = Math.min(1, (now - camMotion.start) / camMotion.duration);
  const k = easeInOut(t);
  controls.target.lerpVectors(camMotion.from.target, camMotion.to.target, k);
  camera.position.lerpVectors(camMotion.from.position, camMotion.to.position, k);
  controls.update();
  if (t >= 1) camMotion = null;
  return camMotion !== null;
}

/** Recadre, en conservant la direction de vue courante si aucune n'est donnée. */
function frameAll(direction) {
  const sphere = buildSphere();
  const dir = direction
    ? direction.clone().normalize()
    : camera.position.clone().sub(controls.target).normalize();
  if (!Number.isFinite(dir.x) || dir.lengthSq() < 1e-6) dir.copy(ISO_DIR);

  controls.target.copy(sphere.center);
  camera.position.copy(sphere.center).addScaledVector(dir, fitDistance(sphere.radius));
  camera.near = Math.max(0.1, sphere.radius / 100);
  camera.far = sphere.radius * 20;
  camera.updateProjectionMatrix();
  controls.update();
  invalidate();
}

entries = collectParts();
entries.forEach((e) => mountPart(e, null));
applyColors();
// la session s'ouvre sur l'établi rangé : le build se monte par le bouton
forceBench = true;

/* ------------------------------------------------------------------ *
 * Calque photo en 3D
 * ------------------------------------------------------------------ */

let photoPlane = null;

function rebuildPhotoPlane() {
  if (photoPlane) {
    scene.remove(photoPlane);
    disposeObject(photoPlane);
    photoPlane = null;
  }
  const t = cal.state.traceMm;
  if (!cal.state.image || !t || !$('opt-photo').checked) return;

  const img = cal.state.image;
  const iw = img.naturalWidth, ih = img.naturalHeight;
  const w = iw * t.mmPerPx, h = ih * t.mmPerPx;

  const tex = new THREE.Texture(img);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;

  photoPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(w, h),
    new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      opacity: Number($('photo-op').value) / 100,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
  // centre de l'image, exprimé dans le repère du modèle
  photoPlane.position.set(
    (iw / 2 - t.axis) * t.mmPerPx,
    0,
    -(t.center - ih / 2) * t.mmPerPx,
  );
  photoPlane.rotation.x = -Math.PI / 2;
  photoPlane.position.y = PARTS[0].THICKNESS_MM / 2 + 0.4;
  scene.add(photoPlane);
  invalidate();
}

function updatePhotoOpacity() {
  const v = Number($('photo-op').value);
  $('photo-val').textContent = `${v} %`;
  if (photoPlane) photoPlane.material.opacity = v / 100;
  invalidate();
  if (!$('pane-bp').classList.contains('hidden')) renderBlueprint();
}

$('photo-op').addEventListener('input', updatePhotoOpacity);
$('opt-photo').addEventListener('change', () => {
  rebuildPhotoPlane();
  applyDisplayOptions();
});

/* ------------------------------------------------------------------ *
 * Interface latérale
 * ------------------------------------------------------------------ */

/** Fiches dépliées : l'état survit à un réaffichage de la liste. */
const openCards = new Set();

function renderPartList() {
  const partList = $('part-list');
  partList.innerHTML = '';

  // un fichier d'assets manquant doit se voir : sans ça la pièce disparaît
  // simplement de la liste, ce qui ressemble à une perte de données
  if (missingAssets.length) {
    const li = document.createElement('li');
    li.className = 'part missing';
    li.innerHTML = `<p class="origin warn">Fichier manquant dans assets/parts-3d/ :
      ${missingAssets.join(', ')} — pièce(s) non affichée(s). Le reste du build
      et les pièces créées depuis l'outil sont intacts.</p>`;
    partList.appendChild(li);
  }

  for (const e of entries) {
    const m = e.mod.meta;
    const t = cal.state.traceMm;
    // une calibration appliquée ne se substitue qu'aux cotes de la pièce 01
    const overridden = !e.mod.isCustom && cal.state.applied && !!t;
    // origine du contour : photo (tracé figé, pièce créée, ou calibration)
    const fromPhoto = m.traced || e.mod.isCustom || overridden;
    const dims = overridden
      ? { length: t.height, width: t.width, thickness: m.dims.thickness, holes: t.holes.length, mmPerPx: t.mmPerPx }
      : m.dims;
    // une pièce importée (fichier CAO externe) n'a ni contour de photo ni
    // motif de perçage à afficher : la fiche prend une forme plus courte
    const origin = m.isMesh
      ? (m.source || 'maillage importé')
      : fromPhoto ? 'contour tracé sur la photo' : 'contour saisi à la main — à calibrer';
    const unconfirmed = e.mod.isCustom && e.mod.spec
      && e.mod.spec.scaleSource !== 'patterns' && e.mod.spec.scaleSource !== 'manual';

    const li = document.createElement('li');
    // Fiche repliée par défaut : dix-huit pièces déployées font quatre écrans
    // de haut, et on passait son temps à faire défiler pour trouver un nom.
    // Le chevron ouvre la fiche complète, le reste de la ligne sélectionne.
    li.className = `part${openCards.has(m.id) ? '' : ' compact'}`;
    li.dataset.id = m.id;
    li.innerHTML = `
      <label class="part-head">
        <input type="checkbox" ${hiddenParts.has(m.id) ? '' : 'checked'}>
        <span class="idx">${String(m.index).padStart(2, '0')}</span>
        <span class="nm">${m.name}</span>
        <button class="card-fold" title="Déplier / replier la fiche">▾</button>
      </label>
        <button class="del" title="${e.mod.isCustom
    ? 'Supprimer définitivement cette pièce créée'
    : 'Retirer cette pièce du build (réversible : recoche la case)'}">✕</button>
      <p class="origin ${m.isMesh || fromPhoto ? 'ok' : ''}">${origin}</p>
      ${unconfirmed ? '<p class="origin warn">échelle non confirmée — vérifie la longueur</p>' : ''}
      <dl class="specs">
        <div><dt>Longueur</dt><dd>${dims.length.toFixed(1)} mm</dd></div>
        <div><dt>Largeur</dt><dd>${dims.width.toFixed(1)} mm</dd></div>
        <div><dt>${m.isMesh ? 'Hauteur' : 'Épaisseur'}</dt><dd>${dims.thickness.toFixed(1)} mm</dd></div>
        ${m.isMesh ? '' : `<div><dt>Perçages</dt><dd>${dims.holes}</dd></div>`}
        <div><dt>Matière</dt><dd>${m.material}</dd></div>
        ${m.isMesh ? '' : `<div><dt>Échelle</dt><dd>1 px = ${dims.mmPerPx.toFixed(4)} mm</dd></div>`}
      </dl>
      <div class="download-row">
        <span class="download-label">Télécharger</span>
        <button class="dl dl-stl" title="Géométrie 3D en millimètres, pièce à plat — CAO, impression">⬇ STL</button>
        ${m.isMesh ? '' : '<button class="dl dl-js" title="Module autonome à déposer dans js/parts/ du dépôt">⬇ .js pour le dépôt</button>'}
      </div>
      ${e.mod.isCustom ? `
      <div class="part-tools">
        <select class="role" title="Rôle dans le châssis">
          <option value="">rôle…</option>
          ${FRAME.roles.filter((r) => r.thickness).map((r) =>
    `<option value="${r.id}"${Math.abs(r.thickness - dims.thickness) < 0.01 ? ' selected' : ''}>`
            + `${r.name} — ${r.thickness.toFixed(1)} mm</option>`).join('')}
        </select>
        <button class="recal" title="Recaler l'échelle sur les perçages normalisés">Recalibrer</button>
        <button class="mirror-dup" title="Crée une nouvelle pièce, symétrique de celle-ci — les deux restent visibles en même temps (utile pour un bras dont un seul côté a été tracé)">⇋ Dupliquer en miroir</button>
      </div>` : ''}`;
    li.querySelector('.card-fold').addEventListener('click', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      const compact = li.classList.toggle('compact');
      if (compact) openCards.delete(m.id); else openCards.add(m.id);
    });
    li.querySelector('input').addEventListener('change', (ev) => {
      if (ev.target.checked) hiddenParts.delete(m.id);
      else hiddenParts.add(m.id);
      saveHidden();
      applyHidden();
      pushHistory();
    });

    li.addEventListener('click', (ev) => {
      // les commandes de la fiche gardent leur propre effet
      if (ev.target.closest('button, input, select, label')) return;
      selectPart(m.id);
    });
    li.querySelector('.dl-stl').addEventListener('click', () => exportSTL(e));
    li.querySelector('.dl-js')?.addEventListener('click', () => exportModule(e));

    const role = li.querySelector('.role');
    if (role) role.addEventListener('change', () => {
      const thickness = thicknessForRole(role.value);
      if (!thickness) return;
      custom.setThickness(m.id, thickness);
      remountAll();
    });

    const recal = li.querySelector('.recal');
    if (recal) recal.addEventListener('click', () => rescalePart(m.id, m.name));

    const mirrorDup = li.querySelector('.mirror-dup');
    if (mirrorDup) mirrorDup.addEventListener('click', () => {
      const created = custom.duplicateMirrored(m.id);
      if (!created) { updateAsmHint(`« ${m.name} » introuvable.`, 'warn'); return; }
      remountAll();
      updateAsmHint(`« ${created.name} » créée — symétrique de « ${m.name} », les deux sont posées.`, 'ok');
    });

    const del = li.querySelector('.del');
    if (del) del.addEventListener('click', () => {
      // Une pièce créée depuis l'outil n'existe que dans le navigateur : la
      // supprimer est définitif. Une pièce du dépôt, elle, revient au
      // rechargement — on la retire du build plutôt que de faire semblant de
      // la supprimer, et la case à cocher la ramène.
      if (e.mod.isCustom) {
        if (!confirm(`Supprimer définitivement « ${m.name} » ?`)) return;
        custom.removeSpec(m.id);
        hiddenParts.delete(m.id);
        saveHidden();
        remountAll();
        pushHistory();
        updateAsmHint(`« ${m.name} » supprimée.`, 'ok');
        return;
      }
      hiddenParts.add(m.id);
      saveHidden();
      applyHidden();
      renderPartList();
      if (selectedId === m.id) clearPartSelection();
      pushHistory();
      updateAsmHint(
        `« ${m.name} » retirée du build. Recoche sa case pour la remettre.`, 'ok',
      );
    });
    partList.appendChild(li);
  }
}
renderPartList();

const plannedList = $('planned-list');
for (const p of PLANNED) {
  const li = document.createElement('li');
  li.className = 'planned';
  li.innerHTML = `<span class="idx">${String(p.index).padStart(2, '0')}</span><span>${p.name}</span><em>en attente</em>`;
  plannedList.appendChild(li);
}

// Vues prédéfinies : on choisit une direction, la distance cadre tout le build
const VIEWS = {
  iso: ISO_DIR,
  top: new THREE.Vector3(0, 1, 0.0001),
  front: new THREE.Vector3(0, 0.08, 1),
  side: new THREE.Vector3(1, 0.08, 0),
};
/** Cadre la vue et met à jour le bouton actif — utilisé par les boutons ET le cube de navigation. */
function setView(dir, viewKey) {
  frameAll(dir);
  document.querySelectorAll('[data-view]').forEach((b) => b.classList.toggle('on', b.dataset.view === viewKey));
}
document.querySelectorAll('[data-view]').forEach((btn) => {
  btn.addEventListener('click', () => setView(VIEWS[btn.dataset.view], btn.dataset.view));
});

/** Arêtes, mode fil, transparence de la plaque sous le calque photo. */
function applyDisplayOptions() {
  const fil = $('opt-wire').checked;
  // en mode fil les arêtes restent allumées quoi qu'il arrive : sans elles on
  // ne voit plus que le maillage, et le contour de la pièce se perd dedans
  const showEdges = $('opt-edges').checked || fil;
  const ghost = $('opt-photo').checked && !!photoPlane;
  buildRoot.traverse((o) => {
    if (o.name === 'edges') o.visible = showEdges;
    if (o.name === 'body' && o.material) {
      o.material.wireframe = fil;
      o.material.transparent = ghost;
      o.material.opacity = ghost ? 0.55 : 1;
      o.material.needsUpdate = true;
    }
  });
  invalidate();
}

// une main sur la souris reprend la caméra : un vol qui continue par-dessus
// le geste de l'utilisateur donne l'impression que la vue se bat contre lui
controls.addEventListener('start', () => { camMotion = null; });

$('opt-edges').addEventListener('change', applyDisplayOptions);
$('opt-wire').addEventListener('change', applyDisplayOptions);
$('opt-isolate').addEventListener('change', () => applyIsolation(selectedId));

/* --- repères de perçage : visibles ou non, d'une session à l'autre --- */
const MARKERS_KEY = 'tinyhoop-mk1:markers';
if (localStorage.getItem(MARKERS_KEY) === '0') $('opt-markers').checked = false;
$('opt-markers').addEventListener('change', () => {
  try {
    localStorage.setItem(MARKERS_KEY, $('opt-markers').checked ? '1' : '0');
  } catch { /* ignore */ }
  setMarkersVisible(!$('opt-layout').checked);
  invalidate();
});

$('opt-grid').addEventListener('change', () => {
  grid.visible = $('opt-grid').checked;
  invalidate();
});

const explode = $('explode');
explode.addEventListener('input', () => {
  $('explode-val').textContent = `${explode.value} mm`;
  layoutParts();
});

$('opt-layout').addEventListener('change', () => {
  layoutParts();
  frameAll();
});

/* ------------------------------------------------------------------ *
 * Export d'une pièce
 * ------------------------------------------------------------------ */

/** Géométrie de la plaque, dans son propre repère (à plat, épaisseur en Z). */
function bodyGeometry(entry) {
  const body = entry.object && entry.object.getObjectByName('body');
  return body ? body.geometry : null;
}

function exportSTL(entry) {
  const geometry = bodyGeometry(entry);
  if (!geometry) { say('Géométrie introuvable pour cette pièce.', 'err'); return; }

  const name = exporter.slug(entry.mod.meta.name);
  const check = exporter.meshDiagnostics(geometry);
  exporter.download(`${name}.stl`, exporter.geometryToSTL(geometry));

  updateAsmHint(
    `${name}.stl exporté — ${check.triangles} facettes, ${(check.volume / 1000).toFixed(2)} cm³, `
    + 'en millimètres, pièce à plat. '
    + (check.watertight
      ? 'Maillage vérifié : fermé et orienté, prêt à trancher.'
        + (check.nonManifoldEdges
          ? ` (${check.nonManifoldEdges} arêtes portées par plus de 2 faces : `
            + 'deux volumes qui se rejoignent, sans conséquence au tranchage.)'
          : '')
      : `MAILLAGE DÉFECTUEUX : ${check.boundaryEdges} arêtes libres, `
        + `${check.flippedEdges} arêtes mal orientées. Un trancheur risque de `
        + 'boucher les perçages — signale-le moi plutôt que d\'imprimer.'),
    check.watertight ? 'ok' : 'warn',
  );
}

function exportModule(entry) {
  const trace = entry.mod.trace;
  if (!trace) { say("Cette pièce n'a pas de tracé exportable.", 'err'); return; }

  const meta = entry.mod.meta;
  const name = exporter.slug(meta.name);
  exporter.download(
    `${name}.js`,
    exporter.partModuleSource(trace, {
      name: meta.name,
      thickness: meta.dims.thickness,
      stackHeight: meta.stackHeight,
      index: meta.index,
    }),
    'text/javascript',
  );
  updateAsmHint(
    `${name}.js exporté — dépose-le dans js/parts/ et ajoute-le à PARTS `
    + 'dans js/parts/index.js.',
    'ok',
  );
}

/**
 * Recale une pièce sur ses propres motifs de perçage. Les pièces créées avant
 * l'arrivée de ce calage gardent une échelle estimée, donc des perçages qui ne
 * tombent pas en face de ceux des autres pièces.
 */
function rescalePart(id, name) {
  const result = custom.rescaleToPatterns(id);

  if (result.status === 'already') {
    updateAsmHint(
      `« ${name} » est déjà à l'échelle de ses motifs `
      + `(${result.length.toFixed(1)} mm, ${result.patterns}).`,
      'ok',
    );
    return;
  }
  if (result.status !== 'rescaled') {
    updateAsmHint(
      `« ${name} » : les motifs de perçage ne se confirment pas entre eux, `
      + "l'échelle n'est pas modifiée. Trace la pièce depuis sa photo pour trancher.",
      'warn',
    );
    return;
  }

  // le placement d'assemblage avait été calculé à l'ancienne échelle
  delete placements[id];
  savePlacements();
  remountAll();
  updateAsmHint(
    `« ${name} » recalée : ${result.current.toFixed(1)} -> `
    + `${result.length.toFixed(1)} mm (motifs ${result.patterns}).`,
    'ok',
  );
}

$('asm-rescale-all').addEventListener('click', () => {
  const custom_ = entries.filter((e) => e.mod.isCustom);
  if (!custom_.length) {
    updateAsmHint('Aucune pièce créée depuis l\'outil à recaler.', 'warn');
    return;
  }
  const done = [];
  const already = [];
  const inconclusive = [];
  for (const e of custom_) {
    const result = custom.rescaleToPatterns(e.mod.meta.id);
    if (result.status === 'rescaled') {
      delete placements[e.mod.meta.id];
      done.push(`${e.mod.meta.name} ${result.current.toFixed(1)} -> ${result.length.toFixed(1)} mm`);
    } else if (result.status === 'already') {
      already.push(e.mod.meta.name);
    } else {
      inconclusive.push(e.mod.meta.name);
    }
  }
  savePlacements();
  remountAll();

  const parts = [];
  if (done.length) parts.push(`Recalées : ${done.join(' · ')}.`);
  if (already.length) parts.push(`Déjà à l'échelle : ${already.join(', ')}.`);
  if (inconclusive.length) parts.push(`Motifs non concluants : ${inconclusive.join(', ')}.`);
  updateAsmHint(parts.join(' '), inconclusive.length && !done.length ? 'warn' : 'ok');
});

$('asm-reset').addEventListener('click', () => {
  placements = {};
  asm.clearPlacements();
  clearSelection();
  layoutParts();
  frameAll();
  updateAsmHint('Assemblage réinitialisé.', 'ok');
});

/* ------------------------------------------------------------------ *
 * Plan de travail : sauvegarde / rechargement de toute la disposition
 * ------------------------------------------------------------------ */

const WORKSPACE_FILE_VERSION = 1;

$('wp-export').addEventListener('click', () => {
  const data = {
    tool: 'tinyhoop-mk1-workspace',
    version: WORKSPACE_FILE_VERSION,
    savedAt: new Date().toISOString(),
    placements,
    standoffs,
    hidden: [...hiddenParts],
    // les couleurs voyagent avec le plan : c'est ce qui permet à l'export
    // CAO de teinter les corps comme ils le sont à l'écran
    colors: partColors,
    customParts: custom.loadSpecs(),
  };
  exporter.download(
    `tinyhoop-mk1-plan-${new Date().toISOString().slice(0, 10)}.json`,
    JSON.stringify(data, null, 2),
    'application/json',
  );
  updateAsmHint('Plan de travail exporté.', 'ok');
});

$('wp-import-btn').addEventListener('click', () => $('wp-file').click());
$('wp-file').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = ''; // même fichier rechoisi deux fois de suite -> déclenche quand même 'change'
  if (!file) return;

  let data;
  try {
    data = JSON.parse(await file.text());
  } catch {
    updateAsmHint(`« ${file.name} » n'est pas un plan de travail lisible (JSON invalide).`, 'warn');
    return;
  }
  if (!data || data.tool !== 'tinyhoop-mk1-workspace') {
    updateAsmHint(`« ${file.name} » ne ressemble pas à un plan de travail exporté par cet outil.`, 'warn');
    return;
  }

  // Un plan chargé se présente RANGÉ, pas à moitié monté. Les placements
  // marqués « à la main » s'appliquent d'ordinaire aussi en vue côte à côte :
  // sans ça, on voyait la moitié du build en l'air et l'autre sur le plan.
  // Le plan est en mémoire ; « Assembler le build » le monte d'un geste.
  $('opt-layout').checked = true;
  forceBench = true;

  custom.importSpecs(data.customParts || []);
  placements = data.placements && typeof data.placements === 'object' ? data.placements : {};
  standoffs = Array.isArray(data.standoffs) ? data.standoffs : [];
  hiddenParts = new Set(Array.isArray(data.hidden) ? data.hidden : []);
  partColors = data.colors && typeof data.colors === 'object' ? data.colors : {};
  asm.savePlacements(placements);
  so.save(standoffs);
  saveHidden();
  saveColors();

  clearSelection();
  clearStandoffSelection();
  remountAll();
  renderStandoffs();
  renderStandoffList();
  // le plan chargé devient un point de retour à part entière
  pushHistory();
  updateAsmHint(
    `Plan de travail « ${file.name} » chargé : ${entries.length} pièce(s), `
    + `${standoffs.length} entretoise(s). Les pièces sont rangées sur le plan — `
    + '« ▶ Assembler le build » les monte.',
    'ok',
  );
});

/* ------------------------------------------------------------------ *
 * Onglets
 * ------------------------------------------------------------------ */

const panes = { '3d': $('pane-3d'), bp: $('pane-bp'), cal: $('pane-cal') };
document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => {
  document.querySelectorAll('.tab').forEach((x) => x.classList.remove('on'));
  t.classList.add('on');
  Object.entries(panes).forEach(([k, el]) => el.classList.toggle('hidden', k !== t.dataset.tab));
  if (t.dataset.tab === 'bp') renderBlueprint();
  else if (t.dataset.tab === 'cal') renderCalibration();
  else resize();
}));

/* ------------------------------------------------------------------ *
 * Plan coté
 * ------------------------------------------------------------------ */

const bpCanvas = $('bp-canvas');

/** Données du plan : issues du tracé courant si appliqué, sinon de la pièce. */
function blueprintData() {
  const t = cal.state.traceMm;
  return cal.state.applied && t ? blueprintFromTrace(t) : PARTS[0].blueprint();
}

function renderBlueprint() {
  const t = cal.state.traceMm;
  drawBlueprint(bpCanvas, blueprintData(), {
    showGrid: $('bp-grid').checked,
    showDims: true,
    photo: $('bp-photo').checked && t && cal.state.image
      ? { image: cal.state.image, axis: t.axis, center: t.center, mmPerPx: t.mmPerPx }
      : null,
    photoAlpha: Number($('photo-op').value) / 100,
  });
}
$('bp-grid').addEventListener('change', renderBlueprint);
$('bp-photo').addEventListener('change', renderBlueprint);

/* ------------------------------------------------------------------ *
 * Calibration
 * ------------------------------------------------------------------ */

const calCanvas = $('cal-canvas');
const dropzone = $('dropzone');
const status = $('cal-status');

function say(msg, kind = '') {
  status.textContent = msg;
  status.className = `status ${kind}`;
}

function traceOptions() {
  return {
    threshold: Number($('c-thr').value),
    epsilon: Number($('c-eps').value),
    toleranceMm: Number($('c-smo').value),
    refLengthMm: Number($('c-len').value),
    minHoleArea: Number($('c-min').value),
    circleMaxRadius: Number($('c-circ').value),
    symmetric: $('c-sym').checked,
  };
}

function renderCalibration() {
  dropzone.classList.toggle('hidden', !!cal.state.image);
  cal.drawCalibration(calCanvas, {
    showMask: $('c-mask').checked,
    threshold: Number($('c-thr').value),
    showTrace: true,
    photoAlpha: 1,
  });
}

['c-eps', 'c-smo', 'c-min', 'c-thr', 'c-circ'].forEach((id) => {
  $(id).addEventListener('input', () => {
    $('v-thr').value = $('c-thr').value;
    $('v-eps').value = `${Number($('c-eps').value).toFixed(1)} px`;
    $('v-smo').value = `${Number($('c-smo').value).toFixed(2)} mm`;
    $('v-min').value = `${$('c-min').value} px²`;
    $('v-circ').value = `${$('c-circ').value} px`;
    renderCalibration();
  });
});
$('c-mask').addEventListener('change', renderCalibration);

// le rôle d'une pièce donne son épaisseur : elle vient de la fiche technique
// du châssis, il n'y a pas à la saisir deux fois
for (const role of FRAME.roles) {
  const option = document.createElement('option');
  option.value = role.id;
  option.textContent = role.thickness
    ? `${role.name} — ${role.thickness.toFixed(1)} mm`
    : role.name;
  if (role.id === 'mid') option.selected = true;
  $('c-role').appendChild(option);
}
$('c-len').addEventListener('input', () => { cal.state.scaleSource = 'manual'; });

$('c-role').addEventListener('change', () => {
  const thickness = thicknessForRole($('c-role').value);
  if (thickness) $('c-thick').value = thickness;
});

// rappel de la fiche technique, seule source de cotes absolues du projet
$('frame-spec').innerHTML = `
  <div><dt>Modèle</dt><dd>${FRAME.model}</dd></div>
  <div><dt>Configuration</dt><dd>${FRAME.configuration}</dd></div>
  <div><dt>Empattement</dt><dd>${FRAME.wheelbaseMm} mm</dd></div>
  ${FRAME.roles.filter((r) => r.thickness).map((r) =>
    `<div><dt>${r.name}</dt><dd>${r.thickness.toFixed(1)} mm</dd></div>`).join('')}`;

async function onImage(promise) {
  try {
    await promise;
    $('c-thr').value = cal.autoThreshold();
    $('v-thr').value = $('c-thr').value;
    dropzone.classList.add('hidden');
    say('Photo chargée. Lance le tracé.', 'ok');
    runTrace();
  } catch (e) {
    say(e.message, 'err');
  }
}

/** Propositions d'échelle déduites des motifs de perçage normalisés. */
function renderScaleProposals() {
  const block = $('scale-block');
  const list = $('scale-list');
  const proposals = cal.state.scaleProposals || [];
  list.innerHTML = '';
  block.classList.toggle('hidden', proposals.length === 0);

  proposals.slice(0, 4).forEach((group) => {
    const li = document.createElement('li');
    li.className = 'scale-choice';
    li.innerHTML = `<button type="button">${describeScale(group)}</button>`;
    if (usesPreferredPattern(group)) li.classList.add('preferred');
    li.querySelector('button').addEventListener('click', () => {
      $('c-len').value = group.length.toFixed(2);
      cal.state.scaleSource = 'patterns';
      // les pièces d'un même châssis partagent leurs standards
      rememberPattern(group.matches[0].pattern.side);
      runTrace(false);
      say(`Échelle calée sur les motifs normalisés : ${group.length.toFixed(1)} mm hors-tout.`, 'ok');
    });
    list.appendChild(li);
  });
}

/**
 * Une proposition n'est retenue d'office que si des carrés de tailles
 * différentes désignent la même échelle : un carré isolé peut correspondre à
 * plusieurs standards, deux qui concordent ne sont plus une supposition.
 */
function isTrustworthy(group) {
  return group && group.distinctSquares >= 2 && group.spread < group.length * 0.02;
}

function runTrace(allowAutoScale = true) {
  try {
    const t = cal.run(traceOptions(), Number($('c-len').value));

    // recalage automatique sur les motifs normalisés : sans lui, chaque pièce
    // garde l'échelle devinée à la saisie et les perçages ne tombent pas en face
    const best = (cal.state.scaleProposals || [])[0];
    const reference = Math.max(t.width, t.height);
    if (allowAutoScale && isTrustworthy(best)
        && Math.abs(best.length - reference) > reference * 0.01) {
      $('c-len').value = best.length.toFixed(2);
      cal.state.scaleSource = 'patterns';
      runTrace(false);
      say(
        `Échelle calée sur les perçages : ${best.length.toFixed(1)} mm hors-tout `
        + `(motifs ${[...new Set(best.matches.map((m) => m.pattern.name))].join(' + ')}).`,
        'ok',
      );
      return;
    }

    if (isTrustworthy(best)) cal.state.scaleSource = 'patterns';

    // Sans échelle confirmée, la longueur affichée est celle laissée par la
    // pièce précédente. Le dire franchement : deux bras de longueurs
    // différentes finiraient sinon identiques, sans le moindre signe.
    const confirmed = cal.state.scaleSource === 'patterns'
      || cal.state.scaleSource === 'manual';
    $('c-len').classList.toggle('unconfirmed', !confirmed);

    say(
      `Tracé : ${cal.state.trace.outline.length} points de contour, `
      + `${t.holes.length} perçages · ${t.width.toFixed(1)} x ${t.height.toFixed(1)} mm.`
      + (confirmed ? '' :
        ' ÉCHELLE NON CONFIRMÉE : la longueur affichée vient de la pièce'
        + ' précédente. Choisis un motif ci-dessus, ou saisis la longueur'
        + ' réelle de cette pièce.'),
      confirmed ? 'ok' : 'warn',
    );
    renderCalibration();
    renderScaleProposals();
    $('photo-hint').textContent =
      "Coche « Photo en transparence » pour superposer la photo au modèle 3D.";
  } catch (e) {
    say(e.message, 'err');
  }
}

$('c-run').addEventListener('click', runTrace);

$('c-apply').addEventListener('click', () => {
  if (!cal.state.traceMm) { say("Lance d'abord le tracé.", 'err'); return; }
  try {
    cal.state.applied = true;
    entries.forEach((e) => mountPart(e, e.mod.isCustom ? null : cal.state.traceMm));
    applyColors();
    rebuildPhotoPlane();
    renderPartList();
    if (!$('pane-bp').classList.contains('hidden')) renderBlueprint();
    say('Modèle 3D reconstruit à partir du tracé photo.', 'ok');
  } catch (e) {
    cal.state.applied = false;
    say(`Reconstruction impossible : ${e.message}`, 'err');
  }
});

$('c-create').addEventListener('click', () => {
  if (!cal.state.traceMm) { say("Lance d'abord le tracé.", 'err'); return; }
  try {
    const spec = custom.addSpec({
      name: $('c-name').value.trim(),
      thickness: Number($('c-thick').value),
      stackHeight: Number($('c-stack').value),
      traceMm: cal.state.traceMm,
      scaleSource: cal.state.scaleSource,
    });
    remountAll();
    say(
      `Pièce « ${spec.name} » créée et ajoutée au build.` +
      (spec.persisted ? '' : ' (trop volumineuse pour être mémorisée : elle disparaîtra au rechargement)'),
      'ok',
    );
  } catch (e) {
    say(`Création impossible : ${e.message}`, 'err');
  }
});

$('c-export').addEventListener('click', () => {
  try {
    cal.download(
      'contour-piece-01.js',
      cal.exportModule(Number($('c-len').value), Number($('c-thick').value)),
    );
    say('Contour exporté : dépose le fichier dans js/parts/ pour le figer.', 'ok');
  } catch (e) {
    say(e.message, 'err');
  }
});

$('c-clear').addEventListener('click', () => {
  cal.forget();
  $('opt-photo').checked = false;
  rebuildPhotoPlane();
  remountAll();
  renderCalibration();
  say('Photo oubliée. Les pièces déjà créées sont conservées.');
});

// chargement : fichier, glisser-déposer, presse-papier
$('c-file').addEventListener('change', (e) => {
  if (e.target.files[0]) onImage(cal.loadFromFile(e.target.files[0]));
});
['dragenter', 'dragover'].forEach((ev) =>
  $('pane-cal').addEventListener(ev, (e) => { e.preventDefault(); dropzone.classList.add('hot'); }));
['dragleave', 'drop'].forEach((ev) =>
  $('pane-cal').addEventListener(ev, () => dropzone.classList.remove('hot')));
$('pane-cal').addEventListener('drop', (e) => {
  e.preventDefault();
  const f = [...e.dataTransfer.files].find((x) => x.type.startsWith('image/'));
  if (f) onImage(cal.loadFromFile(f));
});
window.addEventListener('paste', (e) => {
  const item = [...(e.clipboardData?.items || [])].find((i) => i.type.startsWith('image/'));
  if (item) onImage(cal.loadFromFile(item.getAsFile()));
});

// photo mémorisée d'une session à l'autre
cal.restoreSaved().then((data) => {
  if (!data) return;
  $('c-thr').value = cal.autoThreshold();
  $('v-thr').value = $('c-thr').value;
  runTrace();
});

/* ------------------------------------------------------------------ *
 * Boucle
 * ------------------------------------------------------------------ */

function resize() {
  const w = viewport.clientWidth, h = viewport.clientHeight;
  if (!w || !h) return;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  invalidate();
}
/* ------------------------------------------------------------------ *
 * Panneau rétractable
 * ------------------------------------------------------------------ */

const SIDE_KEY = 'tinyhoop-mk1:sidebar-collapsed';

function applySidebar(collapsed) {
  $('layout').classList.toggle('side-collapsed', collapsed);
  $('side-toggle').classList.toggle('on', collapsed);
  $('side-toggle').textContent = collapsed ? '⇥ Panneau' : '⇤ Panneau';
  // La largeur du canvas change : sans redimensionnement le rendu resterait
  // étiré. La transition CSS dure 180 ms, d'où le recalage à la fin — et un
  // premier tout de suite pour que ça ne saute pas à l'arrivée.
  resize();
  setTimeout(() => {
    resize();
    if (!$('pane-bp').classList.contains('hidden')) renderBlueprint();
    if (!$('pane-cal').classList.contains('hidden')) renderCalibration();
  }, 200);
}

let sidebarCollapsed = localStorage.getItem(SIDE_KEY) === '1';
applySidebar(sidebarCollapsed);

function toggleSidebar() {
  sidebarCollapsed = !sidebarCollapsed;
  try { localStorage.setItem(SIDE_KEY, sidebarCollapsed ? '1' : '0'); } catch { /* ignore */ }
  applySidebar(sidebarCollapsed);
}

/* ------------------------------------------------------------------ *
 * Menus de la barre du haut
 * ------------------------------------------------------------------ */

const menus = [...document.querySelectorAll('.menu')];

function closeMenus(except) {
  for (const m of menus) {
    if (m === except) continue;
    m.classList.remove('open');
    m.querySelector('.menu-btn').setAttribute('aria-expanded', 'false');
  }
}

for (const m of menus) {
  const btn = m.querySelector('.menu-btn');
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const open = !m.classList.contains('open');
    closeMenus(m);
    m.classList.toggle('open', open);
    btn.setAttribute('aria-expanded', open ? 'true' : 'false');
  });
  // un clic DANS le tiroir ne doit pas le refermer : on y règle des curseurs,
  // on y coche des cases, souvent plusieurs à la suite
  m.querySelector('.menu-pop').addEventListener('click', (e) => e.stopPropagation());
}
document.addEventListener('click', () => closeMenus(null));
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeMenus(null);
});

/* ------------------------------------------------------------------ *
 * Sections repliables du panneau de gauche
 * ------------------------------------------------------------------ */

const FOLD_KEY = 'tinyhoop-mk1:folds';

function loadFolds() {
  try {
    const raw = localStorage.getItem(FOLD_KEY);
    return new Set(raw ? JSON.parse(raw) : []);
  } catch { return new Set(); }
}

const closedFolds = loadFolds();

document.querySelectorAll('#sidebar .fold').forEach((section, i) => {
  const head = section.querySelector('.fold-head');
  const key = head.textContent.trim();
  if (closedFolds.has(key)) section.classList.add('closed');
  else if (closedFolds.size && !closedFolds.has(key)) section.classList.remove('closed');
  const toggle = () => {
    const closed = section.classList.toggle('closed');
    if (closed) closedFolds.add(key); else closedFolds.delete(key);
    try { localStorage.setItem(FOLD_KEY, JSON.stringify([...closedFolds])); } catch { /* ignore */ }
  };
  head.addEventListener('click', toggle);
  head.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); }
  });
});

$('side-toggle').addEventListener('click', toggleSidebar);
window.addEventListener('keydown', (e) => {
  const tag = (e.target.tagName || '').toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.key.toLowerCase() === 'b') { e.preventDefault(); toggleSidebar(); }
});

/* ------------------------------------------------------------------ *
 * Couleur du fond
 * ------------------------------------------------------------------ */

const BG_KEY = 'tinyhoop-mk1:background';

/**
 * Seul le fond change. La grille, elle, doit rester lisible : un quadrillage
 * bleu nuit disparaît sur du blanc. Chaque fond emporte donc la teinte de
 * grille qui garde le même contraste, sans toucher aux pièces.
 */
const BACKGROUNDS = {
  studio: { bg: 0x0a0e14, grid: [0x1e3550, 0x142236] },
  noir: { bg: 0x000000, grid: [0x2a2a2a, 0x1a1a1a] },
  gris: { bg: 0x808080, grid: [0x9a9a9a, 0x707070] },
  blanc: { bg: 0xffffff, grid: [0xc8c8c8, 0xe0e0e0] },
};

function applyBackground(name) {
  const choice = BACKGROUNDS[name] || BACKGROUNDS.studio;
  scene.background = new THREE.Color(choice.bg);

  // GridHelper fige ses couleurs à la construction : on remplace le maillage
  // plutôt que de fouiller ses attributs de couleur. La taille courante est
  // conservée — elle dépend de l'étalement des pièces, pas du fond.
  const wasVisible = grid.visible;
  scene.remove(grid);
  disposeObject(grid);
  grid = new THREE.GridHelper(gridSize, gridSize / GRID_CELL_MM, choice.grid[0], choice.grid[1]);
  grid.userData.colors = choice.grid;
  grid.position.y = -14;
  grid.visible = wasVisible;
  scene.add(grid);

  document.querySelectorAll('.bg-swatch').forEach((b) => {
    b.classList.toggle('on', b.dataset.bg === name);
  });
  invalidate();
}

document.querySelectorAll('.bg-swatch').forEach((btn) => {
  btn.addEventListener('click', () => {
    const name = btn.dataset.bg;
    try { localStorage.setItem(BG_KEY, name); } catch { /* ignore */ }
    applyBackground(name);
  });
});
applyBackground(localStorage.getItem(BG_KEY) || 'studio');

window.addEventListener('resize', () => {
  resize();
  if (!$('pane-bp').classList.contains('hidden')) renderBlueprint();
  if (!$('pane-cal').classList.contains('hidden')) renderCalibration();
});
resize();
layoutParts();
renderStandoffs();
renderStandoffList();
frameAll(ISO_DIR);
updatePhotoOpacity();
applyHidden();

/* ------------------------------------------------------------------ *
 * Annuler / rétablir
 * ------------------------------------------------------------------ */

history.reset(snapshot());
renderHistoryButtons();

function undo() {
  const state = history.undo();
  if (!state) return;
  applySnapshot(state);
  updateAsmHint('Action annulée.', 'ok');
}

function redo() {
  const state = history.redo();
  if (!state) return;
  applySnapshot(state);
  updateAsmHint('Action rétablie.', 'ok');
}

$('hist-undo').addEventListener('click', undo);
$('hist-redo').addEventListener('click', redo);

window.addEventListener('keydown', (e) => {
  // pas pendant une saisie : Ctrl+Z doit y garder son sens habituel
  const tag = (e.target.tagName || '').toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
  if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'z') return;
  e.preventDefault();
  if (e.shiftKey) redo(); else undo();
});

/* ------------------------------------------------------------------ *
 * Cube de navigation
 * ------------------------------------------------------------------ */

/** Correspondance entre les faces du cube et les boutons de vue existants. */
const NAVCUBE_VIEW_KEY = { DESSUS: 'top', AVANT: 'front', DROITE: 'side' };

const navCube = createNavCube({
  canvas: $('navcube-canvas'),
  mainCamera: camera,
  controls,
  frameAll: (face) => setView(face.dir, NAVCUBE_VIEW_KEY[face.label] || null),
  invalidate,
});

/* ------------------------------------------------------------------ *
 * Diagnostic
 * ------------------------------------------------------------------ */

/**
 * Exposé uniquement avec ?debug=1 : donne la position monde et la projection
 * écran de chaque perçage, ce qui permet de vérifier un assemblage par la
 * mesure plutôt qu'à l'œil.
 */
if (new URLSearchParams(location.search).has('debug')) {
  // la scène elle-même : les boîtes englobantes ne disent pas dans quel sens
  // pointe une pièce, il faut pouvoir remonter à ses sommets
  window.__buildRoot = buildRoot;
  window.__scene = scene;
  window.__THREE = THREE;
  window.__camera = camera;
  window.__controls = controls;
  window.__assembledParts = assembledParts;
  window.__layout = layoutParts;
  window.__hw = hw;
  window.__hwGroup = hardwareGroup;
  window.__standoffGroup = standoffGroup;
  window.__selectPart = selectPart;

  /** Encombrement au sol de chaque pièce, pour vérifier la disposition. */
  window.__benchBoxes = () => {
    buildRoot.updateMatrixWorld(true);
    return entries.filter((e) => e.holder).map((e) => {
      // uniquement le corps : les repères d'accrochage (anneaux, disques de
      // visée) débordent de la pièce et fausseraient la mesure
      const body = e.object && e.object.getObjectByName('body');
      // Box3.setFromObject transforme la boîte de la géométrie, pas ses
      // sommets : pour une pièce tournée, il rend la boîte de la boîte, plus
      // grosse de plusieurs millimètres (mesuré 3,4 mm sur un patin à 23°).
      // On repasse donc sur les sommets.
      const box = new THREE.Box3();
      if (body) {
        const p = body.geometry.attributes.position;
        const v = new THREE.Vector3();
        for (let i = 0; i < p.count; i++) {
          box.expandByPoint(v.fromBufferAttribute(p, i).applyMatrix4(body.matrixWorld));
        }
      } else {
        box.setFromObject(e.holder);
      }
      return {
        id: e.mod.meta.id,
        minX: box.min.x, maxX: box.max.x,
        minY: box.min.y, maxY: box.max.y,
        minZ: box.min.z, maxZ: box.max.z,
      };
    });
  };

  window.__asmDebug = () => {
    const rect = renderer.domElement.getBoundingClientRect();
    // le rendu étant à la demande, les matrices de la caméra peuvent dater
    // d'avant le dernier déplacement : on les rafraîchit avant de projeter
    camera.updateMatrixWorld();
    camera.matrixWorldInverse.copy(camera.matrixWorld).invert();
    buildRoot.updateMatrixWorld(true);
    const v = new THREE.Vector3();
    return {
      hint: $('asm-hint').textContent,
      lastPick,
      selectedId,
      hidden: [...hiddenParts],
      background: `#${scene.background.getHexString()}`,
      sidebarCollapsed: $('layout').classList.contains('side-collapsed'),
      standoffs: standoffs.map((s) => ({
        ref: so.reference(s),
        placed: s.x !== null,
        x: s.x === null ? null : +s.x.toFixed(3),
        y: s.y === null ? null : +s.y.toFixed(3),
        z: s.z === null ? null : +s.z.toFixed(3),
        hole: s.holeLabel,
        selected: s.id === selectedStandoff,
      })),
      hardware: hardwareGroup.children.map((o) => ({
        type: o.name,
        y: +o.position.y.toFixed(2),
        x: +o.position.x.toFixed(2),
        z: +o.position.z.toFixed(2),
      })),
      ringColors: entries.flatMap((e) => (e.markers || [])
        .map((m) => m.getObjectByName('ring').material.color.getHexString())
        // 6cc7ff = repère de dessus au repos, ffb066 = repère de dessous
        .filter((c) => c !== '6cc7ff' && c !== 'ffb066')),
      parts: entries.map((e) => ({
        id: e.mod.meta.id,
        name: e.mod.meta.name,
        x: e.holder.position.x,
        y: e.holder.position.y,
        z: e.holder.position.z,
        rotX: e.holder.rotation.x,
        rotY: e.holder.rotation.y,
        rotZ: e.holder.rotation.z,
        mirrored: !!(placements[e.mod.meta.id] || {}).mirrored,
        holes: (e.markers || []).map((m) => {
          const index = m.userData.anchor.index;
          const kind = m.userData.anchor.kind || 'hole';
          const r = m.userData.anchor.r;
          m.getWorldPosition(v);
          const world = { wx: v.x, wy: v.y, wz: v.z };
          v.project(camera);
          return {
            index, kind, r,
            face: m.userData.face || null,
            ...world,
            sx: ((v.x + 1) / 2) * rect.width,
            sy: ((-v.y + 1) / 2) * rect.height,
          };
        }),
      })),
    };
  };
}

renderer.setAnimationLoop((now) => {
  // un assemblage en cours redemande une image à chaque tour
  const t = now || performance.now();
  if (stepMotion(t)) needsRender = true;
  if (stepCamera(t)) needsRender = true;
  if ($('opt-rotate').checked) {
    buildRoot.rotation.y += 0.0035;
    needsRender = true;
  }
  if (controls.update()) needsRender = true; // amortissement en cours
  if (!needsRender) return;
  needsRender = false;
  renderer.render(scene, camera);
  // le cube suit la caméra principale : recalé à chaque rendu de la scène
  navCube.sync();
  navCube.render();
});
