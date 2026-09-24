// Mobilier urbain : réverbères (avec éclairage nocturne), potelets, bancs, poubelles,
// terrasses de café et voitures en stationnement. Tout est instancié.
import * as THREE from 'three';
import { scene, Q } from '../core/renderer.js';
import { seeded, clamp } from '../core/math.js';
import { MAT, flat, carPaint } from '../render/materials.js';
import { ATMO } from '../render/atmosphere.js';
import {
  WORLD, STREETS, ROADS_V, ROADS_H, AVENUE_W, RIVERS, BRIDGES, BRW, DISTRICTS, DIST_BY_NAME, groundH, landmarkZone, inWater, inPark,
} from './layout.js';
import { OBST, addObstacle } from './collision.js';
import { PartBuilder, rbox, cyl, sphere } from './geo.js';
import { MODELS } from './vehicleModels.js';
import { LODInstancer } from './lod.js';

export const LAMPS = [];
const d = new THREE.Object3D();

function free(x, z, clear = 0.8) {
  return x > 0.5 && x < WORLD.w - 0.5 && z > 0.5 && z < WORLD.h - 0.5 && groundH(x, z) > -0.5 && !inWater(x, z) && !landmarkZone(x, z) && !inPark(x, z)
    && !OBST.some((o) => x > o.x - clear && x < o.x + o.w + clear && z > o.z - clear && z < o.z + o.d + clear);
}

function unitGeo(builderFn) {
  const pb = new PartBuilder();
  builderFn(pb);
  const g = pb.build({ castShadow: true });
  return g.children.map((m) => ({ geo: m.geometry, mat: m.material }));
}

const _col = new THREE.Color();
/** Matrice monde d'un objet posé au sol. */
function itemMatrix(it) {
  d.position.set(it.x, it.y ?? groundH(it.x, it.z), it.z); d.rotation.set(0, it.rot || 0, 0); d.scale.setScalar(it.s || 1); d.updateMatrix();
  return d.matrix.clone();
}
/** Ensemble d'objets identiques rendus avec niveaux de détail. */
function lodSet(name, list, levels, colorOf = null) {
  const items = list.map((it) => ({ matrix: itemMatrix(it), color: colorOf ? colorOf(it).clone() : null }));
  return new LODInstancer(name, items, levels);
}

// ─── réverbères ─────────────────────────────────────────────────────────────
function lampModel() {
  return unitGeo((pb) => {
    pb.add(cyl(0.16, 0.2, 0.55, 10), MAT.iron, 0, 0.27, 0);
    pb.add(cyl(0.06, 0.08, 4.3, 8), MAT.iron, 0, 2.6, 0);
    pb.add(new THREE.TorusGeometry(0.1, 0.03, 6, 12), MAT.iron, 0, 1.2, 0, [Math.PI / 2, 0, 0]);
    pb.add(new THREE.TorusGeometry(0.34, 0.035, 6, 12, Math.PI / 2), MAT.iron, 0.34, 4.6, 0, [0, 0, Math.PI / 2]);
    pb.add(cyl(0.035, 0.035, 0.5, 6), MAT.iron, 0.55, 4.94, 0, [0, 0, Math.PI / 2]);
    pb.add(new THREE.ConeGeometry(0.28, 0.26, 4, 1), MAT.iron, 0.78, 4.88, 0, [0, Math.PI / 4, 0]);
    pb.add(cyl(0.12, 0.2, 0.08, 4), MAT.iron, 0.78, 4.34, 0, [0, Math.PI / 4, 0]);
    pb.add(cyl(0.2, 0.13, 0.42, 4, true), MAT.lampGlow, 0.78, 4.56, 0, [0, Math.PI / 4, 0]);
  });
}

