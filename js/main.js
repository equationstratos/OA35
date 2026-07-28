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
  if (entry.holder) {
    buildRoot.remove(entry.holder);
    disposeObject(entry.holder);
  }
  entry.object = traceMm && entry.mod.buildFromTrace
    ? entry.mod.buildFromTrace(traceMm)
    : entry.mod.build();

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
 * Deux dispositions :
 * - côte à côte : les pièces sont alignées sur X et posées à plat, sans se
 *   recouvrir ; c'est la vue de travail quand on modélise pièce par pièce
 * - assemblée : chaque pièce reprend son altitude dans le build, et la vue
 *   éclatée les écarte verticalement
 */
function layoutParts() {
  const sideBySide = $('opt-layout').checked;
  const spread = Number($('explode').value);

  // position d'établi : sert de disposition par défaut, et de point de départ
  // aux pièces pas encore assemblées
  const widths = entries.map((e) => e.mod.meta.dims.width);
  const total = widths.reduce((a, b) => a + b, 0)
    + LAYOUT_GAP_MM * Math.max(0, entries.length - 1);
  const benchX = [];
  let x = -total / 2;
  widths.forEach((w) => { benchX.push(x + w / 2); x += w + LAYOUT_GAP_MM; });

  entries.forEach((e, i) => {
    if (!e.holder) return;
    const placement = sideBySide ? null : placements[e.mod.meta.id];
    if (placement) {
      e.holder.position.set(placement.x, placement.y + i * spread, placement.z);
      e.holder.rotation.y = placement.rotY;
    } else {
      // une pièce non assemblée reste sur l'établi : la poser à l'origine la
      // rendrait indiscernable, donc impossible à viser
      e.holder.position.set(benchX[i], sideBySide ? 0 : e.baseY + i * spread, 0);
      e.holder.rotation.y = 0;
    }
  });

  entries.forEach((e) => { if (e.holder) e.holder.updateMatrixWorld(true); });
  setMarkersVisible(!sideBySide);
  invalidate();
}

/* ------------------------------------------------------------------ *
 * Assemblage par clic sur les perçages
 * ------------------------------------------------------------------ */

let placements = asm.loadPlacements();

