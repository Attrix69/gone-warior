// Effets visuels de gameplay : particules (étincelles, poussière, sang, feu), ondes
// d'impact, décalques au sol (sang, brûlures), débris physiques, textes flottants,
// flash d'écran et onomatopées (option « BD »).
import * as THREE from 'three';
import { scene, camera, Q } from '../core/renderer.js';
import { clamp, lerp, rnd, ri, ease } from '../core/math.js';
import { opt } from '../core/state.js';
import { groundH } from '../world/layout.js';
import { flat } from '../render/materials.js';
import { rbox } from '../world/geo.js';

// ─── particules ─────────────────────────────────────────────────────────────
function softTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), rg = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  rg.addColorStop(0, 'rgba(255,255,255,1)'); rg.addColorStop(0.4, 'rgba(255,255,255,0.6)'); rg.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = rg; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); return t;
}
let SOFT = null;
function makePS(max, size, blending, fade, depthFade = true) {
  SOFT ??= softTexture();
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(max * 3), 3));
  geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(max * 3), 3));
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({
    size, map: SOFT, vertexColors: true, blending, depthWrite: false, transparent: true, sizeAttenuation: true, fog: !depthFade || blending !== THREE.AdditiveBlending,
  }));
  pts.frustumCulled = false; pts.renderOrder = 6;
  scene.add(pts);
  const data = [];
  for (let i = 0; i < max; i++) data.push({ life: 0, max: 1, x: 0, y: -999, z: 0, vx: 0, vy: 0, vz: 0, g: 9.8, c: new THREE.Color() });
  return { geo, data, max, fade };
}
export let SPARK, BLOOD, DUST, FIRE;
export function initEffects() {
  SPARK = makePS(160, 0.12, THREE.AdditiveBlending, true);
  DUST = makePS(160, 0.55, THREE.NormalBlending, true);
  BLOOD = makePS(180, 0.09, THREE.NormalBlending, false);
  FIRE = makePS(140, 0.45, THREE.AdditiveBlending, true);
}

/** Émet n particules. power ∈ ~[0.3, 2.5], life en secondes, g gravité (négatif = monte). */
export function emit(ps, x, y, z, color, n, power = 1, life = null, g = null) {
  let made = 0;
  for (const p of ps.data) {
    if (p.life > 0) continue;
    const a = rnd(0, Math.PI * 2), e = rnd(-0.4, 1), s = rnd(1.5, 5) * power;
    p.life = life ? rnd(life * 0.6, life) : rnd(0.25, 0.6); p.max = p.life;
    p.x = x; p.y = y; p.z = z; p.g = g == null ? 11 : g;
    p.vx = Math.cos(a) * s; p.vy = e * s * 0.8 + 1.6 * power; p.vz = Math.sin(a) * s;
    p.c.setHex(color);
    if (++made >= n) break;
  }
}
const budget = (n) => Math.max(1, Math.round(n * Q().parts));
export function burst(x, y, z, color, n, power) { emit(SPARK, x, y, z, color, budget(n), power); }
export function dust(x, y, z, n = 6, power = 0.5, color = 0xb8ad98) { emit(DUST, x, y, z, color, budget(n), power, 0.9, 0.6); }
export function fire(x, y, z, n) { emit(FIRE, x, y, z, Math.random() < 0.5 ? 0xff8a1f : 0xffd040, budget(n), 0.35, 0.5, -3); }
export function blood(x, y, z, n, power) {
  if (!opt.blood) return;
  emit(BLOOD, x, y, z, Math.random() < 0.5 ? 0x6e0a10 : 0x4a070b, budget(n), power * 0.8, 0.75, 14);
  if (Math.random() < 0.6) bloodDecal(x + rnd(-0.5, 0.5), z + rnd(-0.5, 0.5));
}

function updPS(ps, dt) {
  const pos = ps.geo.attributes.position.array, col = ps.geo.attributes.color.array;
  for (let i = 0; i < ps.max; i++) {
    const p = ps.data[i];
    if (p.life > 0) {
      p.life -= dt; p.vy -= p.g * dt;
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      p.vx *= 0.96; p.vz *= 0.96;
      const gy = groundH(p.x, p.z) + 0.03;
      if (p.y < gy) { p.y = gy; p.vy = 0; p.vx *= 0.5; p.vz *= 0.5; }
      const f = ps.fade ? clamp(p.life / p.max, 0, 1) : 1;
      pos[i * 3] = p.x; pos[i * 3 + 1] = p.y; pos[i * 3 + 2] = p.z;
      col[i * 3] = p.c.r * f; col[i * 3 + 1] = p.c.g * f; col[i * 3 + 2] = p.c.b * f;
    } else pos[i * 3 + 1] = -999;
  }
  ps.geo.attributes.position.needsUpdate = true;
  ps.geo.attributes.color.needsUpdate = true;
}