function placeLamps() {
  const R = seeded(31);
  const push = (x, z, rot) => { if (free(x, z, 0.3)) LAMPS.push({ x, z, rot, y: groundH(x, z) }); };
  for (const st of STREETS) {
    if (st.side <= 0 && st.pave !== 'cobble') continue;
    const off = st.pave === 'cobble' ? st.road / 2 - 0.4 : st.road / 2 + 0.45;
    let side = R() < 0.5 ? -1 : 1;
    for (let t = st.from + 8 + R() * 6; t < st.to - 4; t += 20 + R() * 5) {
      const across = side * off;
      if (st.axis === 'x') push(st.c + across, t, side > 0 ? Math.PI : 0);
      else push(t, st.c + across, side > 0 ? Math.PI / 2 : -Math.PI / 2);
      side = -side;
    }
  }
  const aoff = AVENUE_W + 0.5;
  for (const rx of ROADS_V) for (let z = 10; z < WORLD.h; z += 24) { push(rx - aoff, z, 0); push(rx + aoff, z + 12, Math.PI); }
  for (const rz of ROADS_H) for (let x = 10; x < WORLD.w; x += 24) { push(x, rz - aoff, -Math.PI / 2); push(x + 12, rz + aoff, Math.PI / 2); }
  for (const r of RIVERS) for (const b of BRIDGES) for (const s of [-1, 1]) for (const dx of [-2, r.w + 2]) {
    const x = r.x + dx, z = b + s * (BRW - 0.9);
    LAMPS.push({ x, z, rot: s > 0 ? Math.PI / 2 : -Math.PI / 2, y: 0.05 });
  }
}

// Flaques de lumière au sol et halos : additifs, atténués par le brouillard.
const GLOW_VS = /* glsl */`
attribute vec3 aPos;
uniform float uSize; uniform int uBillboard;
varying vec2 vUv; varying float vDist;
void main() {
	vUv = uv;
	vec3 wp;
	if ( uBillboard == 1 ) {
		vec3 right = vec3( viewMatrix[ 0 ][ 0 ], viewMatrix[ 1 ][ 0 ], viewMatrix[ 2 ][ 0 ] );
		vec3 up = vec3( viewMatrix[ 0 ][ 1 ], viewMatrix[ 1 ][ 1 ], viewMatrix[ 2 ][ 1 ] );
		wp = aPos + ( right * position.x + up * position.y ) * uSize;
	} else {
		wp = aPos + vec3( position.x, 0.0, - position.y ) * uSize;
	}
	vec4 mv = viewMatrix * vec4( wp, 1.0 );
	vDist = - mv.z;
	gl_Position = projectionMatrix * mv;
}`;
const GLOW_FS = /* glsl */`
uniform vec3 uColor; uniform float uIntensity; uniform float uFogD;
varying vec2 vUv; varying float vDist;
void main() {
	float r = length( vUv - 0.5 ) * 2.0;
	float a = pow( max( 1.0 - r, 0.0 ), 2.2 );
	float fog = exp( - uFogD * vDist );
	gl_FragColor = vec4( uColor * a * uIntensity * fog, 1.0 );
}`;

function glowLayer(positions, size, billboard, color, y = 0) {
  const g = new THREE.InstancedBufferGeometry();
  const base = new THREE.PlaneGeometry(1, 1);
  g.index = base.index; g.attributes.position = base.attributes.position; g.attributes.uv = base.attributes.uv;
  const arr = new Float32Array(positions.length * 3);
  positions.forEach((p, i) => { arr[i * 3] = p.x; arr[i * 3 + 1] = p.y + y; arr[i * 3 + 2] = p.z; });
  g.setAttribute('aPos', new THREE.InstancedBufferAttribute(arr, 3));
  g.instanceCount = positions.length;
  const m = new THREE.ShaderMaterial({
    vertexShader: GLOW_VS, fragmentShader: GLOW_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uSize: { value: size }, uBillboard: { value: billboard ? 1 : 0 }, uColor: { value: new THREE.Color(color) }, uIntensity: { value: 0 }, uFogD: { value: 0.003 } },
    polygonOffset: !billboard, polygonOffsetFactor: -2,
  });
  const mesh = new THREE.Mesh(g, m);
  mesh.frustumCulled = false;
  mesh.renderOrder = billboard ? 5 : 2;
  scene.add(mesh);
  return mesh;
}

let pools = null, halos = null;
const lights = [];

