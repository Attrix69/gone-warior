// Application des dégâts : ennemis, véhicules, bâtiments et joueur.
import { P, G, opt, cam } from '../core/state.js';
import { rnd, ri, wrapAngle } from '../core/math.js';
import { COMBAT_SCALE } from '../core/config.js';
import { sfx, vib } from '../audio/audio.js';
import { burst, blood, bloodDecal, ring, floatTxt, comicPop } from '../vfx/effects.js';
import { FX } from '../render/post.js';
import { districtAt } from '../world/layout.js';
import { damageBuilding } from '../world/buildings.js';
import { damageVehicle } from '../world/vehicles.js';
import { ATK, startAction, startFinisher } from './melee.js';
import { hudCombo, damageFrom } from '../ui/hud.js';
import { addPickup } from '../systems/pickups.js';
import { addXP } from '../systems/progression.js';
import { onEnemyKilled } from '../systems/missions.js';
import { ITEM_KEYS } from './items.js';
import { GUN_KEYS } from './guns.js';
import { gameOver } from '../main.js';

const MULT = {
  bullet: { flesh: 1, vehicle: 0.55, building: 0.12 },
  melee: { flesh: 1, vehicle: 0.3, building: 0.05 },
  blast: { flesh: 1.25, vehicle: 1.6, building: 1 },
  crash: { flesh: 1.1, vehicle: 0.8, building: 0.25 },
};

/** Dégâts génériques selon la nature de la cible. */
export function damage(target, amount, type, dir, power) {
  if (!target) return 0;
  const m = MULT[type] || { flesh: 1, vehicle: 0.5, building: 0.2 };
  if (target.kind === 'vehicle') return damageVehicle(target, amount * m.vehicle, type, dir, power);
  if (target.kind === 'building') return damageBuilding(target.i, amount * m.building);
  hurtEnemy(target, amount * m.flesh, dir ?? 0, power ?? 3);
  return amount;
}

export function hurtEnemy(e, dmg, ang, kb, bleed = false) {
  e.hp -= dmg; e.hurtT = 0.28;
  e.side = Math.sign(Math.sin(wrapAngle(ang - e.yaw))) || 1;
  if (e.state !== 'air' && e.state !== 'down' && e.state !== 'stun') { e.state = 'hurt'; e.stateT = 0; }
  if (e.state === 'stun' && dmg >= 20) { e.stun = 0; e.state = 'hurt'; e.stateT = 0; }
  e.vx += Math.sin(ang) * kb; e.vz += Math.cos(ang) * kb;
  e.alert = 1; e.lastSeen = { x: P.x, z: P.z };
  const hy = e.y + e.h + e.height * 0.62;
  const big = dmg >= 30;
  floatTxt(e.x, hy + 0.4, e.z, Math.round(dmg), big ? '#ffd166' : '#f2efe8', big ? 18 : 14);
  burst(e.x, hy, e.z, 0xffd6a0, 5, 0.8);
  blood(e.x, hy - 0.2, e.z, big || bleed ? 14 : 7, big || bleed ? 1.3 : 0.8);
  ring(e.x, hy, e.z, 0xffe0a0, 3.4, 0.22, false);
  sfx('hit', e);
  if (e.hp <= 0 && e.state !== 'dead') { killEnemy(e); return; }
  if (big && !e.boss && e.state !== 'air') { e.state = 'down'; e.stateT = 0; }
}

export function killEnemy(e) {
  const special = !!(ATK[P.action] && ATK[P.action].name) || e.boss;
  if (special) startFinisher(e);
  comicPop(e.x, e.y + e.h + e.height * 0.8, e.z);
  e.state = 'dead'; e.stateT = 0; e.dieT = 3.2;
  e.bar.g.visible = false;
  burst(e.x, e.y + 1, e.z, 0xffb07a, 10, 1.2);
  blood(e.x, e.y + 0.8, e.z, 20, 1.5);
  bloodDecal(e.x, e.z); bloodDecal(e.x + rnd(-0.8, 0.8), e.z + rnd(-0.8, 0.8));
  addXP(e.xp);
  P.kills++;
  const d = districtAt(e.x, e.z);
  d.prot = Math.min(100, d.prot + (e.boss ? 14 : 1.3));
  const near = () => [e.x + rnd(-0.6, 0.6), e.z + rnd(-0.6, 0.6)];
  if (Math.random() < 0.5) addPickup(...near(), 'coin');
  if (Math.random() < 0.24) addPickup(...near(), 'heal');
  if (Math.random() < 0.2) addPickup(...near(), 'gniac');
  if (Math.random() < 0.18) addPickup(...near(), 'item', ITEM_KEYS[ri(1, ITEM_KEYS.length - 1)]);
  if ((e.boss || e.type === 'chef') && Math.random() < 0.8) addPickup(...near(), 'gun', GUN_KEYS[ri(0, GUN_KEYS.length - 1)]);
  if (e.boss) { P.bosses++; addPickup(e.x, e.z, 'rare'); }
  onEnemyKilled(e, d);
}

export function hurtPlayer(dmg, ang) {
  if (P.invuln > 0 || P.dead) return;
  let d = dmg / P.def;
  const perfect = P.block && P.blockT < 0.18;
  if (P.block) {
    d *= perfect ? 0 : 0.25;
    floatTxt(P.x, P.y + 2.1, P.z, perfect ? 'PARADE !' : 'BLOC', perfect ? '#ffe27a' : '#9fd0ff', perfect ? 17 : 14);
    ring(P.x, P.y + 1.2, P.z, perfect ? 0xffe27a : 0x9fd0ff, 2.6, 0.22, false);
    sfx('block', P);
    if (perfect) { P.counterT = 0.6; G.hitstop = Math.max(G.hitstop, 0.08); }
  }
  P.hp -= d;
  P.invuln = 0.55;
  damageFrom(P.x - Math.sin(ang) * 3, P.z - Math.cos(ang) * 3);
  const kb = (P.block ? 3 : 9) * COMBAT_SCALE.kb;
  P.vx -= Math.sin(ang) * kb; P.vz -= Math.cos(ang) * kb;
  if (!P.block) { startAction('hurt'); P.actionDur = 0.35; P.combo = 0; hudCombo(); }
  cam.shake = Math.min(1, cam.shake + (P.block ? 0.15 : 0.5) * opt.shake);
  FX.aberration = Math.max(FX.aberration, P.block ? 0.3 : 1);
  vib(P.block ? 12 : 70);
  if (!P.block) sfx('hurt', P);
  if (d > 0) floatTxt(P.x, P.y + 2.3, P.z, `-${Math.round(d)}`, '#ff7a6a', 15);
  burst(P.x, P.y + 1.2, P.z, 0xff8a6a, 5, 0.8);
  if (!P.block) blood(P.x, P.y + 1.1, P.z, 6, 0.8);
  if (P.hp <= 0) { P.hp = 0; P.dead = true; gameOver(); }
}
