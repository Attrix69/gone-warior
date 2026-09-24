// Passants : flânent dans leur quartier, fuient les bagarres, les tirs et les véhicules.
import { scene, camera, Q } from '../core/renderer.js';
import { P } from '../core/state.js';
import { clamp, lerp, rnd, ri, wrapAngle } from '../core/math.js';
import { DISTRICTS, groundH, districtAt, inWater } from './layout.js';
import { resolveAABB, solidAt } from './collision.js';
import { makeRig, disposeRig } from '../player/rig.js';
import { animRig } from '../anim/procedural.js';
import { enemies } from '../enemy/enemies.js';
import { sfx } from '../audio/audio.js';

export const civils = [];
const OUTFITS = [
  [0x5a4a3c, 0x3b2f27, 0x2d3140], [0x3f5d78, 0xe0dbd0, 0x22293a], [0x7a3b46, 0x4e2630, 0x2a2328], [0x4f5d45, 0x33402d, 0x2a2f27],
  [0xb89a5a, 0x806a3a, 0x31302b], [0x2b2b30, 0x1c1c20, 0x3b3b44], [0xd9d4ca, 0x8f8a80, 0x4a4f5c], [0x8c5a3c, 0x5c3a24, 0x2c2a2a],
];
const SKINS = [0xe9b98c, 0xd9a97f, 0xa9764f, 0x8a5a3a, 0x6e4a31];

function randomSpot() {
  for (let k = 0; k < 40; k++) {
    const d = DISTRICTS[ri(0, DISTRICTS.length - 1)];
    const x = d.x + rnd(4, d.w - 4), z = d.z + rnd(4, d.d - 4);
    if (groundH(x, z) > -0.5 && !solidAt(x, z) && !inWater(x, z)) return [x, z];
  }
  return [150, 90];
}

export function buildCivilians() {
  const n = Q().civils;
  for (let i = 0; i < n; i++) {
    const [x, z] = randomSpot();
    const c = OUTFITS[ri(0, OUTFITS.length - 1)];
    const rig = makeRig({
      skin: SKINS[ri(0, SKINS.length - 1)], cloth: c[0], cloth2: c[1], pant: c[2], cap: Math.random() < 0.18 ? c[1] : null,
      hair: [0x2a1d14, 0x5a3a20, 0x111111, 0x8a6a4a, 0xb8b0a0][ri(0, 4)], scale: rnd(0.92, 1.04), width: rnd(0.9, 1.1), lite: true, shadow: false, name: 'passant',
    });
    scene.add(rig);
    civils.push({ x, z, y: groundH(x, z), yaw: rnd(0, 6), vx: 0, vz: 0, rig, state: 'walk', t: rnd(0, 4), tx: x, tz: z, scared: 0, r: 0.35, lod: 0, pace: rnd(1.1, 1.6) });
  }
}

export function clearCivilians() {
  for (const c of civils) { scene.remove(c.rig); disposeRig(c.rig); }
  civils.length = 0;
}

export function updateCivilians(dt) {
  for (const c of civils) {
    let threat = null, td = 99;
    for (const e of enemies) {
      if (e.state === 'dead') continue;
      const d = Math.hypot(e.x - c.x, e.z - c.z);
      if (d < td) { td = d; threat = e; }
    }
    const pd = Math.hypot(P.x - c.x, P.z - c.z);
    if (P.vehicle && pd < 10 && P.vehicle.sp > 7) { threat = P; td = pd; }
    else if (pd < 6 && (P.action || P.gun || Math.hypot(P.vx, P.vz) > 7)) { threat = P; td = pd; }
    if (threat && td < 14) {
      if (c.state !== 'flee') { c.state = 'flee'; c.scared = 3.2; if (Math.random() < 0.15) sfx('whiff', c); }
      const a = Math.atan2(c.x - threat.x, c.z - threat.z);
      c.vx = lerp(c.vx, Math.sin(a) * 5.5, clamp(dt * 5, 0, 1));
      c.vz = lerp(c.vz, Math.cos(a) * 5.5, clamp(dt * 5, 0, 1));
      c.yaw = a;
    } else {
      c.scared -= dt;
      if (c.scared <= 0 && c.state === 'flee') { c.state = 'walk'; c.t = 0; }
      c.t -= dt;
      if (c.t <= 0) {
        c.t = rnd(3, 8);
        const d = districtAt(c.x, c.z);
        c.tx = clamp(c.x + rnd(-20, 20), d.x + 3, d.x + d.w - 3); c.tz = clamp(c.z + rnd(-20, 20), d.z + 3, d.z + d.d - 3);
      }
      const a = Math.atan2(c.tx - c.x, c.tz - c.z), dd = Math.hypot(c.tx - c.x, c.tz - c.z);
      const sp = dd > 1 ? c.pace : 0;
      c.vx = lerp(c.vx, Math.sin(a) * sp, clamp(dt * 3, 0, 1));
      c.vz = lerp(c.vz, Math.cos(a) * sp, clamp(dt * 3, 0, 1));
      if (sp > 0) c.yaw += wrapAngle(a - c.yaw) * clamp(dt * 4, 0, 1);
    }
    const ox = c.x, oz = c.z;
    c.x += c.vx * dt; c.z += c.vz * dt;
    resolveAABB(c);
    if (inWater(c.x, c.z)) { c.x = ox; c.z = oz; c.t = 0; }
    if (Math.hypot(c.x - ox, c.z - oz) < 0.2 * dt * c.pace && c.state === 'walk') c.t -= dt * 3; // bloqué : change de but
    c.y = groundH(c.x, c.z);
    c.rig.position.set(c.x, c.y, c.z); c.rig.rotation.y = c.yaw;
    const far = Math.hypot(c.x - camera.position.x, c.z - camera.position.z);
    c.rig.visible = far < 90;
    if (c.rig.visible) {
      c.lod++;
      if (far < 30 || c.lod % 2 === 0) animRig(c.rig, { speed: Math.hypot(c.vx, c.vz) }, far < 30 ? dt : dt * 2);
      c.rig.userData.blob.visible = far < 45;
    }
    if (far > 140) { const [x, z] = randomSpot(); c.x = x; c.z = z; c.state = 'walk'; c.t = 0; }
  }
}
