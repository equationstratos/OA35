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
const BUILD = '2026-08-03a · contours exacts, trous moteur';
$('build-stamp').textContent = BUILD;

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

let grid = new THREE.GridHelper(300, 30, 0x1e3550, 0x142236);
grid.position.y = -14;
scene.add(grid);

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
  // les pièces viennent d'être reconstruites : elles sont toutes visibles
  applyHidden();
}

/** Le tracé photo ne remplace que la pièce 01, et seulement si demandé. */
function appliedTrace() {
  return cal.state.applied ? cal.state.traceMm : null;
}

/* ------------------------------------------------------------------ *
 * Disposition des pièces
 * ------------------------------------------------------------------ */

/** Espace laissé entre deux pièces posées côte à côte, en mm. */
const LAYOUT_GAP_MM = 12;

/**
 * Position d'établi par pièce, en plan (X, Z) : la bottom-plate au centre, la
 * clamp-plate au-dessus sur le plan (vers l'avant, -Z, sans être empilée en
 * hauteur — « pas assemblée, juste posée dessus »), les flancs en haut à
 * gauche, côte à côte, chacun tourné à 90° et le droit à 180° de plus que le
 * gauche pour se présenter tête-bêche. Middle-plate et top-plate n'avaient
 * pas de place demandée : je les ai mises à droite, à ajuster si besoin.
 *
 * Les bras occupent la colonne de gauche, la paire arrière (longue) devant la
 * paire avant (courte), gauche et droite côte à côte dans chaque paire.
 * Les accessoires imprimés forment une rangée à l'arrière (+Z), à l'écart des
 * pièces de structure.
 */
const deg = (d) => (d * Math.PI) / 180;

const BENCH_ZONES = {
  'bottom-plate': { x: 0, z: 0 },
  'clamp-plate': { x: 0, z: -75 },
  'middle-plate': { x: 90, z: 0 },
  'top-plate': { x: 90, z: 115 },
  // côte à côte (X commun décalé, même Z) plutôt que loin l'un de l'autre :
  // le droit reprend les 90° du gauche plus 180°, pour qu'ils se présentent
  // tête-bêche l'un à côté de l'autre plutôt que dans le même sens
  'flanc-gauche': { x: -100, z: -30, rotY: deg(-90) },
  'flanc-droit': { x: -70, z: -30, rotY: deg(90) },

  // bras : paire arrière (longue) puis paire avant (courte)
  'arm-long-l': { x: -175, z: -55 },
  'arm-long-r': { x: -145, z: -55 },
  'arm-short-l': { x: -175, z: 60 },
  'arm-short-r': { x: -145, z: 60 },

  // accessoires imprimés : rangée à l'arrière, au-delà de la top-plate qui
  // court jusqu'à Z ~168 — sinon le support VTX et le support caméra mordent
  // dessus
  'cover-01': { x: -105, z: 210 },
  'cover-02': { x: -50, z: 210 },
  'gps-mount': { x: -5, z: 210 },
  'vtx-mount': { x: 40, z: 210 },
  // orientation relevée à la main dans le viewer : retourné (X -180°) puis
  // pivoté de 88°, d'où le Y de 30,2 mm qui rattrape la hauteur de la pièce
  // basculée — son origine est à sa base, qui passe en haut une fois retournée
  'camera-mount': {
    x: 95, y: 30.2, z: 210, rotX: deg(-180), rotY: deg(88), rotZ: 0,
  },
  // la joue opposée : maillage déjà mis en miroir sur X, donc l'angle autour
  // de la verticale change de signe — sinon les deux joues regarderaient du
  // même côté au lieu de se faire face
  'camera-mount-mirror': {
    x: 140, y: 30.2, z: 210, rotX: deg(-180), rotY: deg(-88), rotZ: 0,
  },

  // patins : petite rangée derrière les accessoires
  'footpad-ar-l': { x: -60, z: 265 },
  'footpad-ar-r': { x: -30, z: 265 },
  'footpad-av-l': { x: 0, z: 265 },
  'footpad-av-r': { x: 30, z: 265 },
};

/**
 * Rangée pour toute pièce sans zone dédiée (typiquement un bras créé depuis
 * l'outil de calibration). Placée loin devant (+Z) plutôt qu'à une distance
 * fixe : un bras est long, une distance fixe l'aurait fait mordre sur la
 * pièce centrale. L'écart tient compte de la plus longue des pièces à ranger.
 */
