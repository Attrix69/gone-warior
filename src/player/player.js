// Contrôleur du joueur : déplacements, saut, esquive, garde/parade, combos, tir,
// conduite, atterrissages, animation et bruits de pas.
import { P, G, cam, opt, unlocked } from '../core/state.js';
import { clamp, lerp, wrapAngle } from '../core/math.js';
import { PHYS } from '../core/config.js';
import { input, intents, readMove, keyLook } from '../core/input.js';
import { groundH, inWater, surfaceAt } from '../world/layout.js';
import { resolveAABB } from '../world/collision.js';
import { vehicles, driveVehicle } from '../world/vehicles.js';
import { enemies } from '../enemy/enemies.js';
import { animRig } from '../anim/procedural.js';
import { spawnGhost } from './rig.js';
import { ATK, ANIM_OF, startAction, tryAttack, doHit, gniacAttack } from '../combat/melee.js';
import { curItem, curId, tryThrow } from '../combat/items.js';
import { curGun, fireGun } from '../combat/guns.js';
import { hurtEnemy } from '../combat/damage.js';
import { sfx, vib, footstep } from '../audio/audio.js';
import { dust, ring } from '../vfx/effects.js';
import { hudCombo } from '../ui/hud.js';

let stepPhase = 0;

export function updatePlayer(dt) {
  readMove();
  keyLook(dt);
  const w = intents();
  const gun = curGun();
  if (gun && w.rmb) w.aim = true;
  if (!gun && w.rmb) w.kick = true;
  const sprint = w.sprint;

  P.comboT -= dt;
  if (P.comboT <= 0 && P.combo) { P.combo = 0; P.rank = null; hudCombo(); }
  P.invuln -= dt; P.dodgeCd -= dt; P.counterT = Math.max(0, (P.counterT || 0) - dt);
  const blocking = w.block && !P.action && !P.vehicle;
  P.blockT = blocking ? (P.block ? P.blockT + dt : 0) : 0;
  P.block = blocking;

  // fenêtres d'enchaînement : on peut relancer avant la fin de la récupération
  if (P.action && ATK[P.action] && !ATK[P.action].isThrow && P.hitDone && P.actionT > P.actionDur * 0.68 && (w.punch || w.kick) && P.h === 0) P.action = null;
  if (P.action === 'dodge' && P.actionT > P.actionDur * 0.72 && (w.punch || w.kick)) P.action = null;

  P.aim = w.aim && !!gun;
  document.getElementById('crosshair').classList.toggle('aim', P.aim);
  if (gun && !P.vehicle && !P.dead) {
    if (P.aim) P.yaw = cam.yaw;
    if (w.fire && (gun.auto || !P.firePrev)) fireGun();
    P.firePrev = w.fire;
  } else P.firePrev = false;

  if (w.jump && !P.vehicle && !P.dead) {
    if (P.h === 0 && !P.action) {
      P.vy = PHYS.jumpV; P.h = 0.01; P.jumps = 1; P.jumpHeld = true;
      sfx('dodge', P); dust(P.x, P.y + 0.1, P.z, 6, 0.6); vib(12);
    } else if (P.h > 0 && P.jumps === 1 && P.lvl >= 5 && !P.jumpHeld) {
      P.vy = PHYS.doubleJumpV; P.jumps = 2; P.jumpHeld = true;
      sfx('dodge', P); ring(P.x, P.y + P.h, P.z, 0xbfe4ff, 4, 0.3, false);
    }
  }
  if (!w.jump) P.jumpHeld = false;

  if (P.action) {
    P.actionT += dt;
    const a = ATK[P.action];
    if (a && !P.hitDone && P.actionT >= a.hit / (a.isThrow ? 1 : curItem().spd)) { P.hitDone = true; doHit(); }
    if (P.actionT >= P.actionDur && !(P.action === 'jumpKick' && P.h > 0)) P.action = null;
  }
  if (P.action === 'dodge') { P.ghostT = (P.ghostT || 0) - dt; if (P.ghostT <= 0) { P.ghostT = 0.06; spawnGhost(P.rig); } }

  if (P.h > 0 || P.vy > 0) {
    P.vy -= PHYS.gravity * dt; P.h += P.vy * dt;
    if (P.h <= 0) {
      const hard = P.vy < PHYS.hardLanding;
      P.h = 0; P.vy = 0; P.jumps = 0;
      dust(P.x, P.y + 0.1, P.z, hard ? 14 : 6, hard ? 1.2 : 0.6);
      sfx('land', P);
      cam.shake = Math.min(1, cam.shake + (hard ? 0.5 : 0.15) * opt.shake);
      if (hard) {
        ring(P.x, P.y + 0.05, P.z, 0xffd9a0, 7, 0.4, true); vib(30);
        for (const e of enemies) {
          if (e.state === 'dead') continue;
          if (Math.hypot(e.x - P.x, e.z - P.z) < 2.4) {
            hurtEnemy(e, 14 * P.str, Math.atan2(e.x - P.x, e.z - P.z), 5);
            if (e.state !== 'dead' && e.state !== 'air') { e.state = 'down'; e.stateT = 0; }
          }
        }
      }
      if ((P.action === 'jumpKick' || P.action === 'diveKick') && P.actionT > 0.25) P.action = null;
    }
  }

  const raw = Math.min(1, Math.hypot(input.mx, input.my)), DZ = 0.18, mag = raw < DZ ? 0 : Math.min(1, (raw - DZ) / (1 - DZ));
  const riding = !!P.vehicle;
  if (riding) driveVehicle(P.vehicle, dt, mag, sprint);
  if (!riding && (!P.action || P.action === 'dodge')) {
    if (mag > 0) {
      const ang = Math.atan2(-input.mx, -input.my) + cam.yaw;
      const base = (P.block ? PHYS.block : sprint ? PHYS.sprint : PHYS.run) * P.spd, sp = base * (0.35 + 0.65 * mag);
      const accel = clamp(dt * (P.h > 0 ? 4 : 12), 0, 1);
      P.vx = lerp(P.vx, Math.sin(ang) * sp, accel); P.vz = lerp(P.vz, Math.cos(ang) * sp, accel);
      if (!P.aim) {
        const dy = wrapAngle(ang - P.yaw), step = dy * clamp(dt * (Math.abs(dy) > 2 ? 22 : 13), 0, 1);
        P.yaw += step; P.yawRate = lerp(P.yawRate, step / Math.max(dt, 1e-3), clamp(dt * 8, 0, 1));
      }
      if (sprint && P.h === 0 && Math.floor(G.t * 6) !== Math.floor((G.t - dt) * 6)) dust(P.x - Math.sin(P.yaw) * 0.4, P.y + 0.1, P.z - Math.cos(P.yaw) * 0.4, 2, 0.3);
    } else {
      const fr = Math.pow(0.004, dt);
      P.vx *= fr; P.vz *= fr; P.yawRate *= Math.pow(0.01, dt);
    }
  } else if (!riding) {
    if (P.action !== 'jumpKick') { P.vx *= Math.pow(0.15, dt); P.vz *= Math.pow(0.15, dt); }
    P.yawRate *= Math.pow(0.01, dt);
  }
  if (!riding && !P.action) {
    if (w.punch || w.kick) {
      // orientation automatique vers l'adversaire le plus proche
      let best = null, bd = 4.5;
      for (const e of enemies) { if (e.state === 'dead') continue; const d = Math.hypot(e.x - P.x, e.z - P.z); if (d < bd) { bd = d; best = e; } }
      if (best) P.yaw = Math.atan2(best.x - P.x, best.z - P.z);
    }
    if (!gun) { if (w.punch) tryAttack('punch'); else if (w.kick) tryAttack('kick'); else if (w.throw) tryThrow(); }
    else if (w.throw) tryThrow();
    if (w.dodge && P.dodgeCd <= 0 && mag > 0.05) {
      startAction('dodge');
      P.actionDur = unlocked.dash2 ? 0.42 : 0.48; P.dodgeCd = unlocked.dash2 ? 0.62 : 0.9; P.invuln = 0.42;
      const ang = Math.atan2(-input.mx, -input.my) + cam.yaw;
      P.vx = Math.sin(ang) * PHYS.dodge; P.vz = Math.cos(ang) * PHYS.dodge; P.yaw = ang;
      sfx('dodge', P); dust(P.x, P.y + 0.2, P.z, 8, 0.7);
      P.ghostT = 0; P.dodgeEnd = G.t + P.actionDur;
      cam.shake = Math.min(1, cam.shake + 0.1 * opt.shake);
    }
    if (w.gniac) gniacAttack();
  }
  if (!riding) {
    const ox = P.x, oz = P.z;
    P.x += P.vx * dt; P.z += P.vz * dt;
    resolveAABB(P);
    for (const v of vehicles) { // on ne traverse pas les véhicules
      if (v.type === 'bike') continue;
      const dx = P.x - v.x, dz = P.z - v.z, d = Math.hypot(dx, dz), min = v.rad * 0.5 + P.r;
      if (d < min && d > 0.001) { P.x = v.x + (dx / d) * min; P.z = v.z + (dz / d) * min; }
    }
    if (inWater(P.x, P.z)) { P.x = ox; P.z = oz; P.vx *= -0.3; P.vz *= -0.3; }
    P.y = groundH(P.x, P.z);
    // pas
    const spd = Math.hypot(P.vx, P.vz);
    if (P.h === 0 && spd > 0.8) {
      stepPhase += dt * (spd / 0.5) * 0.19;
      if (stepPhase > 1) { stepPhase -= 1; footstep(surfaceAt(P.x, P.z), P, sprint ? 1.3 : 1); }
    }
  }
  if (P.hp < P.hpMax) P.hp = Math.min(P.hpMax, P.hp + dt * 0.35);

  if (riding && P.vehicle.type === 'bike') P.rig.position.set(P.x, P.y + 0.3, P.z);
  else P.rig.position.set(P.x, P.y + P.h, P.z);
  const spinOff = P.action === 'spinKick' ? Math.PI * 2 * clamp((P.actionT / P.actionDur - 0.2) / 0.5, 0, 1) : 0;
  P.rig.rotation.y = P.yaw + spinOff;
  if (riding) {
    P.rig.rotation.y = P.yaw;
    P.rig.visible = P.vehicle.type === 'bike';
    animRig(P.rig, { speed: P.vehicle.type === 'bike' ? Math.min(4.5, P.vehicle.sp * 0.4) : 0 }, dt);
  } else {
    animRig(P.rig, {
      speed: Math.hypot(P.vx, P.vz), air: P.h, action: ANIM_OF[P.action] || P.action, actionT: P.actionT, actionDur: P.actionDur, block: P.block,
      gun: !!gun && !P.action, kick: P.gunKick || 0, carry: !!P.carry, lean: clamp(P.yawRate * 0.12, -0.6, 0.6),
      beltSway: curId() === 'belt' ? Math.sin(G.t * 4) * 0.15 + Math.hypot(P.vx, P.vz) * 0.08 : null,
    }, dt);
  }
  P.rig.userData.blob.visible = !riding && !P.rig.userData.mesh.castShadow;
}
