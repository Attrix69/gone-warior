// Objets de mêlée et de lancer, inventaire et projectiles (y compris grenades/roquettes).
import { P, cam, opt } from '../core/state.js';
import { clamp, rnd, wrapAngle } from '../core/math.js';
import { scene } from '../core/renderer.js';
import { sfx, vib } from '../audio/audio.js';
import { burst, fire, ring, floatTxt, dust } from '../vfx/effects.js';
import { groundH } from '../world/layout.js';
import { solidAt } from '../world/collision.js';
import { vehicles } from '../world/vehicles.js';
import { flocks } from '../world/birds.js';
import { enemies } from '../enemy/enemies.js';
import { hurtEnemy } from './damage.js';
import { startAction } from './melee.js';
import { itemMesh } from './itemModels.js';
import { setWeapon, limbPos } from '../player/rig.js';
import { explode } from './guns.js';
import { refreshItemUI } from '../ui/hud.js';

export const ITEMS = {
  fists: { n: 'Poings', ico: 'fist', dmg: 1, range: 1, arc: 1, spd: 1 },
  knuckle: { n: 'Poing américain', ico: 'knuckle', dmg: 1.75, range: 1, arc: 1, spd: 1.05, dur: 45, bleed: true },
  belt: { n: 'Ceinture', ico: 'belt', dmg: 1.25, range: 1.75, arc: 1.7, spd: 1.05, dur: 30, whip: true },
  baton: { n: 'Matraque', ico: 'baton', dmg: 1.9, range: 1.3, arc: 1, spd: 0.9, dur: 24 },
  bottle: { n: 'Bouteille', ico: 'bottle', dmg: 2.0, range: 1.05, arc: 1, spd: 0.95, dur: 6, throw: true, tdmg: 30, gain: 2 },
  lighter: { n: 'Briquet', ico: 'lighter', dmg: 1, range: 1, arc: 1, spd: 1.3, dur: 99, throw: true, tdmg: 8, effect: 'burn', gain: 3 },
  andouillette: { n: 'Andouillette', ico: 'sausage', dmg: 1.15, range: 1, arc: 1, spd: 1, dur: 99, throw: true, tdmg: 14, effect: 'stun', gain: 3 },
  tarte: { n: 'Tarte aux pralines', ico: 'pie', dmg: 1, range: 1, arc: 1, spd: 1, dur: 99, throw: true, tdmg: 18, effect: 'sugar', gain: 2 },
  baguette: { n: 'Baguette', ico: 'bread', dmg: 1.15, range: 1.85, arc: 1.15, spd: 1.3, dur: 14 },
  poele: { n: 'Poêle', ico: 'pan', dmg: 2.3, range: 1.2, arc: 1.15, spd: 0.85, dur: 22, clang: true },
  parapluie: { n: 'Parapluie', ico: 'umbrella', dmg: 1.0, range: 1.55, arc: 1.25, spd: 1.5, dur: 30 },
  extincteur: { n: 'Extincteur', ico: 'extinguisher', dmg: 0.55, range: 1.6, arc: 2.0, spd: 1.35, dur: 44, spray: true },
  petanque: { n: 'Boule de pétanque', ico: 'ball', dmg: 2.6, range: 1, arc: 1, spd: 0.8, dur: 5, throw: true, tdmg: 36, effect: 'bounce', gain: 3 },
  quenelle: { n: 'Quenelle', ico: 'dumpling', dmg: 1, range: 1, arc: 1, spd: 1, dur: 99, throw: true, tdmg: 24, effect: 'nantua', gain: 3 },
  corne: { n: 'Corne de brume', ico: 'horn', dmg: 0.8, range: 1, arc: 1, spd: 1, dur: 99, throw: true, tdmg: 0, effect: 'horn', gain: 2 },
};
export const ITEM_KEYS = Object.keys(ITEMS);

export const curItem = () => ITEMS[P.items[P.itemIdx]] || ITEMS.fists;
export const curId = () => P.items[P.itemIdx] || 'fists';

