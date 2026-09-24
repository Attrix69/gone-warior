// Immeubles : parcelles tirées des îlots, façades procédurales (shader), soubassements,
// corniches, toitures (tuiles, zinc, ardoise, terrasses), cheminées, équipements de toit.
// Tout est instancié. Gère aussi la destruction par paliers et le fondu d'occultation.
import * as THREE from 'three';
import { scene, Q } from '../core/renderer.js';
import { seeded, clamp, lerp } from '../core/math.js';
import { TEX, triMat, flat } from '../render/materials.js';
import { patchMaterial } from '../render/shaderPatch.js';
import { FACADE_VERTEX_PARS, FACADE_VERTEX, FACADE_FRAGMENT_PARS, FACADE_MAP, FACADE_NORMAL, FACADE_AO } from '../render/glsl/facade.glsl.js';
import {
  WORLD, BLOCKS, RIVERS, ROADS_V, ROADS_H, AVENUE_W, AVENUE_SIDE, LMZONES, PARK, DISTRICTS, PAL, groundH,
} from './layout.js';
import { addObstacle } from './collision.js';

export const BLD = [];      // immeubles jouables (collision, destruction)
const ALL = [];             // + immeubles de remplissage hors carte
const STYLE = { urban: 0, place: 0, old: 1, hill: 2, modern: 3, tower: 4, quai: 5 };
const FLOOR = [3.2, 3.0, 3.9, 3.4, 3.8, 3.2];
const GF = [4.2, 3.6, 4.0, 4.6, 5.2, 4.2];
const ROOF_OF = (hex, kind) => (kind === 'modern' || kind === 'tower' ? 'flat'
  : hex === PAL.zinc ? 'zinc' : hex === PAL.ardoise ? 'slate' : 'tiles');

function floorsFor(kind, R) {
  const r = R();
  switch (kind) {
    case 'old': return 3 + Math.floor(r * 3);
    case 'hill': return 4 + Math.floor(r * 3);
    case 'modern': return 3 + Math.floor(r * 5);
    case 'tower': return 6 + Math.floor(r * 10) + (r > 0.8 ? 6 : 0);
    case 'place': return 5 + Math.floor(r * 2);
    default: return 3 + Math.floor(r * 3) + (r > 0.85 ? 2 : 0);
  }
}

/** Retire d'un rectangle les couloirs d'avenues / fleuves ; null si trop petit. */
function clipLot(l) {
  const cuts = [];
  for (const rx of ROADS_V) cuts.push({ axis: 'x', a: rx - AVENUE_W - AVENUE_SIDE, b: rx + AVENUE_W + AVENUE_SIDE });
  for (const rz of ROADS_H) cuts.push({ axis: 'z', a: rz - AVENUE_W - AVENUE_SIDE, b: rz + AVENUE_W + AVENUE_SIDE });
  for (const r of RIVERS) cuts.push({ axis: 'x', a: r.x - 4, b: r.x + r.w + 4 });
  for (const c of cuts) {
    const lo = c.axis === 'x' ? l.x : l.z, hi = lo + (c.axis === 'x' ? l.w : l.d);
    if (hi <= c.a || lo >= c.b) continue;
    const left = c.a - lo, right = hi - c.b;
    if (left >= right && left > 5) { if (c.axis === 'x') l.w = left; else l.d = left; }
    else if (right > 5) { if (c.axis === 'x') { l.x = c.b; l.w = right; } else { l.z = c.b; l.d = right; } }
    else return null;
  }
  for (const z of LMZONES) {
    if (l.x < z.x + z.r && l.x + l.w > z.x - z.r && l.z < z.z + z.r && l.z + l.d > z.z - z.r) return null;
  }
  if (l.x < PARK.x + PARK.w + 2 && l.x + l.w > PARK.x - 2 && l.z < PARK.z + PARK.d + 2 && l.z + l.d > PARK.z - 2) return null;
  return l;
}

