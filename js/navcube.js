/**
 * Cube de navigation façon Fusion 360 : glisse pour orbiter la vue
 * principale, clique une face pour orienter la caméra dessus.
 *
 * Rendu dans son propre petit canvas, avec son propre THREE.WebGLRenderer :
 * un second contexte minuscule (quelques dizaines de pixels) reste bien plus
 * simple à isoler qu'un rectangle de ciseaux partagé avec le rendu
 * principal, pour un coût mémoire négligeable.
 */

import * as THREE from 'three';

/**
 * Directions de caméra, dans la même convention que main.js (VIEWS) :
 * -Z est « avant » (cf. js/lib/plate.js), +X est le côté droit.
 */
const FACES = [
  { label: 'DROITE', dir: new THREE.Vector3(1, 0.08, 0) },
  { label: 'GAUCHE', dir: new THREE.Vector3(-1, 0.08, 0) },
  { label: 'DESSUS', dir: new THREE.Vector3(0, 1, 0.0001) },
  { label: 'DESSOUS', dir: new THREE.Vector3(0, -1, 0.0001) },
  { label: 'ARRIÈRE', dir: new THREE.Vector3(0, 0.08, -1) },
  { label: 'AVANT', dir: new THREE.Vector3(0, 0.08, 1) },
];

function faceTexture(label) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#182635';
  g.fillRect(0, 0, 128, 128);
  g.strokeStyle = '#3a5170';
  g.lineWidth = 5;
  g.strokeRect(2.5, 2.5, 123, 123);
  g.fillStyle = '#cfe2f2';
  g.font = '600 15px system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(label, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * @param {object} o
 * @param {HTMLCanvasElement} o.canvas
 * @param {THREE.PerspectiveCamera} o.mainCamera
 * @param {THREE.OrbitControls} o.controls
 * @param {(face: {label:string, dir:THREE.Vector3}) => void} o.frameAll
 *        cadre la vue principale sur la face cliquée
 * @param {() => void} o.invalidate déclenche un rendu de la scène principale
 */
export function createNavCube({ canvas, mainCamera, controls, frameAll, invalidate }) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 20);
  camera.position.set(0, 0, 5.2);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  const materials = FACES.map((f) => new THREE.MeshBasicMaterial({ map: faceTexture(f.label) }));
  const cube = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2), materials);
  scene.add(cube);
  cube.add(new THREE.LineSegments(
    new THREE.EdgesGeometry(cube.geometry),
    new THREE.LineBasicMaterial({ color: 0x0a0e14 }),
  ));

  scene.add(new THREE.AmbientLight(0xffffff, 1));

  function resize() {
    const size = canvas.clientWidth || 84;
    renderer.setSize(size, size, false);
  }
  resize();
  window.addEventListener('resize', resize);

  /**
   * Le cube montre la même orientation que la caméra principale : il
   * « tourne » comme si on regardait la scène depuis un point fixe, donc sa
   * rotation est l'inverse de celle de la caméra.
   */
  function sync() {
    cube.quaternion.copy(mainCamera.quaternion).invert();
  }

  function render() {
    renderer.render(scene, camera);
  }

  /* ------------------------------------------------------------------ *
   * Interaction : clic sur une face, glisser pour orbiter
   * ------------------------------------------------------------------ */

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();

  function faceAt(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    // non récursif : le cube porte un fil de contour en enfant (LineSegments),
    // qui n'a pas de face et ferait échouer la lecture de materialIndex
    const hit = raycaster.intersectObject(cube, false)[0];
    return hit ? FACES[hit.face.materialIndex] : null;
  }

  /** Fait pivoter la caméra PRINCIPALE autour de sa cible, comme un glisser. */
  function orbitMain(dx, dy) {
    const offset = mainCamera.position.clone().sub(controls.target);
    const spherical = new THREE.Spherical().setFromVector3(offset);
    spherical.theta -= dx * 0.012;
    spherical.phi = THREE.MathUtils.clamp(spherical.phi - dy * 0.012, 0.06, Math.PI - 0.06);
    offset.setFromSpherical(spherical);
    mainCamera.position.copy(controls.target).add(offset);
    mainCamera.lookAt(controls.target);
    controls.update();
    invalidate();
  }

  let dragging = false;
  let moved = false;
  let last = { x: 0, y: 0 };

  canvas.style.cursor = 'grab';
  canvas.addEventListener('pointerdown', (e) => {
    dragging = true;
    moved = false;
    last = { x: e.clientX, y: e.clientY };
    canvas.setPointerCapture(e.pointerId);
    canvas.style.cursor = 'grabbing';
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const dx = e.clientX - last.x;
    const dy = e.clientY - last.y;
    if (Math.hypot(dx, dy) > 2) moved = true;
    last = { x: e.clientX, y: e.clientY };
    if (moved) orbitMain(dx, dy);
  });
  canvas.addEventListener('pointerup', (e) => {
    dragging = false;
    canvas.style.cursor = 'grab';
    if (moved) return;
    const face = faceAt(e.clientX, e.clientY);
    if (face) frameAll(face);
  });
  canvas.addEventListener('pointercancel', () => { dragging = false; canvas.style.cursor = 'grab'; });

  return { sync, render, resize };
}
