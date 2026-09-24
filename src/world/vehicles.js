// Véhicules : circulation sur les grands axes, bus du dépôt, voitures libres, Vélo'v.
// Conduite par le joueur, collisions, dégâts par paliers, destruction et épaves.
// Rendu instancié : une InstancedMesh par pièce et par type de véhicule.
import * as THREE from 'three';
import { scene } from '../core/renderer.js';
import { P, cam, opt } from '../core/state.js';
import { clamp, lerp, rnd, ri, wrapAngle } from '../core/math.js';
import { CAMERA } from '../core/config.js';
import { MAT, flat, carPaint } from '../render/materials.js';
import { sfx, vib } from '../audio/audio.js';
import { burst, dust, fire, floatTxt, spawnDebris } from '../vfx/effects.js';
import { WORLD, ROADS_V, ROADS_H, PARK, DIST_BY_NAME, groundH } from './layout.js';
import { resolveAABB } from './collision.js';
import { MODELS } from './vehicleModels.js';
import { enemies } from '../enemy/enemies.js';
import { hurtEnemy, hurtPlayer } from '../combat/damage.js';
import { explode } from '../combat/guns.js';
import { addXP } from '../systems/progression.js';
import { hudNote, toast } from '../ui/hud.js';
import { input } from '../core/input.js';

export const vehicles = [];
const CAR_COLS = [0x8f1c1c, 0x1d2f4a, 0xd8d6d0, 0x2c2e31, 0x5b6268, 0x274a38, 0x6b1d2c, 0xb8b3a6];
const SPECS = {
  car: { max: 16, hp: 120, rad: 2.3 },
  bus: { max: 12, hp: 260, rad: 3.4 },
  bike: { max: 9, hp: 45, rad: 0.9 },
};

function makeVehicle(type, x, z, yaw, axis = null, dir = 0) {
  const s = SPECS[type];
  const v = {
    type, x, z, yaw, axis, dir, sp: 0, max: s.max, rad: s.rad, ai: !!axis, kind: 'vehicle',
    hp: s.hp, hpMax: s.hp, tier: 4, dead: false, smokeT: 0, burn: 0, wheelRot: 0, tiltX: 0, tiltZ: 0, sag: 1, glassScale: 1, dark: 1,
    color: type === 'bus' ? 0xc8322c : type === 'bike' ? 0xc8322c : CAR_COLS[ri(0, CAR_COLS.length - 1)], wheelDrop: -1, honkT: 0,
  };
  if (v.ai) v.sp = v.max * 0.55;
  vehicles.push(v);
  return v;
}

function spawnAll() {
  for (let i = 0; i < PARK.busBays; i++) makeVehicle('bus', PARK.x + 9, PARK.z + 22.5 + i * 5, Math.PI / 2);
  for (let i = 0; i < PARK.bays; i++) {
    if (Math.random() < 0.25) continue;
    makeVehicle('car', PARK.x + 4.3 + i * 2.7, PARK.z + 5.6, 0);
    if (Math.random() < 0.8) makeVehicle('car', PARK.x + 4.3 + i * 2.7, PARK.z + 12.6, Math.PI);
  }
  for (const rx of ROADS_V) for (let i = 0; i < 4; i++) {
    const z = rnd(10, WORLD.h - 10), dir = i % 2 ? 1 : -1;
    makeVehicle(Math.random() < 0.25 ? 'bus' : 'car', rx + dir * 2.6, z, dir > 0 ? 0 : Math.PI, 'z', dir);
  }
  for (const rz of ROADS_H) for (let i = 0; i < 4; i++) {
    const x = rnd(10, WORLD.w - 10), dir = i % 2 ? 1 : -1;
    makeVehicle(Math.random() < 0.25 ? 'bus' : 'car', x, rz + dir * 2.6, dir > 0 ? Math.PI / 2 : -Math.PI / 2, 'x', dir);
  }
  const stations = [['Bellecour', -12, 10], ["Presqu'île", 0, 14], ['Part-Dieu', -6, -14], ["Tête d'Or", -20, -16], ['Guillotière', 10, 14], ['Confluence', 8, -18], ['Vieux Lyon', 6, -22], ['Croix-Rousse', -14, 14]];
  for (const [n, dx, dz] of stations) {
    const d = DIST_BY_NAME[n];
    for (let i = 0; i < 4; i++) makeVehicle('bike', d.cx + dx + i * 0.8, d.cz + dz, Math.PI / 2);
  }
  for (const rx of ROADS_V) for (let i = 0; i < 2; i++) makeVehicle('car', rx + 5.2, rnd(20, WORLD.h - 20), 0);
}

// ─── rendu instancié ────────────────────────────────────────────────────────
const R = {};
const _m = new THREE.Matrix4(), _w = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color();