// ─── petit mobilier ─────────────────────────────────────────────────────────
function benchModel() {
  return unitGeo((pb) => {
    for (let i = 0; i < 3; i++) pb.add(rbox(1.9, 0.05, 0.12, 0.02), MAT.woodObj, 0, 0.46, -0.16 + i * 0.16);
    for (let i = 0; i < 2; i++) pb.add(rbox(1.9, 0.12, 0.05, 0.02), MAT.woodObj, 0, 0.62 + i * 0.17, -0.26, [-0.2, 0, 0]);
    for (const x of [-0.8, 0.8]) { pb.add(rbox(0.06, 0.46, 0.5, 0.02), MAT.iron, x, 0.23, 0); pb.add(rbox(0.06, 0.42, 0.06, 0.02), MAT.iron, x, 0.66, -0.28); }
  });
}
function bollardModel() {
  return unitGeo((pb) => {
    pb.add(cyl(0.065, 0.075, 0.9, 10), MAT.iron, 0, 0.45, 0);
    pb.add(sphere(0.075, 10, 6), MAT.iron, 0, 0.92, 0);
    pb.add(cyl(0.08, 0.08, 0.05, 10), MAT.gold, 0, 0.75, 0);
  });
}
function binModel() {
  return unitGeo((pb) => {
    pb.add(new THREE.TorusGeometry(0.24, 0.02, 6, 16), MAT.iron, 0, 0.92, 0, [Math.PI / 2, 0, 0]);
    pb.add(cyl(0.03, 0.03, 0.95, 6), MAT.iron, 0, 0.47, -0.27);
    pb.add(cyl(0.23, 0.2, 0.62, 12), flat(0x9aa7a0, 'plastic', { roughness: 0.3, transparent: true, opacity: 0.8 }), 0, 0.58, 0);
  });
}
function terraceModel() {
  return unitGeo((pb) => {
    pb.add(cyl(0.35, 0.35, 0.03, 16), MAT.steel, 0, 0.74, 0);
    pb.add(cyl(0.025, 0.025, 0.72, 6), MAT.iron, 0, 0.37, 0);
    for (const a of [0, Math.PI]) {
      const x = Math.cos(a) * 0.62, z = Math.sin(a) * 0.62;
      pb.add(rbox(0.42, 0.04, 0.42, 0.02), flat(0x3a2a1e, 'plastic'), x, 0.45, z);
      pb.add(rbox(0.42, 0.4, 0.04, 0.02), flat(0x3a2a1e, 'plastic'), x + Math.cos(a) * 0.2, 0.66, z, [0, a + Math.PI / 2, 0]);
      for (const lx of [-0.18, 0.18]) for (const lz of [-0.18, 0.18]) pb.add(cyl(0.012, 0.012, 0.45, 4), MAT.iron, x + lx, 0.22, z + lz);
    }
    pb.add(cyl(0.02, 0.02, 2.3, 6), MAT.iron, 0, 1.15, 0);
    pb.add(new THREE.ConeGeometry(1.35, 0.5, 8, 1, true), flat(0xe8dcc6, 'matte', { side: THREE.DoubleSide }), 0, 2.3, 0);
  });
}

// ─── stationnement ──────────────────────────────────────────────────────────
const CAR_COLORS = [0x8f1c1c, 0x1d2f4a, 0xd8d6d0, 0x2c2e31, 0x5b6268, 0x9a9f9f, 0x274a38, 0x6b1d2c, 0xb8b3a6, 0x162033];
export const PARKED = [];
function placeParked() {
  const R = seeded(1500);
  for (const st of STREETS) {
    if (st.pave !== 'asphalt' || st.road < 6.4) continue;
    const off = st.road / 2 - 1.05;
    for (const side of [-1, 1]) {
      for (let t = st.from + 7; t < st.to - 7; t += 5.6) {
        if (R() < 0.42) continue;
        const cross = STREETS.some((o) => o.axis !== st.axis && o.d === st.d && Math.abs(o.c - t) < o.road / 2 + o.side + 4.5 && st.c >= o.from - 1 && st.c <= o.to + 1);
        if (cross) continue;
        const x = st.axis === 'x' ? st.c + side * off : t, z = st.axis === 'x' ? t : st.c + side * off;
        if (!free(x, z, 0.4)) continue;
        const rot = st.axis === 'x' ? (side > 0 ? Math.PI : 0) : (side > 0 ? -Math.PI / 2 : Math.PI / 2);
        PARKED.push({ x, z, rot, y: groundH(x, z), c: CAR_COLORS[Math.floor(R() * CAR_COLORS.length)] });
      }
    }
  }
}

