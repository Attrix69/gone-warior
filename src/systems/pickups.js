// Objets à ramasser : butin des ennemis (pièces, soin, Gniac, objets, armes, rare)
// et points de réapparition d'objets répartis dans les quartiers.
import * as THREE from 'three';
import { scene } from '../core/renderer.js';
import { P, G } from '../core/state.js';
import { rnd, ri, seeded } from '../core/math.js';
import { flat } from '../render/materials.js';
import { rbox, cyl } from '../world/geo.js';
import { DISTRICTS, groundH, landmarkZone, onRoad } from '../world/layout.js';
import { OBST } from '../world/collision.js';
import { itemMesh, gunMesh } from '../combat/itemModels.js';
import { giveItem } from '../combat/items.js';
import { giveGun, GUN_KEYS } from '../combat/guns.js';
import { addXP } from './progression.js';
import { sfx } from '../audio/audio.js';
import { burst, floatTxt } from '../vfx/effects.js';

export const pickups = [];
const spawns = [];
let glowTex = null;

function glow() {
  if (!glowTex) {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const g = c.getContext('2d'), rg = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    rg.addColorStop(0, 'rgba(255,236,200,.9)'); rg.addColorStop(1, 'rgba(255,236,200,0)');
    g.fillStyle = rg; g.fillRect(0, 0, 64, 64);
    glowTex = new THREE.CanvasTexture(c);
  }
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.55 }));
  s.scale.set(1.1, 1.1, 1);
  return s;
}

const MODELS = {};
function model(t) {
  if (!MODELS[t]) {
    const g = new THREE.Group();
    const add = (geo, mat) => { const m = new THREE.Mesh(geo, mat); m.castShadow = true; g.add(m); return m; };
    if (t === 'coin') add(cyl(0.12, 0.12, 0.03, 16), flat(0xd9b24a, 'metal', { roughness: 0.25 })).rotation.x = Math.PI / 2;
    else if (t === 'heal') { add(rbox(0.3, 0.22, 0.2, 0.04), flat(0xe8e2d8, 'plastic')); add(rbox(0.16, 0.05, 0.21, 0.01), flat(0xc8322b, 'plastic')); add(rbox(0.05, 0.16, 0.21, 0.01), flat(0xc8322b, 'plastic')); }
    else if (t === 'gniac') add(new THREE.OctahedronGeometry(0.17), flat(0xff9a2f, 'emissive', { emissiveIntensity: 1.6 }));
    else if (t === 'rare') add(rbox(0.3, 0.3, 0.3, 0.06), flat(0x9a6fe0, 'emissive', { emissiveIntensity: 1.2 }));
    MODELS[t] = g;
  }
  return MODELS[t].clone();
}

export function addPickup(x, z, t, id) {
  const gy = groundH(x, z);
  const m = t === 'gun' ? gunMesh(id) : t === 'item' ? itemMesh(id) : model(t);
  if (t === 'gun' || t === 'item') m.scale.multiplyScalar(1.3);
  m.add(glow());
  m.position.set(x, gy + 0.6, z);
  scene.add(m);
  pickups.push({ x, z, y: gy + 0.6, t, id, m, life: 35, spin: rnd(0, 6) });
}
function removePickup(p) {
  scene.remove(p.m);
  const i = pickups.indexOf(p);
  if (i >= 0) pickups.splice(i, 1);
}
export function clearPickups() { while (pickups.length) removePickup(pickups[0]); }

export function initItemSpawns() {
  const RS = seeded(777);
  for (const d of DISTRICTS) for (let i = 0; i < 3; i++) {
    const x = d.x + 3 + RS() * (d.w - 6), z = d.z + 3 + RS() * (d.d - 6);
    if (groundH(x, z) < -0.5 || onRoad(x, z, 2) || landmarkZone(x, z)) continue;
    if (OBST.some((o) => x > o.x - 1.2 && x < o.x + o.w + 1.2 && z > o.z - 1.2 && z < o.z + o.d + 1.2)) continue;
    spawns.push({ x, z, t: RS() * 10, id: null, gun: null, m: null });
  }
}

const POOL = ['bottle', 'andouillette', 'tarte', 'lighter', 'belt', 'baton', 'knuckle', 'baguette', 'poele', 'parapluie', 'extincteur', 'petanque', 'quenelle', 'corne'];
function updateSpawns(dt) {
  for (const s of spawns) {
    if (s.m) {
      s.m.rotation.y += dt * 1.5;
      s.m.position.y = groundH(s.x, s.z) + 0.6 + Math.sin(G.t * 3 + s.x) * 0.08;
      if (Math.hypot(s.x - P.x, s.z - P.z) < 1.1) {
        if (s.gun) giveGun(s.gun); else giveItem(s.id);
        sfx('pick'); burst(s.x, s.m.position.y, s.z, 0xcfe6ff, 10, 0.7);
        scene.remove(s.m); s.m = null; s.t = 45;
      }
    } else {
      s.t -= dt;
      if (s.t <= 0) {
        if (Math.random() < 0.34) { s.gun = GUN_KEYS[ri(0, GUN_KEYS.length - 1)]; s.id = null; } else { s.gun = null; s.id = POOL[ri(0, POOL.length - 1)]; }
        s.m = s.gun ? gunMesh(s.gun) : itemMesh(s.id);
        s.m.scale.multiplyScalar(1.3);
        s.m.add(glow());
        s.m.position.set(s.x, groundH(s.x, s.z) + 0.6, s.z);
        scene.add(s.m);
      }
    }
  }
}

export function updatePickups(dt) {
  for (let i = pickups.length - 1; i >= 0; i--) {
    const p = pickups[i];
    p.life -= dt; p.spin += dt * 3;
    if (p.life <= 0) { removePickup(p); continue; }
    const d = Math.hypot(p.x - P.x, p.z - P.z);
    if (d < 4) { p.x += (P.x - p.x) * dt * 4; p.z += (P.z - p.z) * dt * 4; }
    p.m.position.set(p.x, p.y + Math.sin(p.spin) * 0.08, p.z); p.m.rotation.y = p.spin;
    if (d < 1.1) {
      sfx('pick');
      if (p.t === 'coin') P.coins += ri(1, 4);
      else if (p.t === 'heal') { P.hp = Math.min(P.hpMax, P.hp + 24); floatTxt(P.x, P.y + 2, P.z, '+24 vie', '#ff8f8f'); }
      else if (p.t === 'gniac') { P.gniac = Math.min(100, P.gniac + 22); floatTxt(P.x, P.y + 2, P.z, '+Gniac', '#ffb347'); }
      else if (p.t === 'rare') { P.coins += 25; addXP(40); floatTxt(P.x, P.y + 2, P.z, 'Objet rare !', '#c9a0ff', 15); }
      else if (p.t === 'item') giveItem(p.id);
      else if (p.t === 'gun') giveGun(p.id);
      removePickup(p);
    }
  }
  updateSpawns(dt);
}