function im(geo, mat, n, name, colored = false) {
  const mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, n));
  mesh.count = n; mesh.castShadow = true; mesh.receiveShadow = true; mesh.name = name; mesh.frustumCulled = false;
  if (colored) mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, n) * 3), 3);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  scene.add(mesh);
  return mesh;
}

export function buildVehicles() {
  spawnAll();
  const by = { car: vehicles.filter((v) => v.type === 'car'), bus: vehicles.filter((v) => v.type === 'bus'), bike: vehicles.filter((v) => v.type === 'bike') };
  for (const [type, list] of Object.entries(by)) list.forEach((v, i) => { v.slot = i; });
  const trim = flat(0x121315, 'plastic', { roughness: 0.55 });
  const busSign = flat(0xffb02e, 'emissive', { emissiveIntensity: 1.2 });
  const car = MODELS.car, bus = MODELS.bus, bike = MODELS.bike;
  R.car = {
    list: by.car, model: car,
    parts: [im(car.body, carPaint(0xffffff), by.car.length, 'voitures', true), im(car.glass, MAT.glass, by.car.length, 'vitres'),
      im(car.trim, trim, by.car.length, 'garnitures'), im(car.head, MAT.headLight, by.car.length, 'phares'), im(car.tail, MAT.redLight, by.car.length, 'feux')],
    wheels: im(MODELS.wheel, MAT.rubber, by.car.length * 4, 'roues'), rims: im(MODELS.rim, MAT.steel, by.car.length * 4, 'jantes'),
  };
  R.bus = {
    list: by.bus, model: bus,
    parts: [im(bus.body, flat(0xffffff, 'paint', { roughness: 0.4 }), by.bus.length, 'bus', true), im(bus.glass, MAT.glass, by.bus.length, 'vitres bus'),
      im(bus.trim, flat(0xe8e2d4, 'paint'), by.bus.length, 'livrée'), im(bus.head, MAT.headLight, by.bus.length, 'phares bus'),
      im(bus.tail, MAT.redLight, by.bus.length, 'feux bus'), im(bus.sign, busSign, by.bus.length, 'girouette')],
    wheels: im(MODELS.wheel, MAT.rubber, by.bus.length * 4, 'roues bus'), rims: im(MODELS.rim, MAT.steel, by.bus.length * 4, 'jantes bus'),
  };
  R.bike = {
    list: by.bike, model: bike,
    parts: [im(bike.body, flat(0xffffff, 'paint', { roughness: 0.4, metalness: 0.4 }), by.bike.length, "vélo'v", true), im(bike.trim, MAT.metalDark, by.bike.length, 'selles')],
    wheels: im(MODELS.thinWheel, MAT.rubber, by.bike.length * 2, "roues vélo'v"), rims: null,
  };
  syncAll();
}

function vehicleMatrix(v) {
  _e.set(v.tiltX, v.yaw, v.tiltZ, 'YXZ');
  _q.setFromEuler(_e);
  _p.set(v.x, groundH(v.x, v.z), v.z);
  _s.set(1, v.sag, 1);
  return _w.compose(_p, _q, _s);
}

function sync(v) {
  const r = R[v.type], i = v.slot, m = r.model;
  const W = vehicleMatrix(v);
  r.parts.forEach((part, k) => {
    if (k === 1 && v.glassScale < 1) { _m.makeScale(1, v.glassScale, 1).premultiply(W); part.setMatrixAt(i, _m); }
    else part.setMatrixAt(i, W);
    if (part.instanceColor) part.setColorAt(i, _c.setHex(v.dead ? 0x1b1a18 : v.color).multiplyScalar(v.dark));
  });
  m.wheels.forEach(([wx, wy, wz], k) => {
    const drop = v.wheelDrop === k ? -0.15 : 0;
    _m.compose(_p.set(wx, wy + drop, wz), _q.setFromEuler(_e.set(v.wheelRot, 0, v.wheelDrop === k ? 0.6 : 0)), _s.set(m.thinWheel ? m.wheelR : 0.22, m.wheelR, m.wheelR));
    _m.premultiply(W);
    const idx = i * m.wheels.length + k;
    r.wheels.setMatrixAt(idx, _m);
    if (r.rims) r.rims.setMatrixAt(idx, _m);
  });
}
function flush() {
  for (const r of Object.values(R)) {
    for (const p of r.parts) { p.instanceMatrix.needsUpdate = true; if (p.instanceColor) p.instanceColor.needsUpdate = true; }
    r.wheels.instanceMatrix.needsUpdate = true;
    if (r.rims) r.rims.instanceMatrix.needsUpdate = true;
  }
}
function syncAll() { for (const v of vehicles) sync(v); flush(); }

