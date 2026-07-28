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

const $ = (id) => document.getElementById(id);

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

const grid = new THREE.GridHelper(300, 30, 0x1e3550, 0x142236);
grid.position.y = -14;
scene.add(grid);

/* ------------------------------------------------------------------ *
 * Montage des pièces
 * ------------------------------------------------------------------ */

const buildRoot = new THREE.Group();
scene.add(buildRoot);

let entries = [];

/** Reconstruit la liste des pièces : celles du projet + celles créées ici. */
function collectParts() {
  return [
    ...PARTS,
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
  if (entry.object) {
    buildRoot.remove(entry.object);
    disposeObject(entry.object);
  }
  entry.object = traceMm && entry.mod.buildFromTrace
    ? entry.mod.buildFromTrace(traceMm)
    : entry.mod.build();
  entry.object.position.y = entry.baseY;
  buildRoot.add(entry.object);
  applyDisplayOptions();
  invalidate();
}

/** Remonte toute la scène après ajout ou suppression d'une pièce. */
function remountAll() {
  entries.forEach((e) => {
    if (e.object) { buildRoot.remove(e.object); disposeObject(e.object); }
  });
  entries = collectParts();
  entries.forEach((e) => mountPart(e, e.mod.isCustom ? null : appliedTrace()));
  renderPartList();
}

/** Le tracé photo ne remplace que la pièce 01, et seulement si demandé. */
function appliedTrace() {
  return cal.state.applied ? cal.state.traceMm : null;
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
    const origin = fromPhoto
      ? 'contour tracé sur la photo'
      : 'contour saisi à la main — à calibrer';

    const li = document.createElement('li');
    li.className = 'part';
    li.innerHTML = `
      <label class="part-head">
        <input type="checkbox" checked>
        <span class="idx">${String(m.index).padStart(2, '0')}</span>
        <span class="nm">${m.name}</span>
      </label>
        ${e.mod.isCustom ? '<button class="del" title="Supprimer la pièce">✕</button>' : ''}
      <p class="origin ${fromPhoto ? 'ok' : ''}">${origin}</p>
      <dl class="specs">
        <div><dt>Longueur</dt><dd>${dims.length.toFixed(1)} mm</dd></div>
        <div><dt>Largeur</dt><dd>${dims.width.toFixed(1)} mm</dd></div>
        <div><dt>Épaisseur</dt><dd>${dims.thickness.toFixed(1)} mm</dd></div>
        <div><dt>Perçages</dt><dd>${dims.holes}</dd></div>
        <div><dt>Matière</dt><dd>${m.material}</dd></div>
        <div><dt>Échelle</dt><dd>1 px = ${dims.mmPerPx.toFixed(4)} mm</dd></div>
      </dl>`;
    li.querySelector('input').addEventListener('change', (ev) => {
      if (e.object) e.object.visible = ev.target.checked;
    });
    const del = li.querySelector('.del');
    if (del) del.addEventListener('click', () => {
      if (!confirm(`Supprimer « ${m.name} » ?`)) return;
      custom.removeSpec(m.id);
      remountAll();
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

// Vues prédéfinies
const VIEWS = { iso: [95, 78, 118], top: [0, 175, 0.01], front: [0, 8, 165], side: [165, 8, 0] };
document.querySelectorAll('[data-view]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const [x, y, z] = VIEWS[btn.dataset.view];
    camera.position.set(x, y, z);
    controls.target.set(0, 4, 0);
    document.querySelectorAll('[data-view]').forEach((b) => b.classList.remove('on'));
    btn.classList.add('on');
    invalidate();
  });
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
$('opt-grid').addEventListener('change', () => {
  grid.visible = $('opt-grid').checked;
  invalidate();
});

const explode = $('explode');
explode.addEventListener('input', () => {
  const f = Number(explode.value);
  entries.forEach((e, i) => { if (e.object) e.object.position.y = e.baseY + i * f; });
  $('explode-val').textContent = `${f} mm`;
  invalidate();
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
    smoothing: Number($('c-smo').value),
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
    $('v-smo').value = $('c-smo').value;
    $('v-min').value = `${$('c-min').value} px²`;
    $('v-circ').value = `${$('c-circ').value} px`;
    renderCalibration();
  });
});
$('c-mask').addEventListener('change', renderCalibration);

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

function runTrace() {
  try {
    const t = cal.run(traceOptions(), Number($('c-len').value));
    say(
      `Tracé : ${cal.state.trace.outline.length} points de contour, ` +
      `${t.holes.length} perçages · ${t.width.toFixed(1)} x ${t.height.toFixed(1)} mm`,
      'ok',
    );
    renderCalibration();
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
  /** Remonte toute la scène après ajout ou suppression d'une pièce. */
function remountAll() {
  entries.forEach((e) => {
    if (e.object) { buildRoot.remove(e.object); disposeObject(e.object); }
  });
  entries = collectParts();
  entries.forEach((e) => mountPart(e, e.mod.isCustom ? null : appliedTrace()));
  renderPartList();
}

/** Le tracé photo ne remplace que la pièce 01, et seulement si demandé. */
function appliedTrace() {
  return cal.state.applied ? cal.state.traceMm : null;
}

entries = collectParts();
entries.forEach((e) => mountPart(e, null));
  renderPartList();
  renderCalibration();
  say('Photo oubliée, retour au contour manuel.');
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
window.addEventListener('resize', () => {
  resize();
  if (!$('pane-bp').classList.contains('hidden')) renderBlueprint();
  if (!$('pane-cal').classList.contains('hidden')) renderCalibration();
});
resize();
updatePhotoOpacity();

renderer.setAnimationLoop(() => {
  if ($('opt-rotate').checked) {
    buildRoot.rotation.y += 0.0035;
    needsRender = true;
  }
  if (controls.update()) needsRender = true; // amortissement en cours
  if (!needsRender) return;
  needsRender = false;
  renderer.render(scene, camera);
});
