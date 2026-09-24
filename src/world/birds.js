// Pigeons : picorent au sol par petits groupes et s'envolent à l'approche.
import * as THREE from 'three';
import { scene, Q } from '../core/renderer.js';
import { P } from '../core/state.js';
import { lerp, rnd, ri } from '../core/math.js';
import { DISTRICTS, groundH } from './layout.js';
import { flat } from '../render/materials.js';
import { rbox } from './geo.js';
import { noise } from '../audio/audio.js';

export const flocks = [];
let bodyGeo, wingGeo, mat, headMat;

function bird() {
  const m = new THREE.Mesh(bodyGeo, mat);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.045, 6, 5), headMat);
  head.position.set(0, 0.06, 0.1); m.add(head);
  const wl = new THREE.Mesh(wingGeo, mat), wr = new THREE.Mesh(wingGeo, mat);
  wl.position.set(-0.08, 0.02, 0); wr.position.set(0.08, 0.02, 0);
  m.add(wl, wr);
  return { m, wl, wr };
}

function place(f) {
  for (let k = 0; k < 30; k++) {
    const d = DISTRICTS[ri(0, DISTRICTS.length - 1)];
    f.x = d.x + rnd(6, d.w - 6); f.z = d.z + rnd(6, d.d - 6);
    if (groundH(f.x, f.z) > -0.5) break;
  }
  f.g.position.set(f.x, groundH(f.x, f.z), f.z);
  f.state = 'ground'; f.t = 0;
  for (const b of f.birds) { b.m.position.set(rnd(-1.2, 1.2), 0.06, rnd(-1.2, 1.2)); b.m.rotation.set(0, rnd(0, 6), 0); b.wl.rotation.z = 0; b.wr.rotation.z = 0; }
}

export function buildBirds() {
  bodyGeo = rbox(0.12, 0.09, 0.22, 0.04);
  wingGeo = rbox(0.16, 0.02, 0.12, 0.01);
  mat = flat(0x7d838c, 'matte', { roughness: 0.8 });
  headMat = flat(0x4f5d62, 'matte');
  const n = Q().civils < 10 ? 4 : 9;
  for (let i = 0; i < n; i++) {
    const g = new THREE.Group(); scene.add(g);
    const birds = [];
    for (let k = 0; k < 7; k++) { const b = bird(); g.add(b.m); birds.push({ ...b, ph: rnd(0, 6), vx: 0, vy: 0, vz: 0 }); }
    const f = { g, birds, x: 0, z: 0, state: 'ground', t: 0 };
    f.scare = () => {
      f.state = 'fly'; f.t = 0;
      for (const b of f.birds) { b.vy = rnd(3.5, 5.5); b.vx = rnd(-3, 3); b.vz = rnd(-3, 3); }
      noise(0.5, 0.06, 1800, 'bandpass', f);
    };
    place(f);
    flocks.push(f);
  }
}

export function updateBirds(dt) {
  for (const f of flocks) {
    if (f.state === 'ground') {
      for (const b of f.birds) {
        b.ph += dt * 2;
        b.m.position.y = 0.06 + Math.max(0, Math.sin(b.ph * 3)) * 0.02;
        b.m.rotation.x = Math.max(0, Math.sin(b.ph * 2.3)) * 0.5; // picore
        b.m.rotation.y += Math.sin(b.ph) * dt * 0.5;
      }
      if (Math.hypot(P.x - f.x, P.z - f.z) < 5) f.scare();
    } else {
      f.t += dt;
      for (const b of f.birds) {
        b.ph += dt * 24;
        b.m.position.x += b.vx * dt; b.m.position.z += b.vz * dt; b.m.position.y += b.vy * dt;
        b.vy = lerp(b.vy, 2.2, dt);
        const fl = Math.sin(b.ph) * 0.9;
        b.wl.rotation.z = fl; b.wr.rotation.z = -fl;
        b.m.rotation.y = Math.atan2(b.vx, b.vz); b.m.rotation.x = -0.3;
      }
      if (f.t > 7) place(f);
    }
  }
}