export function buildProps() {
  placeLamps();
  lodSet('réverbères', LAMPS, [
    { parts: lampModel(), maxDist: 90 },
    { parts: [{ geo: cyl(0.07, 0.09, 4.9, 5).clone().translate(0, 2.45, 0), mat: MAT.iron }, { geo: new THREE.BoxGeometry(0.34, 0.45, 0.34).translate(0.78, 4.56, 0), mat: MAT.lampGlow }], maxDist: 260, shadow: false },
  ]);
  const lanternPos = LAMPS.map((l) => ({ x: l.x + Math.cos(-l.rot) * 0.78, y: l.y + 4.5, z: l.z + Math.sin(-l.rot) * 0.78 }));
  LAMPS.forEach((l, i) => { l.lx = lanternPos[i].x; l.ly = lanternPos[i].y; l.lz = lanternPos[i].z; });
  pools = glowLayer(LAMPS.map((l) => ({ x: l.lx, y: l.y + 0.03, z: l.lz })), 9, false, 0xffb870);
  halos = glowLayer(lanternPos, 1.6, true, 0xffc890);
  setLampLightCount(Q().lampLights);
  for (const l of LAMPS) addObstacle({ x: l.x - 0.15, z: l.z - 0.15, w: 0.3, d: 0.3, h: l.y + 5, tag: 'lamp' });

  // potelets aux abords des carrefours
  const bollards = [];
  for (const v of STREETS) for (const h of STREETS) {
    if (v.axis !== 'x' || h.axis !== 'z' || v.d !== h.d || v.side <= 0 || h.side <= 0) continue;
    if (h.c < v.from || h.c > v.to || v.c < h.from || v.c > h.to) continue;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) for (let k = 0; k < 3; k++) {
      const x = v.c + sx * (v.road / 2 + 0.3), z = h.c + sz * (h.road / 2 + h.side + 0.8 + k * 1.4);
      if (free(x, z, 0.2)) bollards.push({ x, z });
      const x2 = v.c + sx * (v.road / 2 + v.side + 0.8 + k * 1.4), z2 = h.c + sz * (h.road / 2 + 0.3);
      if (free(x2, z2, 0.2)) bollards.push({ x: x2, z: z2 });
    }
  }
  lodSet('potelets', bollards, [{ parts: bollardModel(), maxDist: 55, shadow: false }]);

  // bancs, poubelles, terrasses
  const R = seeded(77);
  const benches = [], bins = [], terraces = [];
  const bel = DIST_BY_NAME.Bellecour;
  for (let x = bel.x + 16; x < bel.x + bel.w - 16; x += 9) {
    benches.push({ x, z: bel.z + 12.2, rot: 0 }); benches.push({ x: x + 4, z: bel.z + bel.d - 12.2, rot: Math.PI });
  }
  for (const r of RIVERS) for (let z = 8; z < WORLD.h; z += 26) {
    if (BRIDGES.some((b) => Math.abs(z - b) < BRW + 4)) continue;
    benches.push({ x: r.x - 2.6, z, rot: Math.PI / 2 }); benches.push({ x: r.x + r.w + 2.6, z: z + 13, rot: -Math.PI / 2 });
  }
  for (const p of DISTRICTS.filter((dd) => dd.kind === 'park')) {
    for (let i = 0; i < 14; i++) benches.push({ x: p.x + 4 + R() * (p.w - 8), z: p.z + 4 + R() * (p.d - 8), rot: R() * 6.28 });
  }
  const okBench = benches.filter((b) => groundH(b.x, b.z) > -0.5 && !landmarkZone(b.x, b.z) && !OBST.some((o) => b.x > o.x - 1 && b.x < o.x + o.w + 1 && b.z > o.z - 1 && b.z < o.z + o.d + 1));
  lodSet('bancs', okBench, [{ parts: benchModel(), maxDist: 80 }]);
  for (const b of okBench) { addObstacle({ x: b.x - 0.5, z: b.z - 0.5, w: 1, d: 1, h: b.y ?? groundH(b.x, b.z) + 0.9, tag: 'bench' }); if (R() < 0.5) bins.push({ x: b.x + 1.4, z: b.z + 0.2 }); }
  for (const st of STREETS) {
    if (st.side < 2.4 || !(st.d.kind === 'urban' || st.d.kind === 'place' || st.d.kind === 'quai')) continue;
    if (R() > 0.35) continue;
    const t = st.from + (st.to - st.from) * (0.3 + R() * 0.4), off = st.road / 2 + st.side - 1.0, side = R() < 0.5 ? -1 : 1;
    for (let k = 0; k < 3; k++) {
      const tt = t + k * 2.4;
      const x = st.axis === 'x' ? st.c + side * off : tt, z = st.axis === 'x' ? tt : st.c + side * off;
      if (free(x, z, 0.5)) terraces.push({ x, z, rot: R() * 6.28 });
    }
  }
  lodSet('poubelles', bins.filter((b) => free(b.x, b.z, 0.3)), [{ parts: binModel(), maxDist: 60, shadow: false }]);
  lodSet('terrasses', terraces, [{ parts: terraceModel(), maxDist: 90 }]);
  for (const t of terraces) addObstacle({ x: t.x - 0.9, z: t.z - 0.9, w: 1.8, d: 1.8, h: groundH(t.x, t.z) + 2.4, tag: 'terrace' });

  // voitures garées
  placeParked();
  const m = MODELS.car;
  const bodyMat = carPaint(0xffffff);
  const trim = flat(0x121315, 'plastic', { roughness: 0.55 });
  lodSet('voitures garées', PARKED, [
    { parts: [
      { geo: m.body, mat: bodyMat, colored: true }, { geo: m.glass, mat: MAT.glass }, { geo: m.trim, mat: trim },
      { geo: m.head, mat: MAT.headLight }, { geo: m.tail, mat: MAT.redLight }, { geo: m.tires, mat: MAT.rubber }, { geo: m.rims, mat: MAT.steel },
    ], maxDist: 60 },
    { parts: [{ geo: m.lowBody, mat: bodyMat, colored: true }, { geo: m.lowGlass, mat: MAT.glass }], maxDist: 190, shadow: false },
  ], (it) => _col.setHex(it.c));
  for (const c of PARKED) {
    const alongX = Math.abs(Math.sin(c.rot)) > 0.5;
    addObstacle({ x: c.x - (alongX ? 2.15 : 0.9), z: c.z - (alongX ? 0.9 : 2.15), w: alongX ? 4.3 : 1.8, d: alongX ? 1.8 : 4.3, h: c.y + 1.5, tag: 'parked' });
  }
}

