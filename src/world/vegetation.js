// Végétation : platanes d'alignement (avenues, quais, places) et arbres des parcs.
// Tronc + fourche instanciés (écorce tachetée procédurale), houppier en cartes de
// feuillage instanciées : ombrage volumique (normale radiale), vent, ombres portées.
import * as THREE from 'three';
import { scene } from '../core/renderer.js';
import { seeded, hash01 } from '../core/math.js';
import { TEX } from '../render/materials.js';
import { patchMaterial } from '../render/shaderPatch.js';
import {
  WORLD, DISTRICTS, RIVERS, ROADS_V, ROADS_H, AVENUE_W, AVENUE_SIDE, BRIDGES, BRW, DIST_BY_NAME, groundH, onRoad, landmarkZone, inWater,
} from './layout.js';
import { OBST, addObstacle } from './collision.js';

export const TREES = [];

function leafTexture() {
  const S = 512, c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d');
  const R = seeded(12);
  // rameaux
  g.strokeStyle = 'rgba(70,52,34,0.9)'; g.lineWidth = 3;
  for (let i = 0; i < 9; i++) {
    g.beginPath(); g.moveTo(S / 2, S / 2);
    const a = R() * Math.PI * 2; g.lineTo(S / 2 + Math.cos(a) * S * 0.45, S / 2 + Math.sin(a) * S * 0.45); g.stroke();
  }
  // feuilles de platane (5 lobes)
  for (let i = 0; i < 230; i++) {
    const r = Math.sqrt(R()) * S * 0.46, a = R() * Math.PI * 2;
    const x = S / 2 + Math.cos(a) * r, y = S / 2 + Math.sin(a) * r, s = 16 + R() * 20, rot = R() * Math.PI * 2;
    const light = R();
    const h = 88 + R() * 26, sat = 38 + R() * 22, l = 22 + light * 20 + (r / S) * 12;
    g.fillStyle = `hsl(${h},${sat}%,${l}%)`;
    g.save(); g.translate(x, y); g.rotate(rot); g.beginPath();
    for (let k = 0; k <= 10; k++) {
      const ang = (k / 10) * Math.PI * 2, rad = k % 2 ? s * 0.45 : s;
      g.lineTo(Math.cos(ang) * rad, Math.sin(ang) * rad * 0.9);
    }
    g.closePath(); g.fill();
    g.strokeStyle = `hsla(${h},${sat}%,${l + 12}%,0.5)`; g.lineWidth = 1;
    g.beginPath(); g.moveTo(0, 0); g.lineTo(s * 0.8, 0); g.stroke();
    g.restore();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; t.userData.shared = true;
  return t;
}

function trunkGeometry() {
  const parts = [];
  const trunk = new THREE.CylinderGeometry(0.17, 0.3, 3.4, 8, 4);
  trunk.translate(0, 1.7, 0);
  parts.push(trunk);
  for (const [ax, az, len] of [[0.55, 0.2, 2.6], [-0.5, -0.3, 2.4], [0.1, -0.6, 2.2]]) {
    const b = new THREE.CylinderGeometry(0.07, 0.14, len, 6);
    b.translate(0, len / 2, 0);
    b.rotateX(az); b.rotateZ(-ax);
    b.translate(0, 3.2, 0);
    parts.push(b);
  }
  const merged = mergeSimple(parts);
  return merged;
}

function mergeSimple(geos) {
  let n = 0;
  const nonIdx = geos.map((g) => (g.index ? g.toNonIndexed() : g));
  for (const g of nonIdx) n += g.attributes.position.count;
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), uv = new Float32Array(n * 2);
  let o = 0;
  for (const g of nonIdx) {
    pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3); uv.set(g.attributes.uv.array, o * 2);
    o += g.attributes.position.count;
  }
  const m = new THREE.BufferGeometry();
  m.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  m.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  m.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return m;
}

