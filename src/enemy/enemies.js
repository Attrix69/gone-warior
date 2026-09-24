// Ennemis : types, apparition, IA (perception, poursuite, encerclement, jetons
// d'attaque, esquive, garde, recherche), animation et barre de vie.
import * as THREE from 'three';
import { scene, camera, Q } from '../core/renderer.js';
import { P, G, cam } from '../core/state.js';
import { clamp, lerp, rnd, ri, wrapAngle } from '../core/math.js';
import { PHYS } from '../core/config.js';
import { sfx, vib } from '../audio/audio.js';
import { burst, blood, ring, floatTxt, dust } from '../vfx/effects.js';
import { WORLD, groundH, inWater, districtAt } from '../world/layout.js';
import { resolveAABB, solidAt, firstHit } from '../world/collision.js';
import { makeRig, disposeRig, setWeapon } from '../player/rig.js';
import { animRig } from '../anim/procedural.js';
import { hurtEnemy, killEnemy, hurtPlayer } from '../combat/damage.js';
import { addXP } from '../systems/progression.js';
import { hudNote } from '../ui/hud.js';

export const ETYPES = {
  classic: { hp: 30, spd: 3.6, dmg: 7, scale: 1, width: 1, xp: 12, n: 'Bandit', cloth: 0x2e6b46, cloth2: 0x1f4d32, pant: 0x232a36, cap: 0x28593c, sight: 30 },
  costaud: { hp: 88, spd: 2.7, dmg: 15, scale: 1.08, width: 1.3, xp: 28, n: 'Costaud', cloth: 0x4f6338, cloth2: 0x36462a, pant: 0x262c22, hair: 0x2b2118, sight: 26, guard: true },
  coureur: { hp: 22, spd: 5.9, dmg: 5, scale: 0.96, width: 0.9, xp: 16, n: 'Coureur', cloth: 0x5fa688, cloth2: 0x2f6e55, pant: 0x243330, cap: 0x1b4f3a, sight: 44, dodge: true },
  chef: { hp: 170, spd: 3.8, dmg: 17, scale: 1.04, width: 1.12, xp: 65, n: 'Chef de bande', cloth: 0x9a6a2a, cloth2: 0x6e4816, pant: 0x2b2419, cap: 0x161616, sight: 34, guard: true },
  boss: { hp: 460, spd: 3.5, dmg: 22, scale: 1.12, width: 1.35, xp: 190, n: 'Boss', cloth: 0x8e2f2b, cloth2: 0x5c1a18, pant: 0x2a1517, hair: 0x18120f, sight: 40, guard: true },
};
const SKINS = [0xd9a97f, 0xc28a62, 0x9b6a45, 0x6e4a31, 0xe2b793];

export const enemies = [];

function makeBar(w) {
  const g = new THREE.Group();
  const bg = new THREE.Mesh(new THREE.PlaneGeometry(w, 0.07), new THREE.MeshBasicMaterial({ color: 0x0b0e14, depthTest: false, transparent: true, opacity: 0.7, fog: false }));
  const fl = new THREE.Mesh(new THREE.PlaneGeometry(w, 0.07), new THREE.MeshBasicMaterial({ color: 0xd8d2c4, depthTest: false, transparent: true, fog: false }));
  fl.position.z = 0.001; g.add(bg, fl); g.renderOrder = 999; g.visible = false;
  return { g, fl, w };
}

export function spawnEnemy(type, x, z, sm = 1) {
  const t = ETYPES[type];
  const rig = makeRig({
    skin: SKINS[ri(0, SKINS.length - 1)], cloth: t.cloth, cloth2: t.cloth2, pant: t.pant, cap: t.cap, hair: t.hair,
    scale: t.scale * Math.min(1.15, sm), width: t.width, lite: Q().civils < 10, name: `ennemi-${type}`,
  });
  scene.add(rig);
  if (type === 'chef') setWeapon(rig, 'baton');
  if (type === 'boss') setWeapon(rig, 'bottle');
  const height = 1.82 * t.scale;
  const bar = makeBar(0.8 * t.width);
  bar.g.position.y = height + 0.35;
  rig.add(bar.g);
  const lm = 1 + (P.lvl - 1) * 0.13;
  const e = {
    type, x, z, y: groundH(x, z), vx: 0, vz: 0, yaw: rnd(0, 6), r: 0.42 * t.width, height, hp: t.hp * sm * lm, hpMax: t.hp * sm * lm,
    spd: t.spd, dmg: t.dmg * lm, xp: Math.round(t.xp * sm), name: t.n, state: 'idle', stateT: 0, atkCd: rnd(0.5, 2), hitDone: false,
    hurtT: 0, dieT: 0, h: 0, vy: 0, burn: 0, stun: 0, slow: 0, side: 0, rig, bar, boss: type === 'boss', phase: 1, defend: false,
    alert: 0, lastSeen: null, searchT: 0, token: false, orbit: Math.random() < 0.5 ? 1 : -1, orbitT: rnd(1, 3), guard: 0, evadeCd: 0,
    sight: t.sight, canGuard: !!t.guard, canDodge: !!t.dodge, stepT: 0, losT: 0, los: false,
  };
  rig.position.set(x, e.y, z);
  enemies.push(e);
  return e;
}