export function cycleItem() {
  P.itemIdx = (P.itemIdx + 1) % P.items.length;
  refreshItemUI();
  sfx('pick');
}
export function giveItem(id) {
  const it = ITEMS[id];
  if (!P.items.includes(id)) P.items.push(id);
  P.qty[id] = (P.qty[id] || 0) + (it.throw ? it.gain : it.dur);
  P.itemIdx = P.items.indexOf(id);
  refreshItemUI();
  floatTxt(P.x, P.y + 2.1, P.z, `${it.n} !`, '#cfe6ff', 15);
}
export function consumeItem(id, n = 1) {
  P.qty[id] = (P.qty[id] || 0) - n;
  if (P.qty[id] <= 0) {
    floatTxt(P.x, P.y + 1.6, P.z, `${ITEMS[id].n}${ITEMS[id].throw ? ' épuisé' : ' cassé'} !`, '#ff9a5e');
    P.items.splice(P.items.indexOf(id), 1);
    delete P.qty[id];
    P.itemIdx = 0;
  }
  refreshItemUI();
}
export function equipCurrentItem() { setWeapon(P.rig, curId()); }

export function tryThrow() {
  if (P.action || P.dead) return;
  const it = curItem();
  if (!it.throw || (P.qty[curId()] || 0) <= 0) return;
  let best = null, bd = 22;
  for (const e of enemies) {
    if (e.state === 'dead') continue;
    const d = Math.hypot(e.x - P.x, e.z - P.z);
    if (d < bd && Math.abs(wrapAngle(Math.atan2(e.x - P.x, e.z - P.z) - cam.yaw)) < 1.3) { bd = d; best = e; }
  }
  P.yaw = best ? Math.atan2(best.x - P.x, best.z - P.z) : cam.yaw;
  P.throwTarget = best;
  startAction('throw');
}

// ─── projectiles ────────────────────────────────────────────────────────────
export const projs = [];

export function launchProjectile() {
  const id = curId(), it = ITEMS[id];
  if (!it || !it.throw) return;
  if (id === 'corne') {
    consumeItem(id, 1); P.throws++;
    sfx('horn'); vib([40, 30, 80]);
    const gy = groundH(P.x, P.z);
    ring(P.x, gy + 0.6, P.z, 0xffd166, 22, 0.7, true); ring(P.x, gy + 0.6, P.z, 0xffffff, 14, 0.5, true);
    cam.shake = Math.min(1, cam.shake + 0.5 * opt.shake);
    for (const e of enemies) {
      if (e.state === 'dead') continue;
      if (Math.hypot(e.x - P.x, e.z - P.z) < 12) {
        hurtEnemy(e, 6 * P.str, Math.atan2(e.x - P.x, e.z - P.z), 2.8);
        if (e.state !== 'dead' && e.state !== 'air') { e.stun = 2.8; e.state = 'stun'; e.stateT = 0; }
        floatTxt(e.x, e.y + 2.2, e.z, 'TUUUT !', '#ffd166', 14);
      }
    }
    for (const f of flocks) if (f.state === 'ground' && Math.hypot(f.x - P.x, f.z - P.z) < 30) f.scare();
    P.gniac = Math.min(100, P.gniac + 8);
    return;
  }
  consumeItem(id, 1); P.throws++;
  const start = limbPos(P.rig, 'fistR').clone();
  const tgt = P.throwTarget && P.throwTarget.state !== 'dead' ? P.throwTarget : null;
  let tx, tz, ty;
  if (tgt) { tx = tgt.x; tz = tgt.z; ty = tgt.y + tgt.h + 0.9; } else { tx = P.x + Math.sin(P.yaw) * 12; tz = P.z + Math.cos(P.yaw) * 12; ty = groundH(tx, tz) + 0.5; }
  const dist = Math.hypot(tx - start.x, tz - start.z), T = clamp(dist / 18, 0.3, 1.0), g = 16;
  const m = itemMesh(id); m.position.copy(start); scene.add(m);
  projs.push({ id, m, x: start.x, y: start.y, z: start.z, vx: (tx - start.x) / T, vy: (ty - start.y) / T + 0.5 * g * T, vz: (tz - start.z) / T, g, life: 3.5, spin: rnd(3, 8), ax: rnd(0, 6), bounces: id === 'petanque' ? 3 : 0 });
  sfx('whiff', P); vib(10);
}