function splitBlock(b, R, big) {
  let lots = [{ x: b.x, z: b.z, w: b.w, d: b.d }];
  const lim = big ? 30 : 17;
  const split = (arr, axis) => arr.flatMap((l) => {
    const len = axis === 'x' ? l.w : l.d;
    if (len < lim) return [l];
    const t = 0.35 + R() * 0.3;
    return axis === 'x'
      ? [{ ...l, w: l.w * t }, { ...l, x: l.x + l.w * t, w: l.w * (1 - t) }]
      : [{ ...l, d: l.d * t }, { ...l, z: l.z + l.d * t, d: l.d * (1 - t) }];
  });
  lots = split(lots, 'x'); lots = split(lots, 'z');
  return lots;
}

function makeBuilding(l, d, R, outskirt = false) {
  const kind = d.kind;
  const style = STYLE[kind] ?? 0;
  const floors = floorsFor(kind, R);
  const h = GF[style] + floors * FLOOR[style] + 0.7;
  const cx = l.x + l.w / 2, cz = l.z + l.d / 2;
  const gy = outskirt ? -0.05 : Math.min(groundH(l.x, l.z), groundH(l.x + l.w, l.z), groundH(l.x, l.z + l.d), groundH(l.x + l.w, l.z + l.d), groundH(cx, cz)) - 0.4;
  return {
    x: cx, z: cz, w: l.w, d: l.d, h: h + 0.4, h0: h + 0.4, gy, kind, style, floors,
    c: d.pal[Math.floor(R() * d.pal.length)], tint: 0.85 + R() * 0.3, roof: ROOF_OF(d.roof, kind),
    seed: R(), shops: !outskirt && (kind === 'urban' || kind === 'place' || kind === 'old' || kind === 'quai') && R() < 0.75 ? 1 : 0,
    tier: 4, hide: 0, hideTarget: 0, dmg: 0, outskirt,
  };
}

function generate() {
  const R = seeded(4242);
  for (const b of BLOCKS) {
    const d = b.district;
    if (!d.pal.length) continue;
    for (const lot of splitBlock(b, R, d.kind === 'tower' || d.kind === 'modern')) {
      const l = clipLot({ ...lot });
      if (!l || l.w < 5 || l.d < 5) continue;
      if (R() < 0.05) continue; // parcelle vide / cour
      if (groundH(l.x + l.w / 2, l.z + l.d / 2) < -0.5) continue;
      BLD.push(makeBuilding(l, d, R));
    }
  }
  // Remplissage hors carte : la ville continue dans la brume (sans collision).
  const RO = seeded(777);
  const S = 34, M = 110;
  for (let x = -M; x < WORLD.w + M; x += S) for (let z = -M; z < WORLD.h + M; z += S) {
    const inside = x > -S && x < WORLD.w && z > -S && z < WORLD.h;
    if (inside) continue;
    if (RIVERS.some((r) => x + S > r.x - 6 && x < r.x + r.w + 6)) continue;
    const near = DISTRICTS.reduce((best, d) => {
      const dd = Math.hypot(clamp(x + S / 2, d.x, d.x + d.w) - (x + S / 2), clamp(z + S / 2, d.z, d.z + d.d) - (z + S / 2));
      return dd < best.dd ? { d, dd } : best;
    }, { d: DISTRICTS[0], dd: 1e9 }).d;
    const dd = near.pal.length ? near : DISTRICTS[0];
    const block = { x: x + 6, z: z + 6, w: S - 12, d: S - 12 };
    for (const lot of splitBlock(block, RO, dd.kind === 'tower')) ALL.push(makeBuilding(lot, dd, RO, true));
  }
  ALL.unshift(...BLD);
}

