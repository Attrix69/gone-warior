// Labo de scène (outil de développement, hors build) : construit la ville seule et la
// rend depuis un point de vue réglable par l'URL, pour valider rendu et matières.
//   ?q=low|med|high  &t=0.735 (heure)  &cam=x,y,z  &look=x,y,z  &frames=N
import * as THREE from 'three';
import '../src/render/globals.js';
import { createRenderer, resize, scene, camera, onResize } from '../src/core/renderer.js';
import { settings, opt } from '../src/core/state.js';
import { initMaterials } from '../src/render/materials.js';
import { initAtmosphere, update as updateAtmo, ATMO } from '../src/render/atmosphere.js';
import { buildPipeline, renderFrame, resizePipeline } from '../src/render/post.js';
import { buildTerrain } from '../src/world/terrain.js';
import { buildRivers } from '../src/world/water.js';
import { buildBuildings } from '../src/world/buildings.js';
import { buildVehicleModels } from '../src/world/vehicleModels.js';
import { buildVegetation } from '../src/world/vegetation.js';
import { buildProps, updateProps } from '../src/world/props.js';
import { updateLOD } from '../src/world/lod.js';
import { buildLandmarks, updateLandmarks } from '../src/world/landmarks.js';
import { GLOBAL } from '../src/render/globals.js';

const P = new URLSearchParams(location.search);
const num = (k, d) => (P.has(k) ? P.get(k).split(',').map(Number) : d);
(async () => {
  const renderer = createRenderer(document.getElementById('c'));
  settings.quality = P.get('q') || 'med';
  opt.tod = 'cycle';
  ATMO.t = +(P.get('t') || 0.735);
  const t0 = performance.now();
  await initMaterials(renderer, { low: 256, med: 512, high: 1024 }[settings.quality], (s) => console.log(s));
  const t1 = performance.now();
  initAtmosphere();
  const foot = buildBuildings();
  buildTerrain(foot);
  buildRivers();
  buildVehicleModels();
  buildLandmarks();
  buildProps();
  buildVegetation();
  buildPipeline();
  onResize((w, h) => resizePipeline(w, h));
  resize();
  const [cx, cy, cz] = num('cam', [150, 14, 70]);
  const [lx, ly, lz] = num('look', [156, 2, 95]);
  camera.position.set(cx, cy, cz); camera.lookAt(lx, ly, lz);
  const focus = new THREE.Vector3(lx, 0, lz);
  console.log('materials ms', (t1 - t0).toFixed(0), 'world ms', (performance.now() - t1).toFixed(0));
  let f = 0, frames = +(P.get('frames') || 3);
  function loop() {
    GLOBAL.uTime.value += 1 / 60;
    updateAtmo(0, focus);
    updateProps(1, focus);
    updateLOD(camera.position);
    updateLandmarks(1 / 60);
    renderer.info.reset();
    renderFrame(1 / 60);
    if (++f === frames) {
      const i = renderer.info;
      console.log('calls', i.render.calls, 'tris', i.render.triangles, 'geo', i.memory.geometries, 'tex', i.memory.textures, 'progs', i.programs.length);
      const rows = [];
      scene.traverse((o) => { if (o.isMesh && o.visible && o.geometry) { const g = o.geometry; const t = (g.index ? g.index.count : g.attributes.position.count) / 3; const n = o.isInstancedMesh ? o.count : (g.isInstancedBufferGeometry ? g.instanceCount : 1); rows.push([o.name || o.material.type, n, Math.round(t), Math.round(t * n)]); } });
      rows.sort((a, b) => b[3] - a[3]);
      console.log('top tris', JSON.stringify(rows.slice(0, 12)));
      document.title = 'ready';
    }
    requestAnimationFrame(loop);
  }
  loop();
})().catch((e) => { console.error('LAB FAIL', e.stack || e); document.title = 'ready'; });
