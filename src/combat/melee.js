// Corps à corps : table des attaques, enchaînements (combos), coups spéciaux, finish,
// attaque « Gniac », saisie et lancer d'adversaires, contre-attaque après parade.
import { P, G, cam, unlocked, opt } from '../core/state.js';
import { clamp, rnd, wrapAngle } from '../core/math.js';
import { COMBAT_SCALE, PHYS } from '../core/config.js';
import { sfx, vib } from '../audio/audio.js';
import { burst, fire, ring, floatTxt, flash, comicPop, emit, SPARK } from '../vfx/effects.js';
import { FX } from '../render/post.js';
import { groundH } from '../world/layout.js';
import { enemies } from '../enemy/enemies.js';
import { hurtEnemy } from './damage.js';
import { curItem, curId, consumeItem, launchProjectile } from './items.js';
import { hudCombo, hudNote } from '../ui/hud.js';

const R = COMBAT_SCALE.range, LU = COMBAT_SCALE.lunge, KB = COMBAT_SCALE.kb, LA = COMBAT_SCALE.launch;
const A = (o) => ({ ...o, range: o.range * R, kb: o.kb * KB, lunge: o.lunge * LU, launch: o.launch ? o.launch * LA : 0 });

export const ATK = {
  punchL: A({ dur: 0.3, hit: 0.11, dmg: 11, range: 3.4, arc: 1.0, kb: 6, lunge: 6, sfx: 'punch' }),
  punchR: A({ dur: 0.32, hit: 0.12, dmg: 13, range: 3.5, arc: 1.0, kb: 7, lunge: 6.5, sfx: 'punch' }),
  whip: A({ dur: 0.46, hit: 0.2, dmg: 12, range: 3.4, arc: 1.0, kb: 9, lunge: 3, sfx: 'whip' }),
  kick: A({ dur: 0.48, hit: 0.2, dmg: 19, range: 4.2, arc: 0.9, kb: 12, lunge: 4, sfx: 'kick' }),
  spinKick: A({ dur: 0.62, hit: 0.3, dmg: 24, range: 4.6, arc: 2.2, kb: 14, lunge: 3, sfx: 'kick' }),
  jumpKick: A({ dur: 0.8, hit: 0.34, dmg: 27, range: 4.8, arc: 1.1, kb: 15, lunge: 0, sfx: 'kick', name: 'COUP DE PIED SAUTÉ' }),
  headX: A({ dur: 0.9, hit: 0.46, dmg: 44, range: 4.4, arc: 1.6, kb: 26, lunge: 13, sfx: 'head', name: 'COUP DE TÊTE EXTRÊME' }),
  patate: A({ dur: 0.82, hit: 0.38, dmg: 40, range: 3.9, arc: 1.0, kb: 5, lunge: 5, sfx: 'head', name: 'PATATE LYONNAISE', launch: 17 }),
  throw: A({ dur: 0.5, hit: 0.22, dmg: 0, range: 0, arc: 0, kb: 0, lunge: 0, sfx: 'whiff', isThrow: true }),
  uppercut: A({ dur: 0.6, hit: 0.24, dmg: 33, range: 3.4, arc: 0.95, kb: 6, lunge: 4, sfx: 'head', name: 'TRIPLÉ DU GONE', launch: 13 }),
  sweep: A({ dur: 0.58, hit: 0.24, dmg: 24, range: 4.4, arc: 2.4, kb: 10, lunge: 2, sfx: 'kick', name: 'BALAYAGE', knock: true }),
  shoulder: A({ dur: 0.5, hit: 0.16, dmg: 28, range: 3.6, arc: 1.1, kb: 22, lunge: 16, sfx: 'head', name: "CHARGE D'ÉPAULE" }),
  diveKick: A({ dur: 0.7, hit: 0.18, dmg: 31, range: 4.4, arc: 1.2, kb: 14, lunge: 0, sfx: 'kick', name: 'PIED PLONGEANT' }),
  counter: A({ dur: 0.55, hit: 0.2, dmg: 38, range: 3.8, arc: 1.3, kb: 18, lunge: 8, sfx: 'head', name: 'CONTRE-ATTAQUE', launch: 12 }),
};
// L'animation de la contre-attaque reprend celle de l'uppercut.
export const ANIM_OF = { counter: 'uppercut' };

export function startAction(a) {
  P.action = a; P.actionT = 0; P.hitDone = false;
  const it = curItem();
  P.actionDur = ATK[a] ? ATK[a].dur / (ATK[a].sfx && !ATK[a].isThrow ? it.spd : 1) : 0.5;
}