function placeTrees() {
  const R = seeded(880);
  const ok = (x, z, clear = 1.4) => x > 1 && x < WORLD.w - 1 && z > 1 && z < WORLD.h - 1 && groundH(x, z) > -0.5 && !inWater(x, z)
    && !landmarkZone(x, z) && !OBST.some((o) => x > o.x - clear && x < o.x + o.w + clear && z > o.z - clear && z < o.z + o.d + clear);
  const push = (x, z, s) => { if (ok(x, z)) TREES.push({ x, z, gy: groundH(x, z), s, t: R() }); };
  // alignements le long des avenues (sur le trottoir, côté chaussée)
  const off = AVENUE_W + AVENUE_SIDE * 0.45;
  for (const rx of ROADS_V) for (let z = 6; z < WORLD.h; z += 11) {
    if (ROADS_H.some((rz) => Math.abs(z - rz) < AVENUE_W + 5)) continue;
    push(rx - off, z, 0.9 + R() * 0.25); push(rx + off, z + 5, 0.9 + R() * 0.25);
  }
  for (const rz of ROADS_H) for (let x = 6; x < WORLD.w; x += 11) {
    if (ROADS_V.some((rx) => Math.abs(x - rx) < AVENUE_W + 5)) continue;
    if (RIVERS.some((r) => x > r.x - 6 && x < r.x + r.w + 6)) continue;
    push(x, rz - off, 0.9 + R() * 0.25); push(x + 5, rz + off, 0.9 + R() * 0.25);
  }
  // quais
  for (const r of RIVERS) for (let z = 4; z < WORLD.h; z += 9) {
    if (BRIDGES.some((b) => Math.abs(z - b) < BRW + 3)) continue;
    push(r.x - 2.4, z, 1 + R() * 0.3); push(r.x + r.w + 2.4, z + 4, 1 + R() * 0.3);
  }
  // Bellecour : alignements sur les longs côtés
  const b = DIST_BY_NAME.Bellecour;
  for (let x = b.x + 14; x < b.x + b.w - 14; x += 7) { push(x, b.z + 10.5, 1.05); push(x, b.z + b.d - 10.5, 1.05); }
  // parcs : bosquets
  for (const d of DISTRICTS) {
    if (d.kind !== 'park') continue;
    const n = Math.floor((d.w * d.d) / 70);
    for (let i = 0; i < n; i++) {
      const x = d.x + 2 + R() * (d.w - 4), z = d.z + 2 + R() * (d.d - 4);
      if (onRoad(x, z, 1.5)) continue;
      push(x, z, 0.8 + R() * 0.7);
    }
  }
}

const FOLIAGE_VERTEX_PARS = /* glsl */`
attribute vec4 aCrown; // centre du houppier (xyz) + graine
uniform float uTime; uniform vec2 uWind;
varying float vLeafShade;
`;
// Normale radiale depuis le centre du houppier (ombrage « volumique » du feuillage),
// identique sur les deux faces des cartes.
const FOLIAGE_NORMAL_VERTEX = /* glsl */`
	vec3 objectNormal = vec3( 0.0, 1.0, 0.0 );
	vec3 leafWorldN;
	{
		vec4 wp = modelMatrix * instanceMatrix * vec4( position, 1.0 );
		vec3 radial = wp.xyz - aCrown.xyz;
		leafWorldN = normalize( radial * vec3( 1.0, 1.3, 1.0 ) + vec3( 0.0, 0.25, 0.0 ) );
		vLeafShade = clamp( length( radial ) / 3.2, 0.35, 1.0 );
	}
`;
const FOLIAGE_DEFAULT_NORMAL = /* glsl */`vec3 transformedNormal = normalize( ( viewMatrix * vec4( leafWorldN, 0.0 ) ).xyz );`;
const FOLIAGE_NORMAL_BEGIN = /* glsl */`
	float faceDirection = gl_FrontFacing ? 1.0 : - 1.0;
	vec3 normal = normalize( vNormal );
	vec3 nonPerturbedNormal = normal;
`;
const FOLIAGE_BEGIN_VERTEX = /* glsl */`
	vec3 transformed = vec3( position );
	{
		float ph = uTime * 1.3 + aCrown.w * 20.0;
		float gust = 0.6 + 0.4 * sin( uTime * 0.37 + aCrown.x * 0.05 );
		vec3 sway = vec3( uWind.x, 0.0, uWind.y ) * ( sin( ph ) * 0.12 + sin( ph * 2.7 + position.x * 3.0 ) * 0.04 ) * gust;
		transformed += ( inverse( mat3( instanceMatrix ) ) * sway );
	}
`;