function impactProj(p, e) {
  const it = ITEMS[p.id], x = p.x, y = p.y, z = p.z, pos = { x, z };
  const dirTo = (o) => Math.atan2(o.x - P.x, o.z - P.z);
  const area = (r, f, cb) => { for (const o of enemies) { if (o.state === 'dead') continue; if (Math.hypot(o.x - x, o.z - z) < r) cb(o, o === e ? 1 : f); } };
  if (p.id === 'bottle') {
    sfx('glass', pos); burst(x, y, z, 0x6fe0a0, 18, 1); burst(x, y, z, 0xffffff, 6, 0.7);
    if (e) hurtEnemy(e, it.tdmg * P.str, dirTo(e), 5.5);
    area(1.6, 0.45, (o, f) => { if (o !== e) hurtEnemy(o, it.tdmg * P.str * f, Math.atan2(o.x - x, o.z - z), 2.8); });
  } else if (p.id === 'lighter') {
    sfx('fire', pos); fire(x, y, z, 18);
    if (e) { hurtEnemy(e, it.tdmg * P.str, dirTo(e), 1.6); e.burn = 4; floatTxt(e.x, e.y + 2.2, e.z, 'EN FEU !', '#ff9a2f', 15); }
  } else if (p.id === 'andouillette') {
    sfx('splat', pos); burst(x, y, z, 0x9ad37a, 14, 0.8); burst(x, y, z, 0x8a5a33, 6, 0.6);
    if (e) { hurtEnemy(e, it.tdmg * P.str, dirTo(e), 5); if (e.state !== 'dead' && e.state !== 'air') { e.stun = 2.4; e.state = 'stun'; e.stateT = 0; } floatTxt(e.x, e.y + 2.2, e.z, 'BEURK !', '#9ad37a', 16); }
  } else if (p.id === 'tarte') {
    sfx('splat', pos); burst(x, y, z, 0xff8fc8, 20, 1.1); ring(x, groundH(x, z) + 0.2, z, 0xff8fc8, 7, 0.5, true);
    area(2.4, 0.6, (o, f) => { hurtEnemy(o, it.tdmg * P.str * f, Math.atan2(o.x - x, o.z - z), 2.2); o.slow = 3.5; });
    floatTxt(x, y + 0.7, z, 'PRALINÉ !', '#ff8fc8', 16);
  } else if (p.id === 'petanque') {
    sfx('clang', pos); burst(x, y, z, 0xdfe6f2, 12, 1);
    if (e) { hurtEnemy(e, it.tdmg * P.str, dirTo(e), 8.8); if (e.state !== 'dead') { e.stun = 1.6; e.state = 'stun'; e.stateT = 0; } floatTxt(x, y + 0.8, z, 'CARREAU !', '#dfe6f2', 16); }
  } else if (p.id === 'quenelle') {
    sfx('splat', pos); burst(x, y, z, 0xe8d9b0, 12, 0.8); burst(x, y, z, 0xe86a5a, 10, 1); ring(x, groundH(x, z) + 0.2, z, 0xe86a5a, 6, 0.5, true);
    area(2.1, 0.55, (o, f) => { hurtEnemy(o, it.tdmg * P.str * f, Math.atan2(o.x - x, o.z - z), 3.3); o.slow = 2.5; if (o === e && o.state !== 'dead' && o.state !== 'air') { o.stun = 1.5; o.state = 'stun'; o.stateT = 0; } });
    floatTxt(x, y + 0.7, z, 'SAUCE NANTUA !', '#e86a5a', 15);
  }
  cam.shake = Math.min(1, cam.shake + 0.3 * opt.shake);
  P.gniac = Math.min(100, P.gniac + 5);
  removeProj(p);
}