// ─── interaction ────────────────────────────────────────────────────────────
export function nearVehicle() {
  let best = null, bd = 3.4;
  for (const v of vehicles) {
    if (v.dead || (v.ai && v.sp > 2)) continue;
    const d = Math.hypot(v.x - P.x, v.z - P.z) - (v.type === 'bike' ? 0 : v.rad * 0.4);
    if (d < bd) { bd = d; best = v; }
  }
  return best;
}

export function toggleRide() {
  if (P.vehicle) {
    const v = P.vehicle;
    P.vehicle = null; v.sp = 0; v.ai = false;
    P.x = v.x + Math.sin(v.yaw + 1.6) * (v.rad * 0.6 + 0.8); P.z = v.z + Math.cos(v.yaw + 1.6) * (v.rad * 0.6 + 0.8);
    P.y = groundH(P.x, P.z); P.rig.visible = true;
    toast('Tu descends', 900);
    return;
  }
  const v = nearVehicle();
  if (!v) { toast('Aucun véhicule à proximité', 900); return; }
  P.vehicle = v; v.ai = false; v.sp = 0; P.action = null;
  if (v.type !== 'bike') P.rig.visible = false;
  cam.dist = CAMERA.vehicleDist[v.type];
  toast(v.type === 'bus' ? 'Bus — en route !' : v.type === 'car' ? 'Au volant !' : 'En selle !', 1100);
  sfx('pick'); vib(20);
}

function vehicleSmash(v, speed) {
  if (speed < 4) return;
  for (const e of enemies) {
    if (e.state === 'dead') continue;
    if (Math.hypot(e.x - v.x, e.z - v.z) < v.rad * 0.7 + e.r + 0.3) {
      const ang = Math.atan2(e.x - v.x, e.z - v.z);
      hurtEnemy(e, speed * (v.type === 'bus' ? 3.2 : v.type === 'car' ? 2.4 : 1.1), ang, speed * 0.5);
      if (e.state !== 'dead') { e.vy = Math.min(9, speed * 0.5); e.h = 0.05; e.state = 'air'; e.stateT = 0; }
      cam.shake = Math.min(1.4, cam.shake + 0.55 * opt.shake); vib(45); sfx('kick', e);
    }
  }
}

export function driveVehicle(v, dt, mag, sprint) {
  if (mag > 0) {
    const ang = Math.atan2(-input.mx, -input.my) + cam.yaw;
    const dy = wrapAngle(ang - v.yaw);
    v.yaw += dy * clamp(dt * (v.type === 'bike' ? 6 : v.type === 'bus' ? 2.2 : 3.4) * (0.4 + 0.6 * Math.min(1, 4 / Math.max(1, v.sp))), 0, 1);
    v.sp = lerp(v.sp, v.max * (0.45 + 0.55 * mag) * (sprint ? 1.3 : 1), 1 - Math.exp(-(v.type === 'bus' ? 1.1 : 1.9) * dt));
    v.tiltZ = lerp(v.tiltZ, -dy * 0.05 * Math.min(1, v.sp / 8), clamp(dt * 5, 0, 1));
  } else { v.sp *= Math.pow(v.type === 'bike' ? 0.12 : 0.35, dt); v.tiltZ *= 0.9; }
  const probe = { x: v.x + Math.sin(v.yaw) * v.sp * dt, z: v.z + Math.cos(v.yaw) * v.sp * dt, r: v.type === 'bike' ? 0.4 : v.rad * 0.5 };
  const bx = probe.x, bz = probe.z;
  resolveAABB(probe);
  if (Math.hypot(probe.x - bx, probe.z - bz) > 0.02 && v.sp > 6) {
    v.sp *= 0.3; cam.shake = Math.min(1, cam.shake + 0.4 * opt.shake); vib(30);
    dust(bx, groundH(bx, bz) + 0.6, bz, 8, 0.8); sfx('kick', v);
    damageVehicle(v, v.sp * 2, 'crash', v.yaw, 1);
  }
  v.x = probe.x; v.z = probe.z;
  vehicleSmash(v, v.sp);
  P.x = v.x; P.z = v.z; P.y = groundH(v.x, v.z); P.yaw = v.yaw; P.vx = 0; P.vz = 0;
  if (v.sp > 8 && Math.random() < 0.3) dust(v.x - Math.sin(v.yaw) * v.rad * 0.8, P.y + 0.15, v.z - Math.cos(v.yaw) * v.rad * 0.8, 1, 0.3);
  cam.fovKick = Math.max(cam.fovKick, clamp((v.sp - 8) / 14, 0, 0.7));
}