// ─── décalques au sol ───────────────────────────────────────────────────────
const decals = [], scorches = [];
let decalGeo = null, bloodTex = null;
function splatTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  for (let i = 0; i < 14; i++) {
    const x = 64 + rnd(-30, 30), y = 64 + rnd(-30, 30), r = rnd(6, 24);
    const rg = g.createRadialGradient(x, y, 0, x, y, r);
    rg.addColorStop(0, 'rgba(255,255,255,0.95)'); rg.addColorStop(0.7, 'rgba(255,255,255,0.8)'); rg.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = rg; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
  }
  return new THREE.CanvasTexture(c);
}
export function bloodDecal(x, z) {
  if (!opt.blood) return;
  decalGeo ??= new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  bloodTex ??= splatTexture();
  if (decals.length >= 32) { const d = decals.shift(); scene.remove(d.m); d.m.material.dispose(); }
  const m = new THREE.Mesh(decalGeo, new THREE.MeshStandardMaterial({
    color: 0x3a0306, map: bloodTex, transparent: true, opacity: 0.85, depthWrite: false, roughness: 0.25, polygonOffset: true, polygonOffsetFactor: -4,
  }));
  const sc = rnd(0.35, 0.9);
  m.scale.set(sc * rnd(0.8, 1.3), 1, sc); m.rotation.y = rnd(0, 6);
  m.position.set(x, groundH(x, z) + 0.02, z);
  scene.add(m);
  decals.push({ m, t: 0 });
}
export function scorch(x, z, r) {
  decalGeo ??= new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  bloodTex ??= splatTexture();
  if (scorches.length > 18) { const d = scorches.shift(); scene.remove(d); d.material.dispose(); }
  const m = new THREE.Mesh(decalGeo, new THREE.MeshStandardMaterial({ color: 0x0c0a08, map: bloodTex, transparent: true, opacity: 0.8, depthWrite: false, roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -4 }));
  m.scale.set(r * 2, 1, r * 2); m.rotation.y = rnd(0, 6); m.position.set(x, groundH(x, z) + 0.025, z);
  scene.add(m); scorches.push(m);
}
function updDecals(dt) {
  for (let i = decals.length - 1; i >= 0; i--) {
    const d = decals[i]; d.t += dt;
    if (d.t > 20) {
      d.m.material.opacity = Math.max(0, 0.85 * (1 - (d.t - 20) / 5));
      if (d.t > 25) { scene.remove(d.m); d.m.material.dispose(); decals.splice(i, 1); }
    }
  }
}

// ─── ondes (anneaux) ────────────────────────────────────────────────────────
const rings = [];
let ringGeo = null;
export function ring(x, y, z, color, maxR, life, flatRing) {
  ringGeo ??= new THREE.RingGeometry(0.7, 1, 40);
  // style réaliste : onde discrète (souffle, poussière) ; style BD : anneau franc
  const base = opt.comic ? 0.6 : flatRing ? 0.3 : 0.12;
  const m = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: base, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  if (flatRing) m.rotation.x = -Math.PI / 2;
  m.position.set(x, y, z); scene.add(m);
  rings.push({ m, t: 0, life, maxR: maxR * 0.5, flat: flatRing, base });
}
function updRings(dt) {
  for (let i = rings.length - 1; i >= 0; i--) {
    const r = rings[i]; r.t += dt;
    const p = r.t / r.life;
    if (p >= 1) { scene.remove(r.m); r.m.material.dispose(); rings.splice(i, 1); continue; }
    const s = lerp(0.3, r.maxR, ease(p));
    r.m.scale.set(s, s, s); r.m.material.opacity = (1 - p) * r.base;
    if (!r.flat) r.m.quaternion.copy(camera.quaternion);
  }
}

// ─── débris ─────────────────────────────────────────────────────────────────
const debris = [];
export function spawnDebris(x, y, z, color, n, power = 1, life = 6) {
  const mat = flat(color, 'matte', { roughness: 0.9 });
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(rbox(rnd(0.1, 0.3), rnd(0.06, 0.15), rnd(0.1, 0.3), 0.02), mat);
    m.castShadow = true; m.position.set(x, y, z); scene.add(m);
    debris.push({ m, x, y, z, vx: rnd(-4, 4) * power, vy: rnd(2, 6) * power, vz: rnd(-4, 4) * power, rx: rnd(-9, 9), rz: rnd(-9, 9), life });
  }
}
function updDebris(dt) {
  for (let i = debris.length - 1; i >= 0; i--) {
    const d = debris[i];
    d.life -= dt; d.vy -= 18 * dt;
    d.x += d.vx * dt; d.y += d.vy * dt; d.z += d.vz * dt;
    const gy = groundH(d.x, d.z) + 0.05;
    if (d.y < gy) { d.y = gy; d.vy *= -0.3; d.vx *= 0.6; d.vz *= 0.6; d.rx *= 0.5; d.rz *= 0.5; }
    d.m.position.set(d.x, d.y, d.z); d.m.rotation.x += d.rx * dt; d.m.rotation.z += d.rz * dt;
    if (d.life <= 0) { scene.remove(d.m); debris.splice(i, 1); }
  }
}