export function removeEnemy(e) {
  scene.remove(e.rig);
  disposeRig(e.rig);
  e.bar.g.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } });
  const i = enemies.indexOf(e);
  if (i >= 0) enemies.splice(i, 1);
  if (P.carry === e) P.carry = null;
}
export function clearEnemies() { while (enemies.length) removeEnemy(enemies[0]); }

export function spawnWave(x, z, n, types) {
  for (let i = 0; i < n; i++) {
    const a = rnd(0, Math.PI * 2), d = rnd(14, 26);
    const px = clamp(x + Math.cos(a) * d, 2, WORLD.w - 2), pz = clamp(z + Math.sin(a) * d, 2, WORLD.h - 2);
    if (groundH(px, pz) < -0.5 || solidAt(px, pz)) { i--; if (Math.random() < 0.02) break; continue; }
    const t = types ? types[ri(0, types.length - 1)] : Math.random() < 0.2 ? 'costaud' : Math.random() < 0.35 ? 'coureur' : 'classic';
    const e = spawnEnemy(t, px, pz);
    e.state = 'chase'; e.alert = 1; e.lastSeen = { x: P.x, z: P.z };
    dust(px, groundH(px, pz) + 0.3, pz, 6, 0.6);
  }
}

/** Bruit (tir, explosion) : alerte les ennemis proches. */
export function makeNoise(x, z, radius) {
  for (const e of enemies) {
    if (e.state === 'dead' || e.state === 'carried') continue;
    if (Math.hypot(e.x - x, e.z - z) < radius) { e.alert = Math.max(e.alert, 0.9); e.lastSeen = { x, z }; if (e.state === 'idle') { e.state = 'search'; e.stateT = 0; } }
  }
}

function bark(e, txt, color) { floatTxt(e.x, e.y + e.height + 0.5, e.z, txt, color, 16); }

/** Nombre d'ennemis autorisés à frapper simultanément. */
function maxTokens() { return enemies.some((e) => e.boss && e.phase === 2 && e.state !== 'dead') ? 3 : 2; }

const _probe = { x: 0, z: 0, r: 0.4 };
/** Direction libre la plus proche de l'angle souhaité (contournement des obstacles). */
function steer(e, ang) {
  for (const off of [0, 0.6, -0.6, 1.2, -1.2, 1.9, -1.9]) {
    const a = ang + off * e.orbit;
    _probe.x = e.x + Math.sin(a) * 1.4; _probe.z = e.z + Math.cos(a) * 1.4;
    if (!solidAt(_probe.x, _probe.z) && !inWater(_probe.x, _probe.z)) return a;
  }
  return ang;
}

function canSee(e, d) {
  e.losT -= 1;
  if (e.losT > 0) return e.los;
  e.losT = 6; // évaluation toutes les 6 images
  if (d > e.sight) { e.los = false; return false; }
  const hit = firstHit(e.x, e.y + 1.6, e.z, P.x, P.y + 1.5, P.z, 0);
  e.los = !hit;
  return e.los;
}

