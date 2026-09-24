// Caméras : jeu (bras à ressort anti-collision, cadrage de combat, inertie, secousses
// en bruit continu), finish cinématique (profondeur de champ), intro, menu.
import * as THREE from 'three';
import { camera } from './renderer.js';
import { P, G, cam } from './state.js';
import { clamp, lerp, damp, ease } from './math.js';
import { CAMERA } from './config.js';
import { groundH } from '../world/layout.js';
import { firstHit, allHits } from '../world/collision.js';
import { setBuildingHidden } from '../world/buildings.js';
import { setOccluderHidden } from '../world/landmarks.js';
import { enemies } from '../enemy/enemies.js';
import { FX } from '../render/post.js';

const target = new THREE.Vector3(), desired = new THREE.Vector3(), look = new THREE.Vector3();
let armLen = CAMERA.dist;
const hidden = new Set(), nextHidden = new Set(), hits = [];

// bruit lissé (somme de sinus) pour des secousses organiques
function shakeNoise(t, seed) {
  return Math.sin(t * 23.1 + seed) * 0.5 + Math.sin(t * 37.7 + seed * 2.3) * 0.3 + Math.sin(t * 61.3 + seed * 4.1) * 0.2;
}

/** Nombre d'ennemis actifs proches : sert à reculer la caméra en combat. */
function combatFactor() {
  let n = 0;
  for (const e of enemies) if (e.state !== 'dead' && Math.hypot(e.x - P.x, e.z - P.z) < 12) n += e.boss ? 2 : 1;
  return clamp(n / 3, 0, 1);
}

export function gameCamera(dt) {
  setFade(0);
  if (G.fin) { finisherCamera(dt); return; }
  FX.dofActive = false;
  const sp = Math.hypot(P.vx, P.vz);
  const cf = combatFactor();
  cam.combat = damp(cam.combat || 0, cf, 1.5, dt);
  cam.bob = damp(cam.bob, P.h > 0 ? 0 : Math.sin(G.t * 10.5) * clamp((sp - 4) / 5, 0, 1) * 0.05, 10, dt);
  let dist, pitchBias;
  if (P.vehicle) { dist = CAMERA.vehicleDist[P.vehicle.type] + clamp(P.vehicle.sp / 16, 0, 1) * 2; pitchBias = 0.06; }
  else {
    dist = lerp(CAMERA.dist, CAMERA.combatDist, cam.combat) + clamp((sp - 5) / 4, 0, 1) * CAMERA.sprintExtra;
    pitchBias = cam.combat * (CAMERA.combatPitch - CAMERA.pitch) * 0.5;
  }
  cam.dist = damp(cam.dist, dist, 2.5, dt);
  const pitch = clamp(cam.pitch + pitchBias, CAMERA.minPitch, CAMERA.maxPitch);
  const h = P.vehicle ? (P.vehicle.type === 'bus' ? 3.2 : 1.6) : CAMERA.height;
  target.set(P.x, P.y + P.h * 0.6 + h + cam.bob, P.z);
  // légère avance dans la direction du mouvement
  target.x += P.vx * 0.06; target.z += P.vz * 0.06;
  desired.set(
    target.x - Math.sin(cam.yaw) * Math.cos(pitch) * cam.dist,
    target.y + Math.sin(pitch) * cam.dist,
    target.z - Math.cos(cam.yaw) * Math.cos(pitch) * cam.dist,
  );
  // bras à ressort : rétracté devant les monuments / grands obstacles non effaçables
  const hit = firstHit(target.x, target.y, target.z, desired.x, desired.y, desired.z, 0.35);
  let want = cam.dist;
  if (hit && !hit.o.occluder) want = Math.max(1.4, cam.dist * hit.t - 0.3);
  armLen = want < armLen ? damp(armLen, want, 25, dt) : damp(armLen, want, 3, dt);
  const k = armLen / Math.max(cam.dist, 0.001);
  desired.lerpVectors(target, desired, k);
  desired.y = Math.max(desired.y, groundH(desired.x, desired.z) + 0.5);
  const follow = 1 - Math.exp(-(P.action ? 16 : 10) * dt);
  cam.x = lerp(cam.x, desired.x, follow); cam.y = lerp(cam.y, desired.y, follow); cam.z = lerp(cam.z, desired.z, follow);
  camera.position.set(cam.x, cam.y, cam.z);
  const s = cam.shake * 0.12;
  look.set(target.x + shakeNoise(G.t, 1) * s, target.y + shakeNoise(G.t, 7) * s * 0.7, target.z + shakeNoise(G.t, 13) * s);
  camera.lookAt(look);
  cam.shake *= Math.pow(0.02, dt);
  cam.fovKick *= Math.pow(0.02, dt);
  cam.roll *= Math.pow(0.01, dt);
  camera.rotation.z += cam.roll + shakeNoise(G.t, 21) * s * 0.02;
  const fovT = CAMERA.fov + cam.fovKick * 7 + clamp((sp - 5) / 4, 0, 1) * 4 + (P.aim ? -14 : 0);
  camera.fov = damp(camera.fov, fovT, 6, dt);
  camera.updateProjectionMatrix();
  updateOcclusion(target);
}