function removeProj(p) {
  scene.remove(p.m);
  const i = projs.indexOf(p);
  if (i >= 0) projs.splice(i, 1);
}
export function clearProjectiles() { while (projs.length) removeProj(projs[0]); }

export function updateProjectiles(dt) {
  for (let i = projs.length - 1; i >= 0; i--) {
    const p = projs[i];
    p.life -= dt; p.vy -= p.g * dt;
    if (p.expl) {
      if (p.rocket) { fire(p.x, p.y, p.z, 2); dust(p.x, p.y, p.z, 1, 0.2, 0x8a8a8a); }
      else if (p.fuse != null) { p.fuse -= dt; if (Math.floor(p.fuse * 6) % 2 === 0) burst(p.x, p.y, p.z, 0xff5a4a, 1, 0.2); }
      let boom = (p.fuse != null && p.fuse <= 0) || p.life <= 0;
      const hitE = enemies.find((e) => e.state !== 'dead' && Math.hypot(e.x - p.x, e.z - p.z) < e.r + 0.4 && Math.abs(e.y + e.h + 0.9 - p.y) < 1.2);
      const hitV = vehicles.find((v) => !v.dead && Math.hypot(v.x - p.x, v.z - p.z) < v.rad && p.y < groundH(p.x, p.z) + 2.5);
      if (p.rocket && (hitE || hitV || p.y <= groundH(p.x, p.z) + 0.15 || solidAt(p.x, p.z, p.y))) boom = true;
      if (!p.rocket && p.y <= groundH(p.x, p.z) + 0.1 && p.vy < 0 && p.bounces > 0) {
        p.bounces--; p.y = groundH(p.x, p.z) + 0.1; p.vy = Math.abs(p.vy) * 0.42; p.vx *= 0.6; p.vz *= 0.6; sfx('bounce', p);
      }
      if (!p.rocket && solidAt(p.x, p.z, p.y)) { p.vx *= -0.4; p.vz *= -0.4; }
      if (boom) { explode(p.x, p.y, p.z, p.expl.radius, p.expl.power); removeProj(p); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.ax += (p.spin || 0) * dt;
      p.m.position.set(p.x, p.y, p.z);
      if (p.rocket) p.m.lookAt(p.x + p.vx, p.y + p.vy, p.z + p.vz); else p.m.rotation.set(p.ax, p.ax * 0.7, 0);
      continue;
    }
    p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.ax += p.spin * dt;
    p.m.position.set(p.x, p.y, p.z); p.m.rotation.set(p.ax, p.ax * 0.7, 0);
    if (p.id === 'lighter' && Math.random() < 0.6) fire(p.x, p.y, p.z, 1);
    const hit = enemies.find((e) => e.state !== 'dead' && Math.hypot(e.x - p.x, e.z - p.z) < e.r + 0.35 && Math.abs(e.y + e.h + 0.9 - p.y) < 1.2);
    const gy = groundH(p.x, p.z);
    if (!hit && p.bounces > 0 && p.y <= gy + 0.12 && p.vy < 0) {
      p.bounces--; p.y = gy + 0.12; p.vy = Math.abs(p.vy) * 0.45; p.vx *= 0.8; p.vz *= 0.8;
      sfx('bounce', p); dust(p.x, gy + 0.1, p.z, 4, 0.4);
      for (const o of enemies) if (o.state !== 'dead' && Math.hypot(o.x - p.x, o.z - p.z) < 1.1) hurtEnemy(o, 10 * P.str, Math.atan2(o.x - p.x, o.z - p.z), 4.4);
      continue;
    }
    if (hit || p.y <= gy + 0.1 || p.life <= 0 || solidAt(p.x, p.z, p.y)) impactProj(p, hit);
  }
}