export function damageVehicle(v, amount, type, ang, power) {
  if (v.dead) return 0;
  v.hp -= amount;
  const f = clamp(v.hp / v.hpMax, 0, 1), tier = f > 0.75 ? 4 : f > 0.5 ? 3 : f > 0.25 ? 2 : f > 0 ? 1 : 0;
  if (amount >= 1) floatTxt(v.x, groundH(v.x, v.z) + 1.8, v.z, Math.round(amount), '#ffd08a', 12);
  if (tier < v.tier) { v.tier = tier; vehicleTier(v, tier); }
  if (v.hp <= 0) destroyVehicle(v);
  return amount;
}
function vehicleTier(v, t) {
  v.dark = [0.26, 0.42, 0.62, 0.82, 1][t];
  if (t <= 3) { v.glassScale = 0.72; burst(v.x, groundH(v.x, v.z) + 1.3, v.z, 0xbfe4ff, 8, 1); sfx('glass', v); }
  if (t <= 2) { v.tiltZ = rnd(-0.08, 0.08); v.tiltX = rnd(-0.04, 0.04); }
  if (t <= 1) v.wheelDrop = ri(0, MODELS[v.type].wheels.length - 1);
  hudNote(v.type === 'bus' ? 'Bus endommagé' : 'Véhicule endommagé');
}
function destroyVehicle(v) {
  v.dead = true; v.ai = false; v.sp = 0; v.hp = 0;
  const gy = groundH(v.x, v.z);
  if (P.vehicle === v) toggleRide();
  explode(v.x, gy + 1, v.z, v.type === 'bus' ? 11 : 8, v.type === 'bus' ? 90 : 70);
  v.sag = 0.62; v.tiltZ = rnd(-0.2, 0.2); v.glassScale = 0.01;
  spawnDebris(v.x, gy + 1, v.z, 0x2b2a28, 8, 1.2, 6);
  v.burn = 14;
  addXP(35);
  hudNote('Véhicule détruit !');
}

export function updateVehicles(dt) {
  for (const v of vehicles) {
    if (v === P.vehicle) { v.wheelRot -= v.sp * dt / MODELS[v.type].wheelR; sync(v); continue; }
    const gy = groundH(v.x, v.z);
    if (v.burn > 0) {
      v.burn -= dt;
      if (Math.random() < 0.7) fire(v.x + rnd(-0.8, 0.8), gy + rnd(0.4, 1.6), v.z + rnd(-0.8, 0.8), 1);
      if (Math.random() < 0.5) dust(v.x, gy + 1.8, v.z, 1, 0.4, 0x3a3836);
    } else if (v.tier <= 2 && !v.dead) {
      v.smokeT -= dt;
      if (v.smokeT <= 0) { v.smokeT = v.tier <= 1 ? 0.12 : 0.3; dust(v.x, gy + 1.3, v.z, 1, 0.4, 0x6f6f6f); if (v.tier <= 1) fire(v.x, gy + 1.1, v.z, 1); }
    }
    if (v.dead) continue;
    if (v.ai) {
      // freine s'il y a quelqu'un devant sur la voie
      const ahead = [P, ...enemies].some((o) => {
        if (o === P && P.vehicle) return false;
        const rx = o.x - v.x, rz = o.z - v.z, fwd = rx * Math.sin(v.yaw) + rz * Math.cos(v.yaw), side = Math.abs(rx * Math.cos(v.yaw) - rz * Math.sin(v.yaw));
        return fwd > 0 && fwd < v.rad + 7 && side < 1.8 && o.state !== 'dead';
      });
      const target = ahead ? 0 : v.max * 0.55;
      v.sp = lerp(v.sp, target, clamp(dt * (ahead ? 3 : 0.8), 0, 1));
      v.honkT -= dt;
      if (ahead && v.honkT <= 0 && Math.hypot(P.x - v.x, P.z - v.z) < 12) { v.honkT = 4; sfx('horn', v); }
      if (v.axis === 'z') v.z += v.dir * v.sp * dt; else v.x += v.dir * v.sp * dt;
      if (v.x < -14) v.x = WORLD.w + 14; if (v.x > WORLD.w + 14) v.x = -14;
      if (v.z < -14) v.z = WORLD.h + 14; if (v.z > WORLD.h + 14) v.z = -14;
      vehicleSmash(v, v.sp * 0.7);
      if (!P.vehicle && P.invuln <= 0 && v.sp > 3 && Math.hypot(P.x - v.x, P.z - v.z) < v.rad * 0.6 + P.r) {
        hurtPlayer(v.type === 'bus' ? 14 : 9, Math.atan2(P.x - v.x, P.z - v.z));
        floatTxt(P.x, P.y + 2.2, P.z, 'ATTENTION !', '#ff9a5e', 15);
      }
      v.wheelRot -= v.sp * dt / MODELS[v.type].wheelR;
    }
    sync(v);
  }
  flush();
}

export function vehicleCameraDist(v) { return CAMERA.vehicleDist[v.type]; }
