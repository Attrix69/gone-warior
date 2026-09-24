// Armes à feu : munitions, tir (balistique par rayon), recul, douilles, traceurs,
// éclair de bouche (lumière réelle), grenades, roquettes et explosions.
import * as THREE from 'three';
import { P, cam, opt } from '../core/state.js';
import { clamp, lerp, rnd } from '../core/math.js';
import { scene } from '../core/renderer.js';
import { sfx, vib } from '../audio/audio.js';
import { burst, fire, ring, dust, floatTxt, flash, scorch, emit, SPARK, spawnDebris } from '../vfx/effects.js';
import { FX } from '../render/post.js';
import { flat } from '../render/materials.js';
import { groundH } from '../world/layout.js';
import { OBST, segmentBox } from '../world/collision.js';
import { BLD } from '../world/buildings.js';
import { vehicles } from '../world/vehicles.js';
import { enemies } from '../enemy/enemies.js';
import { damage, hurtPlayer } from './damage.js';
import { projs, curId } from './items.js';
import { gunMesh } from './itemModels.js';
import { setGunMesh, setWeapon } from '../player/rig.js';
import { refreshItemUI, hudNote } from '../ui/hud.js';

export const GUNS = {
  pistol: { n: 'Pistolet', ico: 'pistol', dmg: 28, rpm: 340, auto: false, mag: 12, res: 72, spread: 0.012, reload: 1.1, range: 90, recoil: 0.55, pellets: 1, kind: 'bullet' },
  pistolA: { n: 'Pistolet auto', ico: 'pistol', dmg: 18, rpm: 640, auto: true, mag: 18, res: 108, spread: 0.024, reload: 1.2, range: 80, recoil: 0.38, pellets: 1, kind: 'bullet' },
  rifle: { n: "Fusil d'assaut", ico: 'rifle', dmg: 25, rpm: 680, auto: true, mag: 30, res: 180, spread: 0.018, reload: 1.9, range: 130, recoil: 0.5, pellets: 1, kind: 'bullet' },
  smg: { n: 'Mitraillette', ico: 'smg', dmg: 14, rpm: 900, auto: true, mag: 32, res: 192, spread: 0.032, reload: 1.5, range: 70, recoil: 0.3, pellets: 1, kind: 'bullet' },
  shotgun: { n: 'Fusil à pompe', ico: 'shotgun', dmg: 13, rpm: 75, auto: false, mag: 6, res: 36, spread: 0.075, reload: 2.4, range: 34, recoil: 1.5, pellets: 8, kind: 'bullet' },
  grenade: { n: 'Grenade', ico: 'grenade', dmg: 0, rpm: 60, auto: false, mag: 1, res: 6, reload: 0.7, range: 0, recoil: 0.2, kind: 'grenade', radius: 9, power: 120 },
  bazooka: { n: 'Bazooka', ico: 'rocket', dmg: 0, rpm: 34, auto: false, mag: 1, res: 5, reload: 2.6, range: 0, recoil: 2.4, kind: 'rocket', radius: 13, power: 220 },
};
export const GUN_KEYS = Object.keys(GUNS);

export const curGun = () => (P.gun ? GUNS[P.gun] : null);
export function ammoOf(id) {
  P.ammo[id] = P.ammo[id] || { mag: GUNS[id].mag, res: GUNS[id].res };
  return P.ammo[id];
}
export function giveGun(id, bonus) {
  if (!P.guns.includes(id)) P.guns.push(id);
  const a = ammoOf(id);
  a.res = Math.min(GUNS[id].res * 2, a.res + (bonus || GUNS[id].mag * 2));
  selectGun(id);
  floatTxt(P.x, P.y + 2.1, P.z, `${GUNS[id].n} !`, '#ffd98a', 16);
  sfx('pick');
}
export function selectGun(id) {
  P.gun = id; P.reloadT = 0; P.fireT = 0;
  if (id) setGunMesh(P.rig, id); else setWeapon(P.rig, curId());
  refreshItemUI();
}
export function cycleGun(d = 1) {
  if (!P.guns.length) return;
  let i = P.guns.indexOf(P.gun);
  i = (i + d + P.guns.length + 1) % (P.guns.length + 1);
  selectGun(i === P.guns.length ? null : P.guns[i]);
}