const UNZONED_ROW_CLEARANCE_MM = 46; // au-delà du bord de la bottom-plate (Z ±37,6 mm)

/**
 * Deux dispositions :
 * - côte à côte : les pièces sont alignées à plat, chacune à la place fixe
 *   de BENCH_ZONES quand elle en a une ; c'est la vue de travail qui reflète
 *   le plan du châssis
 * - assemblée : chaque pièce reprend son altitude dans le build, et la vue
 *   éclatée les écarte verticalement. Une pièce jamais assemblée y reste
 *   quand même à sa place d'établi, sinon elle serait invisible sous les
 *   autres.
 */
function layoutParts() {
  const sideBySide = $('opt-layout').checked;
  const spread = Number($('explode').value);

  // pièces sans zone dédiée : rangée dégagée, assez loin pour qu'un bras
  // entier (long) ne morde pas sur la pièce centrale
  const unzoned = entries.filter((e) => !BENCH_ZONES[e.mod.meta.id]);
  const widths = unzoned.map((e) => e.mod.meta.dims.width);
  const total = widths.reduce((a, b) => a + b, 0)
    + LAYOUT_GAP_MM * Math.max(0, unzoned.length - 1);
  const rowX = [];
  let x = -total / 2;
  widths.forEach((w) => { rowX.push(x + w / 2); x += w + LAYOUT_GAP_MM; });
  const unzonedRowZ = UNZONED_ROW_CLEARANCE_MM
    + Math.max(0, ...unzoned.map((e) => e.mod.meta.dims.length)) / 2;
  let rowRank = 0;

  entries.forEach((e, i) => {
    if (!e.holder) return;
    const stored = placements[e.mod.meta.id];
    // un placement peut n'exister que pour le miroir, sans coordonnées : il ne
    // vaut position que s'il en porte une. Une pièce déplacée à la main
    // (curseurs de la barre d'outils) garde sa position partout, y compris
    // « côte à côte » — sinon les curseurs n'auraient aucun effet visible là
    // où on s'en sert le plus, en train d'organiser l'établi.
    const hasPosition = stored && Number.isFinite(stored.x);
    const placement = hasPosition && (stored.manual || !sideBySide) ? stored : null;
    if (placement) {
      e.holder.position.set(placement.x, placement.y + i * spread, placement.z);
      e.holder.rotation.set(placement.rotX || 0, placement.rotY || 0, placement.rotZ || 0);
    } else {
      const zone = BENCH_ZONES[e.mod.meta.id];
      const bx = zone ? zone.x : rowX[rowRank];
      const bz = zone ? zone.z : unzonedRowZ;
      if (!zone) rowRank++;
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

/** Applique l'état masqué/visible à toutes les pièces montées. */
function applyHidden() {
  entries.forEach((e) => {
    if (e.object) e.object.visible = !hiddenParts.has(e.mod.meta.id);
  });
  invalidate();
}

/* ------------------------------------------------------------------ *
 * Historique (annuler / rétablir)
 * ------------------------------------------------------------------ */

const history = createHistory();

/** État complet du plan de travail, tel qu'il est mémorisé et restauré. */
function snapshot() {
  return { placements, standoffs, hidden: [...hiddenParts] };
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
    asm.savePlacements(placements);
    so.save(standoffs);
    saveHidden();

    clearSelection();
    clearStandoffSelection();
    layoutParts();
    renderStandoffs();
    renderStandoffList();
    renderPartList();
    applyHidden();
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
scene.add(hardwareGroup);

/** Perçages d'une pièce, en coordonnées monde. */
function partHolesInWorld(entry) {
  const v = new THREE.Vector3();
  // un perçage porte un repère sur chaque face : ne compter que celui du
  // dessus, sinon chaque trou est vu deux fois et la visserie est doublée
  return (entry.markers || [])
    .filter((marker) => marker.userData.face !== 'bottom')
    .map((marker) => {
      marker.getWorldPosition(v);
      return { x: v.x, z: v.z, diameter: marker.userData.anchor.r * 2 };
    });
}

/** Pièces assemblées, sous la forme attendue par la détection. */
function assembledParts() {
  return entries
    .filter((e) => e.holder && e.object.visible !== false)
    .map((e) => ({
      id: e.mod.meta.id,
      name: e.mod.meta.name,
      y: e.holder.position.y,
      thickness: e.mod.meta.dims.thickness,
      holes: partHolesInWorld(e),
    }));
}

function clearHardware() {
  while (hardwareGroup.children.length) {
    const child = hardwareGroup.children[0];
    hardwareGroup.remove(child);
    disposeObject(child);
  }
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
function placeHardware() {
  clearHardware();

  const candidates = hw.findFastenerSites(assembledParts());
  const spacing = Number($('hw-spacing').value);
  const sites = hw.spaceOut(candidates, spacing);
  if (!sites.length) {
    updateAsmHint(
      "Aucun perçage ne s'aligne entre deux pièces d'altitudes différentes. "
      + 'Assemble d\'abord les plaques par leurs perçages.',
      'warn',
    );
    return;
  }

  const items = [];
  for (const site of sites) {
    const item = hw.fastenerFor(site);
    items.push(item);

    if (item.standoffLength > 0) {
      const standoff = hw.standoffMesh(site.thread, item.standoffLength);
      standoff.position.set(site.x, site.lower.y + site.lower.thickness / 2, site.z);
      hardwareGroup.add(standoff);
    }

    // la vis appuie sur la face supérieure de la pièce haute
    const screw = hw.screwMesh(site.thread, item.screwLength);
    screw.position.set(site.x, site.upper.y + site.upper.thickness / 2, site.z);
    hardwareGroup.add(screw);
  }

  renderBom(items, sites, candidates.length);
  hardwareGroup.visible = $('opt-hardware').checked;
  invalidate();
}

function renderBom(items, sites, candidateCount) {
  const bom = hw.billOfMaterials(items);
  const play = Math.max(...items.map((i) => i.standoffPlay), 0);
  const filtered = candidateCount - sites.length;

  $('bom').innerHTML = bom.map((line) =>
    `<div><dt>${line.label}</dt><dd>× ${line.count}</dd></div>`).join('')
    + `<div><dt>Fixations</dt><dd>${sites.length} / ${candidateCount} candidates</dd></div>`;

  updateAsmHint(
    `${sites.length} fixation${sites.length > 1 ? 's' : ''} posée${sites.length > 1 ? 's' : ''} : `
    + `${bom.map((l) => `${l.count} × ${l.label.toLowerCase()}`).join(', ')}.`
    + (filtered > 0
      ? ` ${filtered} autre${filtered > 1 ? 's' : ''} perçage${filtered > 1 ? 's' : ''} en regard `
        + `écarté${filtered > 1 ? 's' : ''} par l'espacement minimal — c'est une hypothèse, `
        + 'ajuste-la si ton montage en veut plus.'
      : '')
    + (play > 0.35
      ? ` L'entretoise du commerce la plus proche dépasse l'écart mesuré de ${play.toFixed(1)} mm.`
      : ''),
    play > 0.35 ? 'warn' : 'ok',
  );
}

$('hw-place').addEventListener('click', placeHardware);
$('hw-spacing').addEventListener('input', () => {
  $('v-spacing').value = `${$('hw-spacing').value} mm`;
  if (hardwareGroup.children.length) placeHardware();
});
$('hw-clear').addEventListener('click', () => {
  clearHardware();
  updateAsmHint('Visserie retirée.');
});
$('opt-hardware').addEventListener('change', () => {
  hardwareGroup.visible = $('opt-hardware').checked;
  standoffGroup.visible = $('opt-hardware').checked;
  invalidate();
});

/* ------------------------------------------------------------------ *
 * Entretoises posées à la main
 * ------------------------------------------------------------------ */

/* Dans buildRoot, et non dans la scène : une entretoise appartient au châssis,
 * elle doit suivre la rotation automatique comme les plaques. */
const standoffGroup = new THREE.Group();
standoffGroup.name = 'standoffs';
buildRoot.add(standoffGroup);

let standoffs = so.load();
let selectedStandoff = null;

/** Écart laissé entre deux entretoises en attente, sur leur colonne. */
const PARK_PITCH_MM = 9;

/** Colonne des entretoises : à gauche, comme les autres pièces de cette zone. */
const PARK_COLUMN_X = -45;

/**
 * Emplacement d'attente : une colonne à gauche du build, groupée avec les
 * autres pièces de cette zone plutôt que reléguée hors du build.
 *
 * Une entretoise non placée doit rester visible et visable. La poser à
 * l'origine la mettrait sous les plaques, où elle serait invisible et
 * incliquable — donc impossible à placer.
 */
function parkingSpot(rank, total) {
  return { x: PARK_COLUMN_X, y: 0, z: (rank - (total - 1) / 2) * PARK_PITCH_MM };
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
  standoffGroup.visible = $('opt-hardware').checked;
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

$('asm-assemble-chassis').addEventListener('click', () => {
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
  updateAsmHint(
    `Châssis assemblé : ${batch.length} entretoises M2×4×22 posées sur la `
    + `middle-plate, perçages #${CHASSIS_STANDOFF_HOLES.join(', #')}.`,
    'ok',
  );
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
  renderPartToolbar();
}

function clearPartSelection() {
  selectedId = null;
  applySelectionLook();
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

  bar.innerHTML = `
    <div class="row">
      <span class="sel-name">${entry.mod.meta.name}</span>
      <button data-act="mirror" class="${placement.mirrored ? 'on' : ''}"
        title="Symétrie gauche/droite de la pièce">⇋ Miroir</button>
      <button data-act="above" class="${placement.side !== 'below' ? 'on' : ''}"
        ${reference ? '' : 'disabled'}
        title="${reference ? `Poser au-dessus de « ${reference.mod.meta.name} »` : noRef}">⬆ Dessus</button>
      <button data-act="below" class="${placement.side === 'below' ? 'on' : ''}"
        ${reference ? '' : 'disabled'}
        title="${reference ? `Poser en dessous de « ${reference.mod.meta.name} »` : noRef}">⬇ Dessous</button>
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

  bar.querySelectorAll('.row:first-child button').forEach((btn) => {
    btn.addEventListener('click', () => partAction(btn.dataset.act));
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

function partAction(action) {
  const entry = entryById(selectedId);
  if (!entry) return;
  const id = entry.mod.meta.id;

  if (action === 'clear') { clearPartSelection(); return; }

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

function onPick(event) {
  // une entretoise sous le curseur prime : c'est elle qu'on veut placer, et
  // elle recouvre justement le perçage qui la porte
  const standoff = asm.pickFirst(event, renderer.domElement, camera, standoffTargets());
  if (standoff) {
    let node = standoff;
    while (node && !node.userData.standoffId) node = node.parent;
    if (node) { selectStandoff(node.userData.standoffId); return; }
  }

  if ($('opt-layout').checked) return;
  const hits = asm.pickMarkers(event, renderer.domElement, camera, pickTargets());

  // une entretoise sélectionnée détourne le clic sur perçage : il la pose,
  // au lieu d'ouvrir une contrainte d'assemblage
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
    li.className = 'part';
    li.dataset.id = m.id;
    li.innerHTML = `
      <label class="part-head">
        <input type="checkbox" ${hiddenParts.has(m.id) ? '' : 'checked'}>
        <span class="idx">${String(m.index).padStart(2, '0')}</span>
        <span class="nm">${m.name}</span>
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

/** Arêtes, transparence de la plaque sous le calque photo. */
function applyDisplayOptions() {
  const showEdges = $('opt-edges').checked;
  const ghost = $('opt-photo').checked && !!photoPlane;
  buildRoot.traverse((o) => {
    if (o.name === 'edges') o.visible = showEdges;
    if (o.name === 'body' && o.material) {
      o.material.transparent = ghost;
      o.material.opacity = ghost ? 0.55 : 1;
      o.material.needsUpdate = true;
    }
  });
  invalidate();
}

$('opt-edges').addEventListener('change', applyDisplayOptions);

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

  custom.importSpecs(data.customParts || []);
  placements = data.placements && typeof data.placements === 'object' ? data.placements : {};
  standoffs = Array.isArray(data.standoffs) ? data.standoffs : [];
  hiddenParts = new Set(Array.isArray(data.hidden) ? data.hidden : []);
  asm.savePlacements(placements);
  so.save(standoffs);
  saveHidden();

  clearSelection();
  clearStandoffSelection();
  remountAll();
  renderStandoffs();
  renderStandoffList();
  // le plan chargé devient un point de retour à part entière
  pushHistory();
  updateAsmHint(
    `Plan de travail « ${file.name} » chargé : ${entries.length} pièce(s), `
    + `${standoffs.length} entretoise(s).`,
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
  // plutôt que de fouiller ses attributs de couleur
  const wasVisible = grid.visible;
  scene.remove(grid);
  disposeObject(grid);
  grid = new THREE.GridHelper(300, 30, choice.grid[0], choice.grid[1]);
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
  window.__THREE = THREE;

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

renderer.setAnimationLoop(() => {
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