// ─── géométries de toiture unitaires ────────────────────────────────────────
function hipRoofGeo() {
  const v = [
    [-0.5, 0, -0.5], [0.5, 0, -0.5], [0.5, 0, 0.5], [-0.5, 0, 0.5], [-0.22, 1, 0], [0.22, 1, 0],
  ];
  const faces = [[0, 4, 5], [0, 5, 1], [2, 5, 4], [2, 4, 3], [3, 4, 0], [1, 5, 2]];
  const p = [];
  for (const f of faces) for (const i of f) p.push(...v[i]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  g.computeVertexNormals();
  return g;
}
function mansardGeo() {
  const b = 0.5, t = 0.3;
  const v = [[-b, 0, -b], [b, 0, -b], [b, 0, b], [-b, 0, b], [-t, 1, -t], [t, 1, -t], [t, 1, t], [-t, 1, t]];
  const faces = [[0, 4, 5], [0, 5, 1], [1, 5, 6], [1, 6, 2], [2, 6, 7], [2, 7, 3], [3, 7, 4], [3, 4, 0], [4, 7, 6], [4, 6, 5]];
  const p = [];
  for (const f of faces) for (const i of f) p.push(...v[i]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  g.computeVertexNormals();
  return g;
}

// ─── instanciation ──────────────────────────────────────────────────────────
const meshes = {};
const dummy = new THREE.Object3D();
const col = new THREE.Color();

function facadeMaterial() {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0 });
  patchMaterial(m, {
    key: 'facade',
    uniforms: {
      tPlaster: { value: TEX.plaster.map }, tPlasterN: { value: TEX.plaster.normalMap }, tPlasterO: { value: TEX.plaster.ormMap },
      tStone: { value: TEX.ashlar.map }, tStoneN: { value: TEX.ashlar.normalMap }, tStoneO: { value: TEX.ashlar.ormMap },
      tMacro: { value: TEX.macro.map },
    },
    vertexPars: FACADE_VERTEX_PARS, vertexMain: FACADE_VERTEX, fragmentPars: FACADE_FRAGMENT_PARS,
    fragment: {
      map_fragment: FACADE_MAP,
      color_fragment: '',
      roughnessmap_fragment: 'float roughnessFactor = fRough;',
      metalnessmap_fragment: 'float metalnessFactor = fMetal;',
      normal_fragment_maps: FACADE_NORMAL,
      // Vitres : reflet du ciel renforcé (verre + lumière rasante) en plus du spéculaire PBR.
      emissivemap_fragment: `totalEmissiveRadiance += fEmis;
	#ifdef USE_ENVMAP
		totalEmissiveRadiance += fGlass * getIBLRadiance( normalize( vViewPosition ), normal, 0.06 ) * 0.28;
	#endif`,
      aomap_fragment: FACADE_AO,
    },
  });
  m.userData.shared = true;
  return m;
}

function instanced(geo, mat, count, name, { shadow = true } = {}) {
  const im = new THREE.InstancedMesh(geo, mat, Math.max(1, count));
  im.count = count;
  im.castShadow = shadow; im.receiveShadow = true;
  im.name = name;
  const hide = new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, count)), 1);
  hide.setUsage(THREE.DynamicDrawUsage);
  im.geometry = im.geometry.clone();
  im.geometry.setAttribute('aHide', hide);
  im.userData.hide = hide;
  scene.add(im);
  return im;
}

function setRoofMatrices(b) {
  const top = b.gy + b.h;
  if (b.roof === 'tiles') {
    const rh = Math.min(b.w, b.d) * 0.23;
    dummy.position.set(b.x, top, b.z);
    const along = b.w >= b.d;
    dummy.rotation.set(0, along ? 0 : Math.PI / 2, 0);
    dummy.scale.set((along ? b.w : b.d) * 1.06, rh, (along ? b.d : b.w) * 1.06);
  } else if (b.roof === 'flat') {
    dummy.position.set(b.x, top - 0.05, b.z); dummy.rotation.set(0, 0, 0); dummy.scale.set(b.w * 0.98, 0.12, b.d * 0.98);
  } else {
    const mh = Math.min(3.2, Math.min(b.w, b.d) * 0.3);
    dummy.position.set(b.x, top, b.z); dummy.rotation.set(0, 0, 0); dummy.scale.set(b.w * 1.02, mh, b.d * 1.02);
  }
  dummy.updateMatrix();
  return dummy.matrix;
}

