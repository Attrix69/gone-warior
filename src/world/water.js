// Fleuves (Saône, Rhône), quais, ponts et péniches amarrées.
import * as THREE from 'three';
import { scene } from '../core/renderer.js';
import { seeded } from '../core/math.js';
import { TEX, MAT, flat } from '../render/materials.js';
import { patchMaterial } from '../render/shaderPatch.js';
import { WORLD, RIVERS, BRIDGES, BRW } from './layout.js';
import { addObstacle } from './collision.js';
import { PartBuilder, rbox, cyl } from './geo.js';

export const WATER_Y = -0.55;

const WATER_VS = /* glsl */`
	vWPos = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;
`;
const WATER_PARS = /* glsl */`
uniform sampler2D tWave; uniform vec2 uFlow; uniform float uChop; uniform float uTime;
varying vec3 vWPos;
`;
const WATER_NORMAL = /* glsl */`
	{
		vec2 wp = vWPos.xz;
		vec3 n1 = texture2D( tWave, wp / 7.0 + uFlow * uTime ).xyz * 2.0 - 1.0;
		vec3 n2 = texture2D( tWave, wp / 13.0 - uFlow.yx * uTime * 0.6 + 0.37 ).xyz * 2.0 - 1.0;
		vec3 n3 = texture2D( tWave, wp / 2.3 + uFlow * uTime * 1.7 + 0.71 ).xyz * 2.0 - 1.0;
		vec2 nxy = ( n1.xy * 0.5 + n2.xy * 0.35 + n3.xy * 0.2 ) * uChop;
		vec3 wn = normalize( vec3( nxy.x, 1.0, nxy.y ) );
		normal = normalize( ( viewMatrix * vec4( wn, 0.0 ) ).xyz );
	}
`;
/** Matériau d'eau partagé (fleuves et lac). */
export function waterMaterial(flow = new THREE.Vector2(0, 0.05), color = 0x1f3a36, chop = 0.55) {
  const m = new THREE.MeshStandardMaterial({ color, roughness: 0.07, metalness: 0.0, envMapIntensity: 1.25 });
  patchMaterial(m, {
    key: 'water',
    uniforms: { tWave: { value: TEX.waterNormal }, uFlow: { value: flow }, uChop: { value: chop } },
    vertexPars: 'varying vec3 vWPos;', vertexMain: WATER_VS, fragmentPars: WATER_PARS,
    fragment: { normal_fragment_maps: WATER_NORMAL },
  });
  m.userData.shared = true;
  return m;
}

export function buildRivers() {
  const water = waterMaterial();
  const quay = new PartBuilder();
  const bridges = new PartBuilder();
  const Z0 = -520, Z1 = WORLD.h + 520;
  for (const r of RIVERS) {
    const g = new THREE.PlaneGeometry(r.w + 2, Z1 - Z0, 1, 1);
    g.rotateX(-Math.PI / 2);
    const w = new THREE.Mesh(g, water);
    w.position.set(r.x + r.w / 2, WATER_Y, (Z0 + Z1) / 2);
    w.receiveShadow = true;
    w.name = `fleuve-${r.name}`;
    scene.add(w);
    // murs de quai
    for (const side of [0, 1]) {
      const x = side ? r.x + r.w + 0.25 : r.x - 0.25;
      quay.add(rbox(0.5, 1.7, Z1 - Z0, 0.02), MAT.stone, x, -0.85, (Z0 + Z1) / 2);
      quay.add(rbox(0.7, 0.18, Z1 - Z0, 0.05), MAT.stoneGrey, x + (side ? 0.1 : -0.1), 0.06, (Z0 + Z1) / 2); // margelle
    }
    // obstacles : l'eau entre les ponts
    let prev = 0;
    for (const b of BRIDGES) {
      if (b - BRW > prev) addObstacle({ x: r.x, z: prev, w: r.w, d: b - BRW - prev, h: -1, tag: 'water' });
      prev = b + BRW;
    }
    if (WORLD.h > prev) addObstacle({ x: r.x, z: prev, w: r.w, d: WORLD.h - prev, h: -1, tag: 'water' });
    for (const b of BRIDGES) buildBridge(bridges, r, b);
    buildBarges(r);
  }
  scene.add(quay.build({ name: 'quais' }));
  scene.add(bridges.build({ name: 'ponts' }));
}