/** Repères de perçage visibles et cliquables uniquement en assemblage. */
function setMarkersVisible(visible) {
  entries.forEach((e) => {
    const group = e.object && e.object.getObjectByName('hole-markers');
    if (group) group.visible = visible;
  });
  if (!visible) clearSelection();
  $('asm-hint').classList.toggle('hidden', !visible);
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
function storePlacement(entry) {
  const spread = Number($('explode').value);
  const i = entries.indexOf(entry);
  placements[entry.mod.meta.id] = {
    x: entry.holder.position.x,
    y: entry.holder.position.y - i * spread,
    z: entry.holder.position.z,
    rotY: entry.holder.rotation.y,
  };
  asm.savePlacements(placements);
}

let lastPick = null;

function onPick(event) {
  if ($('opt-layout').checked) return;
  const hits = asm.pickMarkers(event, renderer.domElement, camera, pickTargets());
  if (!hits.length) return;

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
    const thickness = movEntry.mod.meta.dims.thickness;
    // la hauteur saisie à la création prime ; sinon la pièce se pose au contact
    movEntry.holder.position.y = movEntry.baseY !== 0
      ? movEntry.baseY
      : asm.contactHeight(refEntry.holder.position.y, refThickness, thickness);

    asm.translateInPlane(movEntry.holder, movPos, refPos);
    asm.state.movingId = movEntry.mod.meta.id;
    asm.state.anchor = refPos.clone();
    storePlacement(movEntry);

    asm.highlight(refMarker, 'anchored');
    asm.highlight(movMarker, 'anchored');
    asm.state.pending = null;
    updateAsmHint(
      `Trous superposés. Clique un 2e trou de référence puis son équivalent sur « ${movEntry.mod.meta.name} » pour l'orienter.`,
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
  const box = new THREE.Box3().setFromObject(buildRoot);
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
    const unconfirmed = e.mod.isCustom && e.mod.spec
      && e.mod.spec.scaleSource !== 'patterns' && e.mod.spec.scaleSource !== 'manual';

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
      ${unconfirmed ? '<p class="origin warn">échelle non confirmée — vérifie la longueur</p>' : ''}
      <dl class="specs">
        <div><dt>Longueur</dt><dd>${dims.length.toFixed(1)} mm</dd></div>
        <div><dt>Largeur</dt><dd>${dims.width.toFixed(1)} mm</dd></div>
        <div><dt>Épaisseur</dt><dd>${dims.thickness.toFixed(1)} mm</dd></div>
        <div><dt>Perçages</dt><dd>${dims.holes}</dd></div>
        <div><dt>Matière</dt><dd>${m.material}</dd></div>
        <div><dt>Échelle</dt><dd>1 px = ${dims.mmPerPx.toFixed(4)} mm</dd></div>
      </dl>
      <div class="download-row">
        <span class="download-label">Télécharger</span>
        <button class="dl dl-stl" title="Géométrie 3D en millimètres, pièce à plat — CAO, impression">⬇ STL</button>
        <button class="dl dl-js" title="Module autonome à déposer dans js/parts/ du dépôt">⬇ .js pour le dépôt</button>
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
      </div>` : ''}`;
    li.querySelector('input').addEventListener('change', (ev) => {
      if (e.object) e.object.visible = ev.target.checked;
    });

    li.querySelector('.dl-stl').addEventListener('click', () => exportSTL(e));
    li.querySelector('.dl-js').addEventListener('click', () => exportModule(e));

    const role = li.querySelector('.role');
    if (role) role.addEventListener('change', () => {
      const thickness = thicknessForRole(role.value);
      if (!thickness) return;
      custom.setThickness(m.id, thickness);
      remountAll();
    });

    const recal = li.querySelector('.recal');
    if (recal) recal.addEventListener('click', () => rescalePart(m.id, m.name));

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

// Vues prédéfinies : on choisit une direction, la distance cadre tout le build
const VIEWS = {
  iso: ISO_DIR,
  top: new THREE.Vector3(0, 1, 0.0001),
  front: new THREE.Vector3(0, 0.08, 1),
  side: new THREE.Vector3(1, 0.08, 0),
};
document.querySelectorAll('[data-view]').forEach((btn) => {
  btn.addEventListener('click', () => {
    frameAll(VIEWS[btn.dataset.view]);
    document.querySelectorAll('[data-view]').forEach((b) => b.classList.remove('on'));
    btn.classList.add('on');
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
  exporter.download(`${name}.stl`, exporter.geometryToSTL(geometry));
  updateAsmHint(
    `${name}.stl exporté — ${(geometry.attributes.position.count / 3) | 0} facettes, `
    + 'en millimètres, pièce à plat.',
    'ok',
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
  asm.savePlacements(placements);
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
  asm.savePlacements(placements);
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
window.addEventListener('resize', () => {
  resize();
  if (!$('pane-bp').classList.contains('hidden')) renderBlueprint();
  if (!$('pane-cal').classList.contains('hidden')) renderCalibration();
});
resize();
layoutParts();
frameAll(ISO_DIR);
updatePhotoOpacity();

/* ------------------------------------------------------------------ *
 * Diagnostic
 * ------------------------------------------------------------------ */

/**
 * Exposé uniquement avec ?debug=1 : donne la position monde et la projection
 * écran de chaque perçage, ce qui permet de vérifier un assemblage par la
 * mesure plutôt qu'à l'œil.
 */
if (new URLSearchParams(location.search).has('debug')) {
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
      parts: entries.map((e) => ({
        id: e.mod.meta.id,
        name: e.mod.meta.name,
        y: e.holder.position.y,
        rotY: e.holder.rotation.y,
        holes: (e.markers || []).map((m) => {
          const index = m.userData.anchor.index;
          m.getWorldPosition(v);
          const world = { wx: v.x, wy: v.y, wz: v.z };
          v.project(camera);
          return {
            index,
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
});