function writeBuilding(i, b) {
  dummy.rotation.set(0, 0, 0);
  dummy.position.set(b.x, b.gy + b.h / 2, b.z); dummy.scale.set(b.w, b.h, b.d); dummy.updateMatrix();
  meshes.body.setMatrixAt(i, dummy.matrix);
  dummy.position.set(b.x, b.gy + b.h - 0.2, b.z); dummy.scale.set(b.w * 1.035, 0.42, b.d * 1.035); dummy.updateMatrix();
  meshes.cornice.setMatrixAt(i, dummy.matrix);
  const rm = meshes[`roof_${b.roof}`];
  rm.setMatrixAt(b.roofIdx, setRoofMatrices(b));
  for (const [k, ci] of (b.chimIdx || []).entries()) {
    const c = b.chim[k];
    dummy.rotation.set(0, 0, 0);
    dummy.position.set(b.x + c.dx, b.gy + b.h + c.h / 2, b.z + c.dz); dummy.scale.set(c.w, c.h, c.d); dummy.updateMatrix();
    meshes[c.kind].setMatrixAt(ci, dummy.matrix);
  }
}

export function buildBuildings() {
  generate();
  const n = ALL.length;
  const R = seeded(99);
  const byRoof = { tiles: [], zinc: [], slate: [], flat: [] };
  ALL.forEach((b, i) => { b.roofIdx = byRoof[b.roof].length; byRoof[b.roof].push(i); });
  // cheminées (toits en pente) et équipements (terrasses)
  const chimneys = [], units = [];
  for (const b of ALL) {
    b.chim = []; b.chimIdx = [];
    if (b.roof === 'flat') {
      const k = 1 + Math.floor(R() * 3);
      for (let j = 0; j < k; j++) {
        const c = { kind: 'units', dx: (R() - 0.5) * b.w * 0.6, dz: (R() - 0.5) * b.d * 0.6, w: 1.2 + R() * 1.6, h: 0.9 + R() * 1.2, d: 1 + R() * 1.4 };
        b.chim.push(c); b.chimIdx.push(units.length); units.push(b);
      }
    } else {
      const k = 1 + Math.floor(R() * 2.4);
      for (let j = 0; j < k; j++) {
        const c = { kind: 'chim', dx: (R() - 0.5) * b.w * 0.5, dz: (R() - 0.5) * b.d * 0.3, w: 0.55 + R() * 0.4, h: 1.6 + R() * 1.4, d: 0.5 + R() * 0.5 };
        b.chim.push(c); b.chimIdx.push(chimneys.length); chimneys.push(b);
      }
    }
  }
  const box = new THREE.BoxGeometry(1, 1, 1);
  meshes.body = instanced(box, facadeMaterial(), n, 'immeubles');
  const aBld = new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4);
  aBld.setUsage(THREE.DynamicDrawUsage);
  meshes.body.geometry.setAttribute('aBld', aBld);
  meshes.body.userData.aBld = aBld;
  meshes.cornice = instanced(box, triMat('ashlar', { color: 0xdcd2c0, fade: true }), n, 'corniches');
  meshes.roof_tiles = instanced(hipRoofGeo(), triMat('tiles', { tile: 2.4, fade: true }), byRoof.tiles.length, 'toits-tuiles');
  meshes.roof_zinc = instanced(mansardGeo(), triMat('zinc', { metalness: 0.85, roughness: 1.3, useMetal: true, tile: 2.4, fade: true, color: 0xb9bcbf }), byRoof.zinc.length, 'toits-zinc');
  meshes.roof_slate = instanced(mansardGeo(), triMat('slate', { tile: 2.2, fade: true }), byRoof.slate.length, 'toits-ardoise');
  meshes.roof_flat = instanced(box, triMat('concrete', { color: 0x77726c, fade: true }), byRoof.flat.length, 'toits-terrasse');
  meshes.chim = instanced(box, triMat('plaster', { color: 0xc8b8a0, tile: 2, fade: true }), chimneys.length, 'cheminées');
  meshes.units = instanced(box, flat(0x8d9299, 'metal', { roughness: 0.55, metalness: 0.7 }), units.length, 'équipements');
  const plinth = instanced(box, triMat('ashlar', { color: 0xb8ad9c, fade: true }), n, 'soubassements');
  meshes.plinth = plinth;

  ALL.forEach((b, i) => {
    writeBuilding(i, b);
    dummy.rotation.set(0, 0, 0);
    dummy.position.set(b.x, b.gy + 0.55, b.z); dummy.scale.set(b.w + 0.3, 1.1, b.d + 0.3); dummy.updateMatrix();
    plinth.setMatrixAt(i, dummy.matrix);
    col.setHex(b.c || 0xe3d2ad).multiplyScalar(b.tint);
    meshes.body.setColorAt(i, col);
    aBld.setXYZW(i, b.seed, b.style, b.shops, 0);
    if (!b.outskirt) {
      b.obst = addObstacle({ x: b.x - b.w / 2, z: b.z - b.d / 2, w: b.w, d: b.d, h: b.gy + b.h, tag: 'building', occluder: { kind: 'bld', i } });
      b.hp = b.w * b.d * b.h * 0.35; b.hpMax = b.hp;
    }
  });
  for (const m of Object.values(meshes)) {
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
    m.computeBoundingSphere();
  }
  return BLD.map((b) => ({ x: b.x, z: b.z, w: b.w, d: b.d }));
}