/**
 * Lumières dynamiques des réverbères proches du joueur. Leur nombre est fixe pour une
 * qualité donnée (changer le nombre de lumières recompile tous les shaders).
 */
export function setLampLightCount(n) {
  while (lights.length > n) scene.remove(lights.pop());
  while (lights.length < n) {
    const p = new THREE.PointLight(0xffb468, 0, 16, 2);
    p.name = 'lampe';
    scene.add(p); lights.push(p);
  }
}

// ─── nuit : lampes, flaques, halos, lumières dynamiques proches ────────────
let lightTimer = 0;
const _sorted = [];
export function updateProps(dt, focus) {
  const night = clamp((ATMO.night - 0.05) / 0.5, 0, 1);
  MAT.lampGlow.emissiveIntensity = night * 6;
  MAT.headLight.emissiveIntensity = 0.3 + night * 2.5;
  if (pools) {
    const fogD = scene.fog ? scene.fog.density * 0.8 : 0.003;
    pools.material.uniforms.uIntensity.value = night * 0.55;
    halos.material.uniforms.uIntensity.value = night * 1.1;
    pools.material.uniforms.uFogD.value = fogD; halos.material.uniforms.uFogD.value = fogD;
    pools.visible = halos.visible = night > 0.01;
  }
  lightTimer -= dt;
  if (lightTimer <= 0) {
    lightTimer = 0.35;
    _sorted.length = 0;
    for (const l of LAMPS) {
      const dx = l.lx - focus.x, dz = l.lz - focus.z;
      const dd = dx * dx + dz * dz;
      if (dd < 60 * 60) _sorted.push({ l, dd });
    }
    _sorted.sort((a, b) => a.dd - b.dd);
    lights.forEach((p, i) => {
      const s = _sorted[i];
      p.userData.on = !!s;
      if (s) p.position.set(s.l.lx, s.l.ly - 0.25, s.l.lz);
    });
  }
  for (const p of lights) p.intensity = p.userData.on ? night * 38 : 0;
}