// ─── visée / balistique ─────────────────────────────────────────────────────
export function aimDir() {
  const pitch = clamp((cam.pitch - 0.3) * 0.85, -0.5, 0.5);
  let dx = Math.sin(cam.yaw) * Math.cos(pitch), dy = -Math.sin(pitch), dz = Math.cos(cam.yaw) * Math.cos(pitch);
  // assistance légère : accroche l'ennemi le plus proche du réticule
  let best = null, bs = P.aim ? 0.985 : 0.975;
  for (const e of enemies) {
    if (e.state === 'dead') continue;
    const ex = e.x - P.x, ey = e.y + e.h + 1.0 - (P.y + P.h + 1.35), ez = e.z - P.z, L = Math.hypot(ex, ey, ez);
    if (L > 60 || L < 0.8) continue;
    const dot = (ex * dx + ey * dy + ez * dz) / L;
    if (dot > bs) { bs = dot; best = { x: ex / L, y: ey / L, z: ez / L }; }
  }
  if (best) {
    dx = lerp(dx, best.x, 0.55); dy = lerp(dy, best.y, 0.55); dz = lerp(dz, best.z, 0.55);
    const L = Math.hypot(dx, dy, dz); dx /= L; dy /= L; dz /= L;
  }
  return [dx, dy, dz];
}
const _mp = new THREE.Vector3();
export function muzzlePos() {
  const r = P.rig.userData;
  if (r.gunNode) {
    P.rig.updateMatrixWorld(true);
    r.gunNode.getWorldPosition(_mp);
    if (Number.isFinite(_mp.x) && Math.abs(_mp.x - P.x) < 2) return [_mp.x, _mp.y, _mp.z];
  }
  return [P.x, P.y + P.h + 1.35, P.z];
}

/** Rayon balistique : ennemis, véhicules, obstacles (bâtiments, monuments), sol. */
export function rayHit(ox, oy, oz, dx, dy, dz, range) {
  let best = null, bd = range;
  const sphereTest = (cx, cy, cz, r, obj, kind) => {
    const px = cx - ox, py = cy - oy, pz = cz - oz, t = px * dx + py * dy + pz * dz;
    if (t < 0 || t > bd) return;
    const qx = px - dx * t, qy = py - dy * t, qz = pz - dz * t;
    if (qx * qx + qy * qy + qz * qz <= r * r) { bd = t; best = { obj, kind, t, x: ox + dx * t, y: oy + dy * t, z: oz + dz * t }; }
  };
  for (const e of enemies) if (e.state !== 'dead' && e.state !== 'carried') sphereTest(e.x, e.y + e.h + e.height * 0.55, e.z, e.r + 0.25, e, 'enemy');
  for (const v of vehicles) if (!v.dead) sphereTest(v.x, groundH(v.x, v.z) + 1, v.z, v.rad * 0.8, v, 'vehicle');
  const ex = ox + dx * range, ey = oy + dy * range, ez = oz + dz * range;
  for (const o of OBST) {
    if (o.h <= 0) continue;
    if (Math.abs(o.x + o.w / 2 - ox) > range + o.w || Math.abs(o.z + o.d / 2 - oz) > range + o.d) continue;
    const t = segmentBox(ox, oy, oz, ex, ey, ez, o, 0);
    if (t > 0 && t * range < bd) {
      bd = t * range;
      const kind = o.occluder && o.occluder.kind === 'bld' ? 'building' : 'wall';
      best = { obj: kind === 'building' ? { kind: 'building', i: o.occluder.i } : null, kind, t: bd, x: ox + dx * bd, y: oy + dy * bd, z: oz + dz * bd };
    }
  }
  if (dy < -0.001) {
    const t = (groundH(ox + dx * 10, oz + dz * 10) - oy) / dy;
    if (t > 0 && t < bd) { bd = t; best = { obj: null, kind: 'ground', t, x: ox + dx * t, y: oy + dy * t, z: oz + dz * t }; }
  }
  return best;
}