// ─── destruction par paliers ────────────────────────────────────────────────
const tierListeners = [];
export function onBuildingTier(fn) { tierListeners.push(fn); }

export function damageBuilding(i, amount) {
  const b = BLD[i];
  if (!b || b.hp <= 0 && b.tier === 0) return 0;
  b.hp -= amount;
  const f = clamp(b.hp / b.hpMax, 0, 1);
  const tier = f > 0.7 ? 4 : f > 0.45 ? 3 : f > 0.2 ? 2 : f > 0 ? 1 : 0;
  b.dmg = Math.max(b.dmg, 1 - f);
  meshes.body.userData.aBld.setW(i, Math.min(1, b.dmg * 1.3));
  meshes.body.userData.aBld.needsUpdate = true;
  if (tier < b.tier) {
    b.tier = tier;
    const nh = [0.25, 0.5, 0.75, 0.92, 1][tier] * b.h0;
    if (nh < b.h) {
      b.h = Math.max(4, nh);
      writeBuilding(i, b);
      b.obst.h = b.gy + b.h;
      for (const m of Object.values(meshes)) m.instanceMatrix.needsUpdate = true;
    }
    for (const fn of tierListeners) fn(b, tier);
  }
  return amount;
}

// ─── fondu d'occultation (tramé) ────────────────────────────────────────────
const fading = new Set();
export function setBuildingHidden(i, hidden) {
  const b = BLD[i];
  if (!b) return;
  const t = hidden ? 0.85 : 0;
  if (b.hideTarget !== t) { b.hideTarget = t; fading.add(i); }
}

export function updateBuildings(dt) {
  if (!fading.size) return;
  const k = 1 - Math.exp(-10 * dt);
  for (const i of fading) {
    const b = BLD[i];
    b.hide = lerp(b.hide, b.hideTarget, k);
    if (Math.abs(b.hide - b.hideTarget) < 0.01) { b.hide = b.hideTarget; fading.delete(i); }
    meshes.body.userData.hide.setX(i, b.hide);
    meshes.cornice.userData.hide.setX(i, b.hide);
    meshes.plinth.userData.hide.setX(i, b.hide);
    meshes[`roof_${b.roof}`].userData.hide.setX(b.roofIdx, b.hide);
    b.chim.forEach((c, k2) => meshes[c.kind].userData.hide.setX(b.chimIdx[k2], b.hide));
  }
  for (const m of Object.values(meshes)) m.userData.hide.needsUpdate = true;
}

export function buildingQualityChanged() {
  for (const m of Object.values(meshes)) m.castShadow = Q().shadows;
}