/** Bâtiments et monuments entre la caméra et le joueur : fondu tramé. */
function updateOcclusion(t) {
  nextHidden.clear();
  allHits(camera.position.x, camera.position.y, camera.position.z, t.x, t.y - 0.6, t.z, hits, 0.2);
  for (const o of hits) nextHidden.add(o.occluder);
  for (const occ of hidden) if (!nextHidden.has(occ)) setHidden(occ, false);
  for (const occ of nextHidden) if (!hidden.has(occ)) setHidden(occ, true);
  hidden.clear();
  for (const occ of nextHidden) hidden.add(occ);
}
function setHidden(occ, v) {
  if (occ.kind === 'bld') setBuildingHidden(occ.i, v);
  else setOccluderHidden(occ, v);
}

function finisherCamera(dt) {
  const f = G.fin;
  f.t += dt;
  const p = clamp(f.t / f.dur, 0, 1), r = lerp(2.8, 5.5, p), a = f.a + p * 1.5;
  camera.position.set(f.x + Math.sin(a) * r, f.y + 1.2 + p * 1.2, f.z + Math.cos(a) * r);
  camera.lookAt(f.x, f.y + 0.3, f.z);
  camera.fov = lerp(38, 54, p);
  camera.updateProjectionMatrix();
  FX.dofActive = true; FX.dofFocus = r;
  if (p >= 1) {
    G.fin = null;
    cam.x = camera.position.x; cam.y = camera.position.y; cam.z = camera.position.z;
    FX.bloomBoost = 0; FX.dofActive = false;
  }
}

// plans du menu : lents travellings entre lieux emblématiques, fondus au noir
const SHOTS = [
  { from: [141, 4.5, 152], to: [148, 4.8, 149], look: [180, 11, 137], look2: [182, 12, 139], fov: 50 }, // Bellecour
  { from: [112, 4, 126], to: [111.5, 4.6, 117], look: [104, 10, 40], look2: [103, 11, 40], fov: 55 },   // la Saône
  { from: [138, 30, 152], to: [131, 33, 132], look: [50, 22, 105], look2: [50, 24, 102], fov: 48 },    // Vieux Lyon et Fourvière
  { from: [297, 3.2, 118], to: [301, 3.6, 114], look: [321, 34, 66], look2: [321, 40, 66], fov: 55 },  // Part-Dieu
].map((s) => ({ ...s, from: new THREE.Vector3(...s.from), to: new THREE.Vector3(...s.to), look: new THREE.Vector3(...s.look), look2: new THREE.Vector3(...s.look2) }));
const SHOT_LEN = 13, FADE = 0.9;
let fadeEl = null, fadeVal = -1;
export function setFade(v) {
  if (v === fadeVal) return;
  fadeVal = v;
  fadeEl = fadeEl || document.getElementById('fade');
  if (fadeEl) fadeEl.style.opacity = v.toFixed(3);
}

export function menuCamera() {
  const u = G.t / SHOT_LEN, s = SHOTS[Math.floor(u) % SHOTS.length], p = u - Math.floor(u);
  camera.position.lerpVectors(s.from, s.to, p);
  look.lerpVectors(s.look, s.look2, p);
  camera.lookAt(look);
  camera.fov = s.fov; camera.updateProjectionMatrix();
  const tIn = p * SHOT_LEN, tOut = (1 - p) * SHOT_LEN;
  setFade(clamp(Math.max(1 - tIn / FADE, 1 - tOut / FADE), 0, 1));
  FX.dofActive = false;
}

export function cineCamera(dt) {
  setFade(0);
  const c = G.cine;
  c.t += dt;
  const p = ease(clamp(c.t / c.dur, 0, 1));
  camera.position.lerpVectors(c.from, c.to, p);
  look.lerpVectors(c.lookFrom, c.lookTo, p);
  camera.lookAt(look);
  camera.fov = lerp(44, CAMERA.fov, p);
  camera.updateProjectionMatrix();
}

/** Place la caméra derrière le joueur sans transition (début de partie). */
export function snapCamera() {
  cam.dist = CAMERA.dist; armLen = cam.dist;
  cam.x = P.x - Math.sin(cam.yaw) * Math.cos(cam.pitch) * cam.dist;
  cam.z = P.z - Math.cos(cam.yaw) * Math.cos(cam.pitch) * cam.dist;
  cam.y = P.y + CAMERA.height + Math.sin(cam.pitch) * cam.dist;
  hidden.clear();
}