function buildBridge(pb, r, bz) {
  const span = r.w + 8, cx = r.x + r.w / 2;
  for (const s of [-1, 1]) {
    const z = bz + s * (BRW - 0.3);
    // mur de tympan (face latérale du pont) et parapet à balustres
    pb.add(rbox(span, 1.7, 0.6, 0.03), MAT.stone, cx, -0.8, z);
    pb.add(rbox(span, 0.22, 0.75, 0.05), MAT.stoneGrey, cx, 0.95, z);   // main courante
    pb.add(rbox(span, 0.18, 0.6, 0.04), MAT.stoneGrey, cx, 0.12, z);    // socle
    for (let x = -span / 2 + 0.4; x < span / 2 - 0.2; x += 0.42) {
      pb.add(cyl(0.09, 0.12, 0.66, 8), MAT.stone, cx + x, 0.54, z);
    }
    for (let i = -1; i <= 1; i++) {
      const ax = cx + i * (r.w / 3 + 0.4);
      pb.add(new THREE.TorusGeometry(1.6, 0.28, 6, 14, Math.PI), MAT.stoneGrey, ax, -1.45, z + s * 0.32, [0, 0, 0]);
    }
  }
  // piles
  for (const px of [cx - r.w / 4, cx + r.w / 4]) pb.add(rbox(1.4, 1.6, BRW * 2 - 0.6, 0.2), MAT.stone, px, -1.2, bz);
}

const HULLS = [0x1f2a33, 0x2a3a2e, 0x5a1f1b, 0x23272f, 0x3b2f24];
function buildBarges(r) {
  const R = seeded(r.x * 7);
  for (let i = 0; i < 7; i++) {
    const z = 20 + R() * 220;
    if (BRIDGES.some((b) => Math.abs(z - b) < 16)) continue;
    const len = 13 + R() * 5, wid = Math.min(3.6, r.w * 0.36);
    const side = R() < 0.5 ? -1 : 1;
    const pb = new PartBuilder();
    const hull = flat(HULLS[i % HULLS.length], 'paint', { roughness: 0.6 });
    pb.add(rbox(wid, 1.3, len, 0.4), hull, 0, 0.1, 0);
    pb.add(rbox(wid * 0.98, 0.12, len * 0.98, 0.05), MAT.wood, 0, 0.8, 0);
    pb.add(rbox(wid * 1.01, 0.14, len * 1.0, 0.06), flat(0xb8452f, 'paint'), 0, 0.72, 0); // liseré
    // cabine + timonerie
    const cab = flat(R() < 0.5 ? 0xe8e2d4 : 0x9a6b44, 'paint', { roughness: 0.55 });
    pb.add(rbox(wid * 0.8, 1.5, len * 0.38, 0.12), cab, 0, 1.6, -len * 0.18);
    pb.add(rbox(wid * 0.82, 0.12, len * 0.4, 0.05), MAT.metalDark, 0, 2.41, -len * 0.18);
    for (let k = 0; k < 4; k++) pb.add(rbox(0.05, 0.55, 0.8, 0.02), MAT.glass, (wid * 0.4 + 0.01) * (k % 2 ? 1 : -1), 1.8, -len * 0.3 + Math.floor(k / 2) * 1.4);
    pb.add(rbox(wid * 0.6, 1.0, 1.6, 0.1), cab, 0, 2.9, -len * 0.33);
    pb.add(rbox(wid * 0.62, 0.45, 1.62, 0.02), MAT.glass, 0, 3.0, -len * 0.33);
    // garde-corps, bouée, jardinières
    for (const sx of [-1, 1]) pb.add(cyl(0.025, 0.025, len * 0.5, 4), MAT.iron, sx * wid * 0.46, 1.25, len * 0.2, [Math.PI / 2, 0, 0]);
    pb.add(new THREE.TorusGeometry(0.28, 0.07, 6, 14), flat(0xe8e2d8, 'plastic'), side * -wid * 0.47, 1.9, -len * 0.05, [0, Math.PI / 2, 0]);
    for (let k = 0; k < 3; k++) pb.add(rbox(0.5, 0.35, 0.9, 0.05), MAT.wood, (R() - 0.5) * wid * 0.5, 1.05, len * (0.05 + k * 0.12));
    const g = pb.build({ name: 'péniche' });
    g.position.set(r.x + r.w / 2 + side * (r.w / 2 - wid / 2 - 0.4), WATER_Y - 0.25, z);
    g.userData.bob = R() * 6;
    scene.add(g);
    barges.push(g);
  }
}

export const barges = [];
export function updateWater(t) {
  for (const b of barges) {
    const ph = t * 0.7 + b.userData.bob;
    b.position.y = WATER_Y - 0.25 + Math.sin(ph) * 0.04;
    b.rotation.z = Math.sin(ph * 0.8) * 0.012;
    b.rotation.x = Math.cos(ph * 0.6) * 0.006;
  }
}
