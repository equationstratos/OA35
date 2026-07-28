/**
 * Viewer du build FPV — TinyHoop MK1.
 * Scène 3D + plan coté, 100 % hors-ligne.
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { PARTS, PLANNED } from './parts/index.js';
import { drawBlueprint } from './blueprint.js';

/* ------------------------------------------------------------------ *
 * Scène
 * ------------------------------------------------------------------ */

const viewport = document.getElementById('viewport');

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
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

// Éclairage studio
scene.add(new THREE.HemisphereLight(0x9ba2aa, 0x05070a, 0.22));

const key = new THREE.DirectionalLight(0xfff4e6, 2.0);
key.position.set(80, 120, 60);
key.castShadow = true;
key.shadow.mapSize.set(2048, 2048);
key.shadow.camera.near = 10;
key.shadow.camera.far = 400;
const d = 110;
Object.assign(key.shadow.camera, { left: -d, right: d, top: d, bottom: -d });
key.shadow.bias = -0.0006;
scene.add(key);

const rim = new THREE.DirectionalLight(0x93b4dd, 0.40);
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

const entries = PARTS.map((mod) => {
  const object = mod.build();
  object.position.y = mod.meta.stackHeight;
  buildRoot.add(object);
  return { mod, object, baseY: mod.meta.stackHeight };
});

/* ------------------------------------------------------------------ *
 * Interface
 * ------------------------------------------------------------------ */

const partList = document.getElementById('part-list');

for (const e of entries) {
  const m = e.mod.meta;
  const dims = m.dims;
  const li = document.createElement('li');
  li.className = 'part';
  li.innerHTML = `
    <label class="part-head">
      <input type="checkbox" checked data-id="${m.id}">
      <span class="idx">${String(m.index).padStart(2, '0')}</span>
      <span class="nm">${m.name}</span>
    </label>
    <dl class="specs">
      <div><dt>Longueur</dt><dd>${dims.length.toFixed(1)} mm</dd></div>
      <div><dt>Largeur</dt><dd>${dims.width.toFixed(1)} mm</dd></div>
      <div><dt>Épaisseur</dt><dd>${dims.thickness.toFixed(1)} mm</dd></div>
      <div><dt>Perçages</dt><dd>${dims.holes}</dd></div>
      <div><dt>Matière</dt><dd>${m.material}</dd></div>
      <div><dt>Échelle</dt><dd>1 px = ${dims.mmPerPx.toFixed(4)} mm</dd></div>
    </dl>`;
  li.querySelector('input').addEventListener('change', (ev) => {
    e.object.visible = ev.target.checked;
  });
  partList.appendChild(li);
}

const plannedList = document.getElementById('planned-list');
for (const p of PLANNED) {
  const li = document.createElement('li');
  li.className = 'planned';
  li.innerHTML = `<span class="idx">${String(p.index).padStart(2, '0')}</span><span>${p.name}</span><em>en attente</em>`;
  plannedList.appendChild(li);
}

// Vues prédéfinies
const VIEWS = {
  iso: [95, 78, 118],
  top: [0, 175, 0.01],
  front: [0, 8, 165],
  side: [165, 8, 0],
};
document.querySelectorAll('[data-view]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const [x, y, z] = VIEWS[btn.dataset.view];
    camera.position.set(x, y, z);
    controls.target.set(0, 4, 0);
    document.querySelectorAll('[data-view]').forEach((b) => b.classList.remove('on'));
    btn.classList.add('on');
  });
});

// Options d'affichage
const optEdges = document.getElementById('opt-edges');
const optGrid = document.getElementById('opt-grid');
const optRotate = document.getElementById('opt-rotate');

optEdges.addEventListener('change', () => {
  buildRoot.traverse((o) => { if (o.name === 'edges') o.visible = optEdges.checked; });
});
optGrid.addEventListener('change', () => { grid.visible = optGrid.checked; });

// Vue éclatée (utile dès la 2e pièce)
const explode = document.getElementById('explode');
explode.addEventListener('input', () => {
  const f = Number(explode.value);
  entries.forEach((e, i) => { e.object.position.y = e.baseY + i * f; });
  document.getElementById('explode-val').textContent = `${f} mm`;
});

// Onglets 3D / plan
const tabs = document.querySelectorAll('.tab');
const panes = { '3d': document.getElementById('pane-3d'), bp: document.getElementById('pane-bp') };
tabs.forEach((t) => t.addEventListener('click', () => {
  tabs.forEach((x) => x.classList.remove('on'));
  t.classList.add('on');
  Object.entries(panes).forEach(([k, el]) => el.classList.toggle('hidden', k !== t.dataset.tab));
  if (t.dataset.tab === 'bp') renderBlueprint();
  else resize();
}));

/* ------------------------------------------------------------------ *
 * Plan coté
 * ------------------------------------------------------------------ */

const bpCanvas = document.getElementById('bp-canvas');
function renderBlueprint() {
  drawBlueprint(bpCanvas, PARTS[0].blueprint(), {
    showGrid: document.getElementById('bp-grid').checked,
    showDims: true,
  });
}
document.getElementById('bp-grid').addEventListener('change', renderBlueprint);

/* ------------------------------------------------------------------ *
 * Boucle
 * ------------------------------------------------------------------ */

function resize() {
  const w = viewport.clientWidth;
  const h = viewport.clientHeight;
  if (!w || !h) return;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', () => { resize(); renderBlueprint(); });
resize();

renderer.setAnimationLoop(() => {
  if (optRotate.checked) buildRoot.rotation.y += 0.0035;
  controls.update();
  renderer.render(scene, camera);
});