// ─── textes flottants (dégâts, gains) ───────────────────────────────────────
const fltPool = [];
const _v = new THREE.Vector3();
export function floatTxt(x, y, z, txt, color = '#fff', size = 14) {
  let el = fltPool.find((f) => !f.busy);
  if (!el) {
    if (fltPool.length > 16) return;
    el = { busy: false, dom: document.createElement('div') };
    el.dom.className = 'flt';
    document.getElementById('floats').appendChild(el.dom);
    fltPool.push(el);
  }
  Object.assign(el, { busy: true, t: 0, x, y, z });
  el.dom.textContent = txt; el.dom.style.color = color; el.dom.style.fontSize = `${size}px`; el.dom.style.display = 'block';
}
function updFloats(dt) {
  for (const f of fltPool) {
    if (!f.busy) continue;
    f.t += dt; f.y += dt * 0.9;
    if (f.t > 1.1) { f.busy = false; f.dom.style.display = 'none'; continue; }
    _v.set(f.x, f.y, f.z).project(camera);
    if (_v.z > 1) { f.dom.style.display = 'none'; continue; }
    f.dom.style.display = 'block';
    f.dom.style.transform = `translate(${(_v.x * 0.5 + 0.5) * window.innerWidth}px,${(-_v.y * 0.5 + 0.5) * window.innerHeight}px) translate(-50%,-50%)`;
    f.dom.style.opacity = clamp(1.6 - f.t * 1.6, 0, 1);
  }
}

export function flash(a) {
  const f = document.getElementById('fx');
  f.style.opacity = a;
  setTimeout(() => { f.style.opacity = 0; }, 110);
}

// ─── onomatopées (option BD) ────────────────────────────────────────────────
const POPWORDS = ['PAF !', 'BAM !', 'POW !', 'VLAN !', 'BOUM !', 'TCHAC !'];
let popTex = null;
const popPool = [];
function popTexture(w) {
  const cv = document.createElement('canvas'); cv.width = 320; cv.height = 180;
  const g = cv.getContext('2d');
  g.translate(160, 90); g.rotate(-0.12); g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = '700 78px "Barlow Condensed", Impact, sans-serif';
  g.lineWidth = 14; g.strokeStyle = 'rgba(20,16,24,.95)'; g.strokeText(w, 0, 0);
  g.fillStyle = '#ffd98a'; g.fillText(w, 0, 0);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
}
export function comicPop(x, y, z) {
  if (!opt.comic) return;
  if (!popTex) {
    popTex = POPWORDS.map(popTexture);
    for (let i = 0; i < 6; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: popTex[0], transparent: true, depthTest: false, depthWrite: false }));
      sp.visible = false; sp.renderOrder = 1000; scene.add(sp); popPool.push({ sp, t: 0, busy: false });
    }
  }
  const p = popPool.find((q) => !q.busy);
  if (!p) return;
  p.sp.material.map = popTex[ri(0, popTex.length - 1)]; p.sp.material.needsUpdate = true;
  Object.assign(p, { busy: true, t: 0 }); p.sp.visible = true; p.sp.position.set(x + rnd(-0.3, 0.3), y + rnd(0, 0.3), z + rnd(-0.3, 0.3));
}
function updPops(dt) {
  for (const p of popPool) {
    if (!p.busy) continue;
    p.t += dt;
    const k = p.t < 0.12 ? 1 - Math.pow(1 - p.t / 0.12, 3) : 1;
    const s = lerp(0.3, 2.6, k) * (1 + Math.max(0, p.t - 0.3) * 0.5);
    p.sp.scale.set(s, s * 0.56, 1); p.sp.position.y += dt * 0.8;
    p.sp.material.opacity = clamp(1 - (p.t - 0.42) / 0.35, 0, 1);
    if (p.t > 0.85) { p.busy = false; p.sp.visible = false; }
  }
}

export function updateEffects(dt) {
  updPS(SPARK, dt); updPS(DUST, dt); updPS(BLOOD, dt); updPS(FIRE, dt);
  updDecals(dt); updRings(dt); updDebris(dt); updFloats(dt); updPops(dt);
}