export function updateEnemies(dt) {
  let tokens = 0;
  for (const e of enemies) if (e.token && (e.state === 'wind' || e.state === 'strike' || e.state === 'engage')) tokens++;
  const maxT = maxTokens();
  for (let i = enemies.length - 1; i >= 0; i--) {
    const e = enemies[i];
    e.stateT += dt; e.atkCd -= dt; e.hurtT -= dt; e.guard -= dt; e.evadeCd -= dt;
    const dx = P.x - e.x, dz = P.z - e.z, d = Math.hypot(dx, dz);
    if (e.state === 'dead') {
      e.dieT -= dt;
      if (e.h > 0) { e.vy -= PHYS.gravity * dt; e.h = Math.max(0, e.h + e.vy * dt); e.x += e.vx * dt; e.z += e.vz * dt; resolveAABB(e); e.y = groundH(e.x, e.z); }
      animRig(e.rig, { speed: 0, action: 'die', actionT: 3.2 - e.dieT, actionDur: 1.2 }, dt);
      e.rig.position.set(e.x, e.y + e.h - Math.max(0, 0.6 - e.dieT) * 0.6, e.z);
      if (e.dieT <= 0) removeEnemy(e);
      continue;
    }
    if (d > 150) { removeEnemy(e); continue; }
    if (e.burn > 0) {
      e.burn -= dt; e.hp -= 6 * dt;
      if (Math.random() < 0.5) burst(e.x + rnd(-0.2, 0.2), e.y + e.h + rnd(0.3, 1.4), e.z + rnd(-0.2, 0.2), 0xff8a1f, 1, 0.3);
      if (e.hp <= 0) { killEnemy(e); continue; }
    }
    if (e.slow > 0) e.slow -= dt;
    if (e.boss && e.hp < e.hpMax * 0.5 && e.phase === 1) {
      e.phase = 2; e.spd *= 1.3; e.dmg *= 1.25;
      hudNote("LE BOSS S'ÉNERVE !", 1400, true);
      burst(e.x, e.y + 1.2, e.z, 0xffd166, 18, 1.6);
    }
    const spdMul = e.slow > 0 ? 0.45 : 1;
    if (e.state === 'carried') {
      e.x = P.x - Math.sin(P.yaw) * 0.05; e.z = P.z - Math.cos(P.yaw) * 0.05; e.y = P.y + P.h;
      e.rig.position.set(e.x, e.y + 1.25, e.z); e.rig.rotation.set(0.2, P.yaw + Math.PI / 2, 1.5);
      animRig(e.rig, { speed: 0, action: 'stun', actionT: e.stateT, actionDur: 1 }, dt);
      continue;
    }
    if (e.state === 'air') {
      e.vy -= PHYS.gravity * dt; e.h += e.vy * dt; e.x += e.vx * dt; e.z += e.vz * dt;
      if (e.spinX) { e.rig.rotation.x += e.spinX * dt; e.rig.rotation.z += e.spinZ * dt; }
      e.vx *= Math.pow(0.7, dt); e.vz *= Math.pow(0.7, dt);
      resolveAABB(e); e.y = groundH(e.x, e.z);
      if (e.h <= 0 && inWater(e.x, e.z)) { // à la baille !
        sfx('plouf', e); vib(25);
        for (let k = 0; k < 3; k++) ring(e.x, -0.5, e.z, 0x9fd8ff, 7 + k * 3, 0.6 + k * 0.15, true);
        burst(e.x, 0.1, e.z, 0x9fd8ff, 20, 1.2);
        floatTxt(e.x, 1.4, e.z, 'PLOUF !', '#9fd8ff', 18);
        addXP(e.xp); P.kills++; P.baille = (P.baille || 0) + 1;
        const dd = districtAt(e.x, e.z); dd.prot = Math.min(100, dd.prot + 1.3);
        removeEnemy(e); continue;
      }
      if (e.h <= 0) {
        e.h = 0; e.vy = 0; e.state = 'down'; e.stateT = 0;
        if (e.spinX) { e.rig.rotation.x = 0; e.rig.rotation.z = 0; e.spinX = 0; e.spinZ = 0; }
        if (e.thrown) {
          e.thrown = false; hurtEnemy(e, 16, 0, 1);
          for (const o of enemies) if (o !== e && o.state !== 'dead' && Math.hypot(o.x - e.x, o.z - e.z) < 1.6) hurtEnemy(o, 12, Math.atan2(o.x - e.x, o.z - e.z), 5);
        }
        dust(e.x, e.y + 0.2, e.z, 10, 0.9); blood(e.x, e.y + 0.4, e.z, 6, 0.6);
        cam.shake = Math.min(1, cam.shake + 0.25); sfx('land', e); vib(25);
        e.hp -= 6; floatTxt(e.x, e.y + 1.4, e.z, '6', '#fff', 12);
        if (e.hp <= 0) { killEnemy(e); continue; }
      }
      e.rig.position.set(e.x, e.y + e.h, e.z); e.rig.rotation.y = e.yaw;
      animRig(e.rig, { speed: 0, air: e.h, action: 'launched', actionT: e.stateT, actionDur: 1 }, dt);
      updateBar(e);
      continue;
    }

    let act = null, block = false, moveAng = null, moveSp = 0;
    const faceP = Math.atan2(dx, dz);
    const sees = e.state !== 'down' && e.state !== 'getup' && e.state !== 'stun' ? canSee(e, d) : false;
    if (sees) { e.lastSeen = { x: P.x, z: P.z }; if (e.alert < 1 && e.state === 'idle') bark(e, '!', '#ffcf5a'); e.alert = 1; }
    else e.alert = Math.max(0, e.alert - dt * 0.12);

    switch (e.state) {
      case 'down': act = 'down'; e.vx *= Math.pow(0.05, dt); e.vz *= Math.pow(0.05, dt); if (e.stateT > 1.3) { e.state = 'getup'; e.stateT = 0; } break;
      case 'getup': act = 'getup'; if (e.stateT > 0.55) { e.state = 'chase'; e.stateT = 0; } break;
      case 'stun': act = 'stun'; e.stun -= dt; e.vx *= Math.pow(0.05, dt); e.vz *= Math.pow(0.05, dt); if (e.stun <= 0) { e.state = 'chase'; e.stateT = 0; } break;
      case 'hurt': act = 'hurt'; if (e.stateT > 0.28) { e.state = 'chase'; e.stateT = 0; } break;
      case 'evade': act = 'dodge'; if (e.stateT > 0.42) { e.state = 'chase'; e.stateT = 0; } break;
      case 'idle': {
        // patrouille tranquille
        if (e.alert >= 1 || d < 5) { e.state = 'chase'; e.stateT = 0; break; }
        e.orbitT -= dt;
        if (e.orbitT <= 0) { e.orbitT = rnd(2, 5); e.wander = rnd(0, Math.PI * 2); }
        if (e.wander != null && Math.random() < 0.995) { moveAng = steer(e, e.wander); moveSp = 1.1; }
        break;
      }
      case 'search': {
        const tx = e.lastSeen ? e.lastSeen.x : e.x, tz = e.lastSeen ? e.lastSeen.z : e.z, td = Math.hypot(tx - e.x, tz - e.z);
        if (sees) { e.state = 'chase'; e.stateT = 0; break; }
        if (td > 1.5) { moveAng = steer(e, Math.atan2(tx - e.x, tz - e.z)); moveSp = e.spd * 0.6; }
        else if (e.stateT > 5) { bark(e, '?', '#cfd6e0'); e.state = 'idle'; e.stateT = 0; e.lastSeen = null; }
        break;
      }
      case 'chase':
      case 'engage': {
        if (!sees && e.alert < 0.35 && !e.defend) { e.state = 'search'; e.stateT = 0; e.token = false; bark(e, '?', '#cfd6e0'); break; }
        const reach = e.r + P.r + 0.9;
        // esquive d'un coup imminent (coureurs)
        if (e.canDodge && e.evadeCd <= 0 && P.action && !P.hitDone && d < 2.8 && Math.random() < 0.05) {
          e.state = 'evade'; e.stateT = 0; e.evadeCd = 2.5;
          const a = faceP + Math.PI + rnd(-0.8, 0.8); e.vx = Math.sin(a) * 7; e.vz = Math.cos(a) * 7;
          sfx('dodge', e); break;
        }
        // garde (costauds, chefs, boss)
        if (e.canGuard && P.action && !P.hitDone && d < 2.6 && e.guard <= 0 && Math.random() < 0.035) e.guard = 0.8;
        block = e.guard > 0;
        if (!e.token && tokens < maxT && d < reach + 2.5 && e.atkCd <= 0) { e.token = true; tokens++; }
        if (e.token) {
          if (d > reach) { moveAng = steer(e, faceP); moveSp = e.spd * spdMul * (block ? 0.4 : 1); }
          else if (e.atkCd <= 0 && !block) { e.state = 'wind'; e.stateT = 0; e.hitDone = false; }
        } else if (d < 4.5) {
          // encerclement : tourne autour du joueur en attendant son tour
          e.orbitT -= dt;
          if (e.orbitT <= 0) { e.orbitT = rnd(1.2, 3); e.orbit = -e.orbit; }
          const ringD = 3.4 + (e.type === 'costaud' ? 0.6 : 0);
          const radial = d > ringD + 0.4 ? 1 : d < ringD - 0.4 ? -1 : 0;
          const tang = faceP + (Math.PI / 2) * e.orbit;
          moveAng = steer(e, Math.atan2(Math.sin(tang) + Math.sin(faceP) * radial, Math.cos(tang) + Math.cos(faceP) * radial));
          moveSp = e.spd * 0.45 * spdMul;
        } else {
          let ang = faceP;
          if (e.type === 'coureur') ang += Math.sin(G.t * 2 + e.rig.userData.t) * 0.6;
          if (!sees && e.lastSeen) ang = Math.atan2(e.lastSeen.x - e.x, e.lastSeen.z - e.z);
          moveAng = steer(e, ang); moveSp = e.spd * spdMul;
        }
        break;
      }
      case 'wind': {
        act = 'eWind';
        e.vx *= Math.pow(0.1, dt); e.vz *= Math.pow(0.1, dt);
        e.yaw += wrapAngle(faceP - e.yaw) * clamp(dt * 4, 0, 1);
        if (e.stateT > (e.phase === 2 ? 0.3 : 0.38)) { e.state = 'strike'; e.stateT = 0; }
        break;
      }
      case 'strike': {
        act = 'eStrike';
        if (!e.hitDone && e.stateT > 0.12) {
          e.hitDone = true;
          if (d < e.r + P.r + 1.2 && Math.abs(wrapAngle(faceP - e.yaw)) < 1.2) hurtPlayer(e.dmg, faceP);
          burst(e.x + Math.sin(e.yaw) * e.r * 1.6, e.y + 1.1, e.z + Math.cos(e.yaw) * e.r * 1.6, 0xffd6a0, 3, 0.5);
          sfx('whiff', e);
        }
        if (e.stateT > 0.35) { e.state = 'chase'; e.stateT = 0; e.token = false; e.atkCd = rnd(1, 2) / (e.phase === 2 ? 1.5 : 1); }
        break;
      }
      default: break;
    }
    if (e.state !== 'wind' && e.state !== 'strike' && e.state !== 'chase' && e.state !== 'engage') e.token = false;
    if (moveAng != null && moveSp > 0) {
      e.vx = lerp(e.vx, Math.sin(moveAng) * moveSp, clamp(dt * 6, 0, 1));
      e.vz = lerp(e.vz, Math.cos(moveAng) * moveSp, clamp(dt * 6, 0, 1));
    } else if (!act) { e.vx *= Math.pow(0.2, dt); e.vz *= Math.pow(0.2, dt); }
    if (e.state === 'chase' || e.state === 'engage' || e.state === 'search' || e.state === 'idle') {
      const look = (e.state === 'chase' || e.state === 'engage') && d < 8 ? faceP : moveAng ?? e.yaw;
      e.yaw += wrapAngle(look - e.yaw) * clamp(dt * 7, 0, 1);
    }
    e.x += e.vx * dt; e.z += e.vz * dt;
    e.vx *= Math.pow(0.25, dt); e.vz *= Math.pow(0.25, dt);
    // séparation entre ennemis
    for (const o of enemies) {
      if (o === e || o.state === 'dead') continue;
      const sx = e.x - o.x, sz = e.z - o.z, sd = Math.hypot(sx, sz), min = e.r + o.r + 0.2;
      if (sd > 0.001 && sd < min) { e.x += (sx / sd) * (min - sd) * 0.5; e.z += (sz / sd) * (min - sd) * 0.5; }
    }
    resolveAABB(e);
    if (inWater(e.x, e.z)) { e.x -= e.vx * dt * 2; e.z -= e.vz * dt * 2; }
    e.y = groundH(e.x, e.z);
    e.rig.position.set(e.x, e.y, e.z); e.rig.rotation.y = e.yaw;
    const far = Math.hypot(e.x - camera.position.x, e.z - camera.position.z);
    e.rig.userData.mesh.castShadow = far < 35;
    e.rig.userData.blob.visible = !Q().shadows && far < 40;
    e.lod = (e.lod || 0) + 1;
    if (far > 45 && !act && e.lod % 2) { updateBar(e); continue; }
    animRig(e.rig, {
      speed: Math.hypot(e.vx, e.vz), action: act, actionT: e.stateT, block,
      actionDur: act === 'eWind' ? 0.45 : act === 'eStrike' ? 0.35 : act === 'getup' ? 0.55 : act === 'dodge' ? 0.42 : 0.28, side: e.side,
    }, far > 45 ? dt * 2 : dt);
    updateBar(e);
  }
}

function updateBar(e) {
  const hp = clamp(e.hp / e.hpMax, 0, 1);
  e.bar.g.visible = hp < 0.999 || e.boss || e.type === 'chef';
  e.bar.g.quaternion.copy(camera.quaternion);
  e.bar.g.quaternion.premultiply(e.rig.quaternion.clone().invert());
  e.bar.fl.scale.x = Math.max(0.001, hp);
  e.bar.fl.position.x = -(e.bar.w * (1 - hp)) / 2;
  e.bar.fl.material.color.setHex(e.burn > 0 ? 0xff8a1f : e.boss ? 0xc8332b : e.type === 'chef' ? 0xd99a2b : 0xd8d2c4);
}