export function buildVegetation() {
  placeTrees();
  const n = TREES.length;
  // troncs
  const barkMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92 });
  patchMaterial(barkMat, {
    key: 'bark',
    uniforms: { tMacro: { value: TEX.macro.map } },
    vertexPars: 'varying vec3 vBP;', vertexMain: 'vBP = ( modelMatrix * instanceMatrix * vec4( transformed, 1.0 ) ).xyz;',
    fragmentPars: 'uniform sampler2D tMacro; varying vec3 vBP;',
    fragment: {
      map_fragment: `{
        float m = texture2D( tMacro, vec2( vBP.x * 0.9 + vBP.z * 0.7, vBP.y * 0.35 ) ).g;
        vec3 olive = vec3( 0.36, 0.34, 0.24 ), cream = vec3( 0.72, 0.68, 0.55 ), grey = vec3( 0.46, 0.44, 0.40 );
        vec3 bark = mix( olive, cream, smoothstep( 0.45, 0.55, m ) );
        bark = mix( bark, grey, smoothstep( 0.62, 0.7, texture2D( tMacro, vBP.xy * 0.4 ).r ) );
        diffuseColor.rgb *= bark * bark;
      }`,
    },
  });
  const trunks = new THREE.InstancedMesh(trunkGeometry(), barkMat, n);
  trunks.castShadow = true; trunks.receiveShadow = true; trunks.name = 'troncs';
  // houppiers
  const CARDS = 34;
  const leafMat = new THREE.MeshStandardMaterial({ map: leafTexture(), alphaTest: 0.42, side: THREE.DoubleSide, roughness: 0.78, metalness: 0 });
  patchMaterial(leafMat, {
    key: 'foliage',
    vertexPars: FOLIAGE_VERTEX_PARS,
    vertex: { beginnormal_vertex: FOLIAGE_NORMAL_VERTEX, defaultnormal_vertex: FOLIAGE_DEFAULT_NORMAL, begin_vertex: FOLIAGE_BEGIN_VERTEX },
    fragmentPars: 'varying float vLeafShade;',
    fragment: {
      normal_fragment_begin: FOLIAGE_NORMAL_BEGIN,
      color_fragment: '#include <color_fragment>\n diffuseColor.rgb *= mix( 0.45, 1.05, vLeafShade );',
      // translucidité : la lumière traverse le feuillage à contre-jour
      emissivemap_fragment: '#include <emissivemap_fragment>\n totalEmissiveRadiance += diffuseColor.rgb * 0.06;',
    },
  });
  const cards = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), leafMat, n * CARDS);
  cards.castShadow = true; cards.receiveShadow = true; cards.name = 'feuillage';
  const aCrown = new THREE.InstancedBufferAttribute(new Float32Array(n * CARDS * 4), 4);
  cards.geometry.setAttribute('aCrown', aCrown);
  const d = new THREE.Object3D(), col = new THREE.Color();
  TREES.forEach((t, i) => {
    const s = t.s * 1.25;
    d.position.set(t.x, t.gy - 0.1, t.z); d.rotation.set(0, t.t * 6.28, 0); d.scale.setScalar(s); d.updateMatrix();
    trunks.setMatrixAt(i, d.matrix);
    const cx = t.x, cy = t.gy + 5.6 * s, cz = t.z;
    for (let k = 0; k < CARDS; k++) {
      const j = i * CARDS + k, h = (a) => hash01(j * 7 + a);
      const u = h(1) * 2 - 1, th = h(2) * Math.PI * 2, rr = Math.cbrt(h(3));
      const sx = Math.sqrt(1 - u * u) * Math.cos(th), sz = Math.sqrt(1 - u * u) * Math.sin(th);
      d.position.set(cx + sx * rr * 2.9 * s, cy + u * rr * 2.1 * s, cz + sz * rr * 2.9 * s);
      d.rotation.set(h(4) * Math.PI, h(5) * Math.PI * 2, h(6) * Math.PI);
      d.scale.setScalar((1.7 + h(7) * 1.2) * s);
      d.updateMatrix();
      cards.setMatrixAt(j, d.matrix);
      aCrown.setXYZW(j, cx, cy, cz, t.t);
      col.setHSL(0.24 + t.t * 0.06, 0.35 + h(8) * 0.2, 0.42 + h(9) * 0.2);
      cards.setColorAt(j, col);
    }
    addObstacle({ x: t.x - 0.3, z: t.z - 0.3, w: 0.6, d: 0.6, h: t.gy + 4, tag: 'tree' });
  });
  trunks.instanceMatrix.needsUpdate = true; cards.instanceMatrix.needsUpdate = true;
  cards.instanceColor.needsUpdate = true;
  trunks.computeBoundingSphere(); cards.computeBoundingSphere();
  scene.add(trunks, cards);
}