export function tryAttack(kind) {
  if (P.action || P.dead) return;
  const it = curItem();
  P.hist = P.hist.filter((h) => G.t - h.t < 1.2);
  const seq = P.hist.slice(-2).map((h) => h.k).join(',');
  let a;
  if (kind === 'punch' && P.counterT > 0) a = 'counter';
  else if (P.h > 0.25 && kind === 'kick') a = 'diveKick';
  else if (kind === 'punch' && G.t - (P.dodgeEnd || -9) < 0.45 && !it.whip && !it.spray) a = 'shoulder';
  else if (kind === 'punch' && seq === 'punch,punch' && !it.whip && !it.spray) a = 'uppercut';
  else if (kind === 'kick' && seq === 'kick,punch') a = 'sweep';
  else if (kind === 'kick' && seq === 'punch,punch') a = 'jumpKick';
  else if (kind === 'kick' && seq === 'punch,kick' && unlocked.combo3) a = 'headX';
  else if (kind === 'punch' && seq === 'kick,kick' && unlocked.patate) a = 'patate';
  else if (kind === 'punch') {
    if (it.whip || it.spray) a = 'whip';
    else { a = P.lastPunch === 'R' ? 'punchL' : 'punchR'; P.lastPunch = a === 'punchL' ? 'L' : 'R'; }
  } else { a = P.lastKick && seq.endsWith('kick') ? 'spinKick' : 'kick'; P.lastKick = !P.lastKick; }
  const special = ATK[a].name;
  P.hist.push({ k: kind, t: G.t });
  if (special) P.hist.length = 0;
  P.counterT = 0;
  startAction(a);
  P.combo++; P.comboT = 1.2;
  sfx('whiff', P); // le son d'impact est joué au contact (doHit)
  if (a === 'jumpKick') { P.vy = PHYS.jumpV; P.h = 0.01; P.vx = Math.sin(P.yaw) * 7; P.vz = Math.cos(P.yaw) * 7; }
  else if (a === 'diveKick') { P.vy = -11; P.vx = Math.sin(P.yaw) * 6; P.vz = Math.cos(P.yaw) * 6; }
  else if (a === 'uppercut' || a === 'counter') { P.vy = 4.8; P.h = Math.max(P.h, 0.01); }
  else { const f = ATK[a].lunge; P.vx += Math.sin(P.yaw) * f; P.vz += Math.cos(P.yaw) * f; }
  if (special) { floatTxt(P.x, P.y + 2.6, P.z, special, '#ffd98a', 17); vib(20); }
  hudCombo(true);
}

export function startFinisher(e) {
  if (G.fin) return;
  G.fin = { t: 0, dur: e.boss ? 2.0 : 1.15, x: e.x, y: e.y + 0.9, z: e.z, a: Math.atan2(e.x - P.x, e.z - P.z) };
  G.slow = Math.max(G.slow, e.boss ? 1.6 : 0.85);
  flash(0.22);
  FX.bloomBoost = 0.35;
}

export function doHit() {
  const a = ATK[P.action], it = curItem(), id = curId();
  if (a.isThrow) { launchProjectile(); return; }
  if (it.spray) {
    sfx('spray', P);
    let touched = 0;
    for (let i = 0; i < 10; i++) {
      const sp = rnd(2, 5), ang = P.yaw + rnd(-0.4, 0.4);
      emit(SPARK, P.x + Math.sin(P.yaw) * 0.7, P.y + 1.0, P.z + Math.cos(P.yaw) * 0.7, 0xeaf4ff, 1, 1, 0.5, 1);
      const q = SPARK.data.find((d) => d.life > 0.49);
      if (q) { q.vx = Math.sin(ang) * sp * 1.6; q.vz = Math.cos(ang) * sp * 1.6; q.vy = rnd(-0.5, 1); }
    }
    for (const e of enemies) {
      if (e.state === 'dead') continue;
      const dx = e.x - P.x, dz = e.z - P.z, d = Math.hypot(dx, dz);
      if (d > 4.5 || Math.abs(wrapAngle(Math.atan2(dx, dz) - P.yaw)) > 0.75) continue;
      hurtEnemy(e, 3.5 * P.str, P.yaw, 7 * KB); e.slow = 2.5; touched++;
    }
    if (touched) { cam.shake = Math.min(1, cam.shake + 0.12 * opt.shake); P.gniac = Math.min(100, P.gniac + 2); }
    consumeItem(id, 1);
    return;
  }
  const range = a.range * it.range, arc = a.arc * it.arc;
  let hits = 0;
  for (const e of enemies.slice()) {
    if (e.state === 'dead') continue;
    const dx = e.x - P.x, dz = e.z - P.z, d = Math.hypot(dx, dz);
    if (d > range + e.r) continue;
    if (Math.abs(wrapAngle(Math.atan2(dx, dz) - P.yaw)) > arc) continue;
    if (e.guard > 0 && !a.name && Math.random() < 0.7) { // l'ennemi pare le coup
      floatTxt(e.x, e.y + 2.2, e.z, 'PARÉ', '#cfd6e0', 13); sfx('block', e); burst(e.x, e.y + 1.2, e.z, 0xffffff, 4, 0.6);
      e.vx += Math.sin(P.yaw) * 2; e.vz += Math.cos(P.yaw) * 2; hits++;
      continue;
    }
    let dmg = a.dmg * it.dmg * P.str * (1 + 0.1 * (P.combo - 1)) * rnd(0.92, 1.1);
    if (e.state === 'down') dmg *= 1.25;
    hurtEnemy(e, dmg, P.yaw, a.kb * (it.clang ? 2.1 : 1), it.bleed);
    if (it.clang) { sfx('clang', e); burst(e.x, e.y + e.h + 1.3, e.z, 0xfff0b0, 10, 1.2); if (e.state !== 'dead') { e.stun = 1.4; e.state = 'stun'; e.stateT = 0; } }
    if (a.launch && e.state !== 'dead') { e.vy = a.launch; e.h = Math.max(e.h, 0.05); e.state = 'air'; e.stateT = 0; }
    if (a.knock && e.state !== 'dead' && e.state !== 'air') { e.state = 'down'; e.stateT = 0; }
    hits++;
  }
  if (hits) {
    const big = !!a.name || P.action === 'spinKick';
    sfx(a.sfx, P);
    if (big) comicPop(P.x + Math.sin(P.yaw) * 1.2, P.y + 1.4, P.z + Math.cos(P.yaw) * 1.2);
    G.hitstop = big ? 0.12 : 0.05;
    cam.shake = Math.min(1.3, cam.shake + (big ? 0.7 : 0.25) * opt.shake);
    vib(big ? 55 : 18);
    if (big) { flash(0.12); cam.fovKick = 1.1; cam.roll = (Math.random() < 0.5 ? -1 : 1) * 0.035; FX.aberration = 0.8; }
    P.gniac = Math.min(100, P.gniac + (unlocked.gniacFast ? 4.5 : 3) * hits);
    if ((id !== 'fists' && !it.throw && !it.spray) || id === 'bottle') consumeItem(id, 1);
  } else sfx('whiff', P);
}