// ─── effets de tir ──────────────────────────────────────────────────────────
const beams = [], shells = [];
let beamMat = null, shellMat = null, beamGeo = null, shellGeo = null;
export const muzzleLight = new THREE.PointLight(0xffb060, 0, 9, 2);
muzzleLight.name = 'éclair de bouche';

function beam(x1, y1, z1, x2, y2, z2) {
  let b = beams.find((q) => !q.on);
  if (!b) {
    if (beams.length > 8) return;
    beamGeo ??= new THREE.BoxGeometry(0.018, 0.018, 1);
    beamMat ??= new THREE.MeshBasicMaterial({ color: 0xffe2a0, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
    const m = new THREE.Mesh(beamGeo, beamMat.clone());
    m.visible = false; scene.add(m);
    b = { m, on: false, t: 0 }; beams.push(b);
  }
  const L = Math.hypot(x2 - x1, y2 - y1, z2 - z1) || 1;
  b.m.position.set((x1 + x2) / 2, (y1 + y2) / 2, (z1 + z2) / 2);
  b.m.scale.set(1, 1, L); b.m.lookAt(x2, y2, z2);
  b.m.visible = true; b.on = true; b.t = 0.05;
}
function shell(x, y, z, ang) {
  let sh = shells.find((q) => !q.on);
  if (!sh) {
    if (shells.length > 12) return;
    shellGeo ??= new THREE.CylinderGeometry(0.012, 0.012, 0.05, 6).rotateX(Math.PI / 2);
    shellMat ??= flat(0xd9a53c, 'metal', { roughness: 0.3 });
    const m = new THREE.Mesh(shellGeo, shellMat);
    m.visible = false; scene.add(m);
    sh = { m, on: false }; shells.push(sh);
  }
  Object.assign(sh, { on: true, life: 1.4, x, y, z, vx: Math.cos(ang) * rnd(1, 2), vy: rnd(1.2, 2.2), vz: -Math.sin(ang) * rnd(1, 2), rx: rnd(-14, 14), rz: rnd(-14, 14) });
  sh.m.visible = true;
}
function muzzle(x, y, z, scale = 1) {
  burst(x, y, z, 0xffe9a0, 4, 0.8);
  fire(x, y, z, 3);
  muzzleLight.position.set(x, y, z);
  muzzleLight.intensity = 30 * scale;
}
export function updateShots(dt) {
  for (const b of beams) { if (!b.on) continue; b.t -= dt; if (b.t <= 0) { b.on = false; b.m.visible = false; } else b.m.material.opacity = (b.t / 0.05) * 0.8; }
  for (const sh of shells) {
    if (!sh.on) continue;
    sh.life -= dt; sh.vy -= 14 * dt;
    sh.x += sh.vx * dt; sh.y += sh.vy * dt; sh.z += sh.vz * dt;
    const gy = groundH(sh.x, sh.z) + 0.015;
    if (sh.y < gy) { sh.y = gy; sh.vy *= -0.35; sh.vx *= 0.6; sh.vz *= 0.6; }
    sh.m.position.set(sh.x, sh.y, sh.z); sh.m.rotation.x += sh.rx * dt; sh.m.rotation.z += sh.rz * dt;
    if (sh.life <= 0) { sh.on = false; sh.m.visible = false; }
  }
  muzzleLight.intensity *= Math.exp(-dt * 40);
  if (P.fireT > 0) P.fireT -= dt;
  P.gunKick = (P.gunKick || 0) * Math.pow(0.004, dt);
  if (P.reloadT > 0) {
    P.reloadT -= dt;
    if (P.reloadT <= 0) {
      const g = curGun();
      if (g) { const a = ammoOf(P.gun), take = Math.min(g.mag - a.mag, a.res); a.mag += take; a.res -= take; sfx('pick'); refreshItemUI(); }
    }
  }
}

// ─── tir ────────────────────────────────────────────────────────────────────
export function fireGun() {
  const g = curGun();
  if (!g || P.reloadT > 0 || P.dead) return;
  const a = ammoOf(P.gun);
  if (a.mag <= 0) { startReload(); return; }
  if (P.fireT > 0) return;
  P.fireT = 60 / g.rpm; a.mag--;
  P.yaw = cam.yaw;
  const [mx, my, mz] = muzzlePos(), [dx, dy, dz] = aimDir();
  if (g.kind === 'bullet') {
    sfx(g.rpm > 500 ? 'smg' : 'shot', P);
    muzzle(mx, my, mz, g.pellets > 1 ? 1.6 : 1);
    shell(mx, my, mz, P.yaw);
    for (let i = 0; i < (g.pellets || 1); i++) {
      const sx = dx + rnd(-g.spread, g.spread), sy = dy + rnd(-g.spread, g.spread) * 0.7, sz = dz + rnd(-g.spread, g.spread);
      const L = Math.hypot(sx, sy, sz), ux = sx / L, uy = sy / L, uz = sz / L;
      const hit = rayHit(mx, my, mz, ux, uy, uz, g.range);
      const ex = hit ? hit.x : mx + ux * g.range, ey = hit ? hit.y : my + uy * g.range, ez = hit ? hit.z : mz + uz * g.range;
      if (i === 0 || g.pellets < 4) beam(mx, my, mz, ex, ey, ez);
      if (hit) impactShot(hit, g, Math.atan2(ux, uz));
    }
    P.gniac = Math.min(100, P.gniac + 1.2);
  } else if (g.kind === 'grenade') throwGrenade(dx, dy, dz);
  else if (g.kind === 'rocket') fireRocket(mx, my, mz, dx, dy, dz);
  cam.shake = Math.min(1.4, cam.shake + g.recoil * 0.3 * opt.shake);
  cam.fovKick = Math.max(cam.fovKick, g.recoil * 0.35);
  cam.pitch = clamp(cam.pitch - g.recoil * 0.01, 0.02, 1.15);
  vib(Math.min(60, g.recoil * 26));
  P.gunKick = Math.min(1, (P.gunKick || 0) + g.recoil * 0.55);
  if (a.mag <= 0) startReload();
  refreshItemUI();
}

function impactShot(hit, g, ang) {
  const { x, y, z } = hit;
  if (hit.kind === 'enemy') { damage(hit.obj, g.dmg, 'bullet', ang, 3.8); }
  else if (hit.kind === 'vehicle') { damage(hit.obj, g.dmg, 'bullet', ang, 2.2); burst(x, y, z, 0xffe0a0, 5, 1); emit(SPARK, x, y, z, 0xfff2c0, 3, 1.2, 0.25, 11); sfx('clang', hit); }
  else if (hit.kind === 'building') { damage(hit.obj, g.dmg, 'bullet', ang, 1); dust(x, y, z, 5, 0.6, 0xcfc4b0); burst(x, y, z, 0xd8cdb8, 3, 0.6); }
  else { dust(x, y + 0.05, z, 4, 0.5, 0xb8ad98); burst(x, y + 0.05, z, 0xcfc3a8, 3, 0.5); }
}

export function startReload() {
  const g = curGun();
  if (!g) return;
  const a = ammoOf(P.gun);
  if (a.mag >= g.mag || a.res <= 0) return;
  P.reloadT = g.reload;
  sfx('reload', P);
  hudNote('Rechargement…');
}

function throwGrenade(dx, dy, dz) {
  const [mx, my, mz] = muzzlePos();
  const m = gunMesh('grenade'); m.position.set(mx, my, mz); scene.add(m);
  const sp = 12;
  projs.push({ id: '_grenade', m, x: mx, y: my, z: mz, vx: dx * sp, vy: dy * sp + 4, vz: dz * sp, g: 16, life: 2.6, fuse: 2.4, spin: 9, ax: rnd(0, 6), bounces: 4, expl: GUNS.grenade });
  P.throws++;
}
function fireRocket(mx, my, mz, dx, dy, dz) {
  const m = gunMesh('bazooka'); m.scale.setScalar(0.25); m.position.set(mx, my, mz); scene.add(m);
  projs.push({ id: '_rocket', m, x: mx, y: my, z: mz, vx: dx * 40, vy: dy * 40, vz: dz * 40, g: 1.5, life: 3.2, spin: 0, ax: 0, bounces: 0, rocket: true, expl: GUNS.bazooka });
  sfx('rocket', P); burst(mx, my, mz, 0xffb040, 12, 1.4);
  P.vx -= dx * 3.3; P.vz -= dz * 3.3;
}

export function explode(x, y, z, radius, power) {
  const gy = groundH(x, z);
  ring(x, y, z, 0xfff0c0, radius * 1.6, 0.45, false);
  ring(x, gy + 0.2, z, 0xffb040, radius * 2.2, 0.7, true);
  burst(x, y, z, 0xffd166, 50, 2.2); fire(x, y, z, 40);
  dust(x, y, z, 24, 1.6, 0x8a8a8a); dust(x, gy + 0.5, z, 20, 2.2, 0x6e6a64);
  spawnDebris(x, y + 0.3, z, 0x2b2a28, 8, 1.4, 5);
  flash(0.45); cam.shake = Math.min(2, cam.shake + 1.2 * opt.shake); cam.fovKick = 1.5; FX.aberration = 1.6; vib([40, 30, 90]);
  sfx('boom', { x, z });
  muzzleLight.position.set(x, y + 1, z); muzzleLight.intensity = 400;
  scorch(x, z, radius * 0.45);
  for (const e of enemies) {
    if (e.state === 'dead') continue;
    const d = Math.hypot(e.x - x, e.z - z);
    if (d > radius) continue;
    const f = 1 - d / radius, ang = Math.atan2(e.x - x, e.z - z);
    damage(e, power * f, 'blast', ang, 10 * f);
    if (e.state !== 'dead') { e.vy = Math.min(12, 6 + 8.4 * f); e.h = Math.max(e.h, 0.05); e.state = 'air'; e.stateT = 0; e.spinX = rnd(-9, 9); e.spinZ = rnd(-9, 9); }
  }
  for (const v of vehicles) {
    if (v.dead) continue;
    const d = Math.hypot(v.x - x, v.z - z);
    if (d < radius * 1.2) damage(v, power * (1 - d / (radius * 1.2)), 'blast', Math.atan2(v.x - x, v.z - z), 10);
  }
  for (let i = 0; i < BLD.length; i++) {
    const b = BLD[i];
    if (Math.abs(b.x - x) > radius + 12 || Math.abs(b.z - z) > radius + 12) continue;
    const d = Math.hypot(b.x - x, b.z - z) - Math.max(b.w, b.d) * 0.5;
    if (d < radius) damage({ kind: 'building', i }, power * (1 - Math.max(0, d) / radius), 'blast', 0, 1);
  }
  const pd = Math.hypot(P.x - x, P.z - z);
  if (pd < radius) {
    const f = 1 - pd / radius, ang = Math.atan2(P.x - x, P.z - z);
    hurtPlayer(power * 0.35 * f, ang + Math.PI);
    P.vx += Math.sin(ang) * 12 * f; P.vz += Math.cos(ang) * 12 * f; P.vy = Math.max(P.vy, 5.5 * f); P.h = Math.max(P.h, 0.05);
  }
}
