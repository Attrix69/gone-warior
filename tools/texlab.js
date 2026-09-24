// Labo de textures (outil de développement, hors build) : affiche les surfaces
// procédurales cuites sur le GPU, en couleur, normales et ORM, et sur une sphère éclairée.
import * as THREE from 'three';
import { bakeSurface, SURFACE_DEFS } from '../src/render/texgen.js';

const params = new URLSearchParams(location.search);
const names = (params.get('s') || Object.keys(SURFACE_DEFS).filter((n) => n !== 'macro').join(',')).split(',');
const size = +(params.get('size') || 512);
const cell = 200, cols = 4;
const W = cols * cell, H = names.length * cell;
const renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('c'), antialias: true });
renderer.setSize(W, H);
renderer.setScissorTest(true);
const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 10); cam.position.z = 5;
const pcam = new THREE.PerspectiveCamera(30, 1, 0.1, 20); pcam.position.set(0, 0, 4.2);
const scene2d = new THREE.Scene();
const plane = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshBasicMaterial());
scene2d.add(plane);
const scene3d = new THREE.Scene();
scene3d.background = new THREE.Color(0x222222);
const sun = new THREE.DirectionalLight(0xffffff, 3); sun.position.set(-2, 2, 3); scene3d.add(sun);
scene3d.add(new THREE.HemisphereLight(0xbfd4ff, 0x3a3228, 0.8));
const ball = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 2.2), new THREE.MeshStandardMaterial());
ball.rotation.x = -0.9; scene3d.add(ball);
const t0 = performance.now();
const sets = names.map((n) => bakeSurface(renderer, n, size));
console.log('bake ms', (performance.now() - t0).toFixed(0));
names.forEach((n, i) => {
  const s = sets[i], y = H - (i + 1) * cell;
  ['map', 'normalMap', 'ormMap'].forEach((k, j) => {
    plane.material.map = s[k]; plane.material.needsUpdate = true;
    renderer.setViewport(j * cell, y, cell, cell); renderer.setScissor(j * cell, y, cell, cell);
    renderer.render(scene2d, cam);
  });
  const m = ball.material; m.map = s.map; m.normalMap = s.normalMap; m.roughnessMap = s.ormMap; m.aoMap = s.ormMap; m.metalnessMap = s.ormMap; m.metalness = 1; m.needsUpdate = true;
  renderer.setViewport(3 * cell, y, cell, cell); renderer.setScissor(3 * cell, y, cell, cell);
  renderer.render(scene3d, pcam);
});
document.title = 'ready';