export function gniacAttack() {
  if (P.gniac < 100 || P.dead || P.action) return;
  P.gniac = 0;
  startAction('gniac'); P.actionDur = 1.0; P.invuln = 1.2; G.slow = 1.2;
  sfx('gniac'); vib([50, 40, 140]);
  hudNote('« C\'EST LA GNIAC DU GONE ! »', 2200, true);
  setTimeout(() => {
    if (!G.running) return;
    const gy = groundH(P.x, P.z);
    ring(P.x, gy + 0.3, P.z, 0xffb040, 28, 0.9, true); ring(P.x, gy + 0.3, P.z, 0xffffff, 20, 0.6, true);
    burst(P.x, gy + 1, P.z, 0xffd166, 60, 2.2); fire(P.x, gy + 0.6, P.z, 30);
    cam.shake = 1.6 * opt.shake; flash(0.6); cam.fovKick = 1.4; FX.aberration = 1.5;
    for (const e of enemies.slice()) {
      if (e.state === 'dead') continue;
      const d = Math.hypot(e.x - P.x, e.z - P.z);
      if (d < 14) {
        const ang = Math.atan2(e.x - P.x, e.z - P.z);
        hurtEnemy(e, (80 + 45 * P.gn) * (1 - d / 18), ang, 14);
        if (e.state !== 'dead') { e.vy = 7.5; e.h = 0.05; e.state = 'air'; e.stateT = 0; }
      }
    }
  }, 450);
}

// ─── saisie / lancer d'adversaire ───────────────────────────────────────────
export function grabTarget() {
  if (P.carry || P.vehicle || P.gun) return null;
  let best = null, bd = 1.8;
  for (const e of enemies) {
    if (e.state === 'dead' || e.state === 'carried' || e.boss) continue;
    const d = Math.hypot(e.x - P.x, e.z - P.z);
    const weak = e.state === 'down' || e.state === 'stun' || e.hp < e.hpMax * 0.45 || e.type === 'coureur';
    if (d < bd && weak) { bd = d; best = e; }
  }
  return best;
}
export function tryGrab() {
  if (P.carry) { throwCarried(); return; }
  const e = grabTarget();
  if (!e) return;
  P.carry = e; e.state = 'carried'; e.stateT = 0; e.vx = e.vz = 0;
  startAction('grab'); P.actionDur = 0.45;
  sfx('kick', P); vib(20);
  hudNote('Attrapé — appuie encore pour le jeter');
}
export function throwCarried() {
  const e = P.carry;
  if (!e) return;
  P.carry = null;
  const pitch = clamp((cam.pitch - 0.4) * 0.9, -0.5, 0.5);
  const dx = Math.sin(cam.yaw) * Math.cos(pitch), dy = -Math.sin(pitch), dz = Math.cos(cam.yaw) * Math.cos(pitch);
  const heavy = e.type === 'costaud' ? 0.55 : e.type === 'chef' ? 0.7 : 1;
  const sp = (24 + 8 * P.str) * heavy * 0.55;
  e.state = 'air'; e.stateT = 0; e.h = Math.max(e.h, 1.0);
  e.vx = dx * sp; e.vz = dz * sp; e.vy = dy * sp + 5.5;
  e.spinX = rnd(-9, 9); e.spinZ = rnd(-9, 9); e.thrown = true;
  startAction('throwMan'); P.actionDur = 0.5;
  sfx('kick', P); vib(35); cam.shake = Math.min(1, cam.shake + 0.35 * opt.shake);
  hurtEnemy(e, 10 * P.str, cam.yaw, 1);
  P.throws++;
}
