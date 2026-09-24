// Sol de la ville : maillage en relief + shader qui mélange les matières PBR
// (asphalte, dalles, pavés, herbe, gravier) selon des masques dessinés depuis le plan.
import * as THREE from 'three';
import { scene } from '../core/renderer.js';
import { seeded } from '../core/math.js';
import { TEX } from '../render/materials.js';
import { patchMaterial } from '../render/shaderPatch.js';
import {
  WORLD, DISTRICTS, RIVERS, ROADS_V, ROADS_H, PARK, AVENUE_W, AVENUE_SIDE, STREETS, groundH,
} from './layout.js';

const K = 4; // pixels de masque par mètre

/**
 * Dessine les trois masques RGB :
 *  A = asphalte, dalles, pavés · B = herbe, gravier rouge, allée claire · C = peinture, crasse, flaques
 */
function drawMasks(footprints) {
  const W = WORLD.w * K, H = WORLD.h * K;
  const mk = () => { const c = document.createElement('canvas'); c.width = W; c.height = H; return [c, c.getContext('2d')]; };
  const [ca, a] = mk(), [cb, b] = mk(), [cc, c] = mk();
  a.fillStyle = '#00ff00'; a.fillRect(0, 0, W, H); // dalles par défaut
  b.fillStyle = '#000'; b.fillRect(0, 0, W, H);
  c.fillStyle = '#000'; c.fillRect(0, 0, W, H);
  const R = seeded(99);
  const rect = (g, col, x, z, w, d) => { g.fillStyle = col; g.fillRect(x * K, z * K, w * K, d * K); };
  const setA = (col, x, z, w, d) => { rect(a, col, x, z, w, d); rect(b, '#000', x, z, w, d); };
  const setB = (col, x, z, w, d) => { rect(a, '#000', x, z, w, d); rect(b, col, x, z, w, d); };

  for (const d of DISTRICTS) {
    if (d.kind === 'park') {
      setB('#ff0000', d.x, d.z, d.w, d.d);
      // allées en gravier clair
      b.lineCap = 'round';
      for (let i = 0; i < 5; i++) {
        let px = (d.x + R() * d.w) * K, pz = d.z * K;
        b.strokeStyle = '#0000ff'; b.lineWidth = (2.2 + R() * 1.2) * K;
        b.beginPath(); b.moveTo(px, pz);
        for (let s = 0; s < 7; s++) { px += (R() - 0.5) * 24 * K; pz += (d.d / 7) * K; b.lineTo(px, pz); }
        b.stroke();
      }
      a.lineCap = 'round';
      continue;
    }
    if (d.kind === 'old') setA('#0000ff', d.x, d.z, d.w, d.d);
    if (d.kind === 'place') {
      setB('#00ff00', d.x + 12, d.z + 9, d.w - 24, d.d - 18);
    }
  }
  // trottoirs des grands axes d'abord : les rues de quartier viennent s'y raccorder
  for (const rx of ROADS_V) setA('#00ff00', rx - AVENUE_W - AVENUE_SIDE, 0, (AVENUE_W + AVENUE_SIDE) * 2, WORLD.h);
  for (const rz of ROADS_H) setA('#00ff00', 0, rz - AVENUE_W - AVENUE_SIDE, WORLD.w, (AVENUE_W + AVENUE_SIDE) * 2);
  // rues de quartier : chaussée, trottoirs, bordures
  for (const st of STREETS) {
    const half = st.road / 2, sideCol = st.pave === 'cobble' ? '#0000ff' : '#00ff00', roadCol = st.pave === 'cobble' ? '#0000ff' : '#ff0000';
    const len = st.to - st.from;
    const band = (g, col, off, w) => (st.axis === 'x' ? rect(g, col, st.c + off, st.from, w, len) : rect(g, col, st.from, st.c + off, len, w));
    band(a, sideCol, -half - st.side, (half + st.side) * 2); band(b, '#000', -half - st.side, (half + st.side) * 2);
    band(a, roadCol, -half, half * 2);
    if (st.side > 0) { band(c, 'rgb(0,110,0)', -half - 0.05, 0.3); band(c, 'rgb(0,110,0)', half - 0.25, 0.3); }
  }
  // passages piétons aux carrefours (rues asphaltées)
  c.fillStyle = 'rgb(255,0,0)';
  const asph = STREETS.filter((st) => st.pave === 'asphalt');
  for (const v of asph) for (const h of asph) {
    if (v.axis !== 'x' || h.axis !== 'z' || v.d !== h.d) continue;
    if (h.c < v.from || h.c > v.to || v.c < h.from || v.c > h.to) continue;
    const zc = h.road / 2 + h.side + 1.6, xc = v.road / 2 + v.side + 1.6;
    for (const sgn of [-1, 1]) {
      const zz = h.c + sgn * zc, xx = v.c + sgn * xc;
      if (zz - 1.2 > v.from && zz + 1.2 < v.to) for (let i = -v.road / 2 + 0.5; i < v.road / 2 - 0.3; i += 1.0) c.fillRect((v.c + i) * K, (zz - 1.2) * K, 0.5 * K, 2.4 * K);
      if (xx - 1.2 > h.from && xx + 1.2 < h.to) for (let i = -h.road / 2 + 0.5; i < h.road / 2 - 0.3; i += 1.0) c.fillRect((xx - 1.2) * K, (h.c + i) * K, 2.4 * K, 0.5 * K);
    }
  }
  // grands axes
  for (const rx of ROADS_V) {
    setA('#ff0000', rx - AVENUE_W, 0, AVENUE_W * 2, WORLD.h);
    c.fillStyle = 'rgb(255,0,0)';
    for (let z = 0; z < WORLD.h; z += 7) c.fillRect((rx - 0.08) * K, z * K, 0.16 * K, 3.5 * K);
    c.fillRect((rx - AVENUE_W + 0.3) * K, 0, 0.12 * K, WORLD.h * K);
    c.fillRect((rx + AVENUE_W - 0.42) * K, 0, 0.12 * K, WORLD.h * K);
  }
  for (const rz of ROADS_H) {
    setA('#ff0000', 0, rz - AVENUE_W, WORLD.w, AVENUE_W * 2);
    c.fillStyle = 'rgb(255,0,0)';
    for (let x = 0; x < WORLD.w; x += 7) c.fillRect(x * K, (rz - 0.08) * K, 3.5 * K, 0.16 * K);
    c.fillRect(0, (rz - AVENUE_W + 0.3) * K, WORLD.w * K, 0.12 * K);
    c.fillRect(0, (rz + AVENUE_W - 0.42) * K, WORLD.w * K, 0.12 * K);
  }
  // dépôt de bus : asphalte + places
  setA('#ff0000', PARK.x, PARK.z, PARK.w, PARK.d);
  c.fillStyle = 'rgb(255,0,0)';
  for (let i = 0; i <= PARK.bays; i++) {
    const x = PARK.x + 3 + i * 2.7;
    c.fillRect((x - 0.06) * K, (PARK.z + 3) * K, 0.12 * K, 5.2 * K);
    c.fillRect((x - 0.06) * K, (PARK.z + 10) * K, 0.12 * K, 5.2 * K);
  }
  for (let i = 0; i < PARK.busBays; i++) c.fillRect((PARK.x + 2) * K, (PARK.z + 20 + i * 5) * K, 14 * K, 0.14 * K);
  // quais en dalles le long des fleuves
  for (const r of RIVERS) { setA('#00ff00', r.x - 3.5, 0, 3.5, WORLD.h); setA('#00ff00', r.x + r.w, 0, 3.5, WORLD.h); }

  // crasse : pied des immeubles, bordures, taches
  c.globalCompositeOperation = 'lighter';
  for (const f of footprints) {
    const rr = Math.max(f.w, f.d) * 0.5 + 2.2;
    const g = c.createRadialGradient(f.x * K, f.z * K, Math.max(f.w, f.d) * 0.45 * K, f.x * K, f.z * K, rr * K);
    g.addColorStop(0, 'rgba(0,150,0,1)'); g.addColorStop(1, 'rgba(0,0,0,1)');
    c.fillStyle = g; c.fillRect((f.x - rr) * K, (f.z - rr) * K, rr * 2 * K, rr * 2 * K);
  }
  for (let i = 0; i < 900; i++) {
    const x = R() * WORLD.w, z = R() * WORLD.h, r = 0.6 + R() * 2.6;
    const g = c.createRadialGradient(x * K, z * K, 0, x * K, z * K, r * K);
    g.addColorStop(0, `rgba(0,${40 + R() * 50 | 0},${R() < 0.5 ? 160 : 0},1)`); g.addColorStop(1, 'rgba(0,0,0,1)');
    c.fillStyle = g; c.fillRect((x - r) * K, (z - r) * K, r * 2 * K, r * 2 * K);
  }
  c.globalCompositeOperation = 'source-over';

  const tex = (canvas) => {
    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = THREE.NoColorSpace; t.flipY = false;
    t.minFilter = THREE.LinearMipmapLinearFilter; t.anisotropy = 4; t.userData.shared = true;
    return t;
  };
  return [tex(ca), tex(cb), tex(cc)];
}

const GROUND_PARS = /* glsl */`
uniform sampler2D tMaskA; uniform sampler2D tMaskB; uniform sampler2D tMaskC; uniform sampler2D tMacro;
uniform sampler2DArray tAlb; uniform sampler2DArray tNrm; uniform sampler2DArray tOrm;
uniform vec2 uWorld; uniform float uTile[ 5 ];
uniform float uWet;
varying vec3 vGPos; varying vec3 vGNrm;
`;
const GROUND_VERTEX = /* glsl */`
	vGPos = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;
	vGNrm = normalize( mat3( modelMatrix ) * objectNormal );
`;
// Échantillonne une couche (couleur, normale xy, ORM) avec variation macro.
const GROUND_MAP = /* glsl */`
	vec2 gw = vGPos.xz;
	vec2 muv = gw / uWorld;
	vec3 mA = texture2D( tMaskA, muv ).rgb, mB = texture2D( tMaskB, muv ).rgb, mC = texture2D( tMaskC, muv ).rgb;
	vec4 macro = texture2D( tMacro, gw / 96.0 );
	vec4 macro2 = texture2D( tMacro, gw / 23.0 + 0.37 );
	float wl[ 5 ];
	wl[ 0 ] = mA.r; wl[ 1 ] = mA.g; wl[ 2 ] = mA.b; wl[ 3 ] = mB.r; wl[ 4 ] = mB.g + mB.b;
	vec3 gAlb = vec3( 0.0 ); vec2 gN = vec2( 0.0 ); vec3 gOrm = vec3( 0.0 ); float wsum = 0.0;
	for ( int i = 0; i < 5; i ++ ) {
		float w = wl[ i ];
		if ( w < 0.02 ) continue;
		vec3 uvl = vec3( gw / uTile[ i ], float( i ) );
		vec3 orm = texture( tOrm, uvl ).rgb;
		w = pow( w * ( 0.35 + orm.r ), 3.0 );
		vec3 alb = texture( tAlb, uvl ).rgb;
		if ( i == 4 ) alb = mix( alb, alb * vec3( 1.25, 1.35, 1.45 ) + vec3( 0.06, 0.05, 0.03 ), mB.b / max( wl[ 4 ], 0.001 ) );
		gAlb += alb * w; gN += ( texture( tNrm, uvl ).xy * 2.0 - 1.0 ) * w; gOrm += orm * w; wsum += w;
	}
	gAlb /= max( wsum, 1e-4 ); gN /= max( wsum, 1e-4 ); gOrm /= max( wsum, 1e-4 );
	// Variation à grande échelle : taches, usure, rapiéçages d'asphalte.
	gAlb *= 0.82 + 0.36 * macro.r;
	float patchA = smoothstep( 0.6, 0.62, macro2.b ) * mA.r;
	gAlb = mix( gAlb, gAlb * 0.84, patchA );
	gOrm.g = mix( gOrm.g, gOrm.g * 0.9, patchA );
	// Marquages : peinture blanche usée.
	float wear = smoothstep( 0.25, 0.75, texture2D( tMacro, gw / 3.0 ).g );
	float paint = mC.r * ( 0.55 + 0.45 * wear );
	gAlb = mix( gAlb, vec3( 0.62, 0.62, 0.6 ), paint );
	gOrm.g = mix( gOrm.g, 0.55, paint );
	// Crasse (pied des murs, taches)
	float grime = mC.g * ( 0.6 + 0.4 * macro.g );
	gAlb *= 1.0 - grime * 0.45;
	gOrm.g = min( 1.0, gOrm.g + grime * 0.08 );
	gOrm.r *= 1.0 - grime * 0.35;
	// Pluie : sol assombri, flaques miroir dans les creux.
	float puddle = smoothstep( 0.55, 0.7, mC.b * 0.6 + macro2.r * 0.7 ) * uWet * ( 1.0 - wl[ 3 ] );
	gAlb *= 1.0 - uWet * 0.35;
	gOrm.g = mix( gOrm.g, gOrm.g * 0.55, uWet );
	gOrm.g = mix( gOrm.g, 0.03, puddle );
	gN *= 1.0 - puddle;
	diffuseColor.rgb *= gAlb;
`;
const GROUND_NORMAL = /* glsl */`
	{
		vec3 gBase = normalize( vGNrm );
		vec3 gWn = normalize( gBase + vec3( gN.x, 0.0, gN.y ) );
		normal = normalize( ( viewMatrix * vec4( gWn, 0.0 ) ).xyz );
	}
`;
const GROUND_AO = /* glsl */`
	float ambientOcclusion = gOrm.r;
	reflectedLight.indirectDiffuse *= ambientOcclusion;
	#if defined( USE_ENVMAP ) && defined( STANDARD )
		float dotNV = saturate( dot( geometryNormal, geometryViewDir ) );
		reflectedLight.indirectSpecular *= computeSpecularOcclusion( dotNV, ambientOcclusion, material.roughness );
	#endif
`;

export let groundMesh = null;

export function buildTerrain(footprints) {
  const seg = Math.round(WORLD.w / 2);
  const geo = new THREE.PlaneGeometry(WORLD.w, WORLD.h, seg, Math.round(seg * WORLD.h / WORLD.w));
  geo.rotateX(-Math.PI / 2);
  geo.translate(WORLD.w / 2, 0, WORLD.h / 2);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setY(i, groundH(pos.getX(i), pos.getZ(i)));
  geo.computeVertexNormals();
  const [mA, mB, mC] = drawMasks(footprints);
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, metalness: 0 });
  patchMaterial(mat, {
    key: 'ground',
    uniforms: {
      tMaskA: { value: mA }, tMaskB: { value: mB }, tMaskC: { value: mC }, tMacro: { value: TEX.macro.map },
      tAlb: { value: TEX.ground.map }, tNrm: { value: TEX.ground.normalMap }, tOrm: { value: TEX.ground.ormMap },
      uWorld: { value: new THREE.Vector2(WORLD.w, WORLD.h) }, uTile: { value: TEX.ground.tiles },
    },
    vertexPars: 'varying vec3 vGPos; varying vec3 vGNrm;', vertexMain: GROUND_VERTEX,
    fragmentPars: GROUND_PARS,
    fragment: {
      map_fragment: GROUND_MAP,
      roughnessmap_fragment: 'float roughnessFactor = roughness * gOrm.g;',
      normal_fragment_maps: GROUND_NORMAL,
      aomap_fragment: GROUND_AO,
    },
  });
  groundMesh = new THREE.Mesh(geo, mat);
  groundMesh.receiveShadow = true;
  groundMesh.name = 'ground';
  scene.add(groundMesh);
  buildOuterGround();
}

/** Sol au-delà des limites jouables (la ville continue dans le brouillard). */
function buildOuterGround() {
  // Grands rectangles autour de la carte, interrompus par les couloirs des fleuves.
  const E = 640, xs = [-E];
  for (const r of RIVERS) xs.push(r.x - 1, r.x + r.w + 1);
  xs.push(WORLD.w + E);
  const rects = [];
  for (let i = 0; i < xs.length; i += 2) {
    const x0 = xs[i], x1 = xs[i + 1];
    rects.push([x0, -E, x1, 0], [x0, WORLD.h, x1, WORLD.h + E]);
    if (x0 < 0) rects.push([x0, 0, Math.min(0, x1), WORLD.h]);
    if (x1 > WORLD.w) rects.push([Math.max(WORLD.w, x0), 0, x1, WORLD.h]);
  }
  const P = [], N = [], I = [];
  for (const [x0, z0, x1, z1] of rects) {
    if (x1 <= x0 || z1 <= z0) continue;
    const b = P.length / 3;
    P.push(x0, -0.02, z0, x1, -0.02, z0, x1, -0.02, z1, x0, -0.02, z1);
    N.push(0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0);
    I.push(b, b + 2, b + 1, b, b + 3, b + 2);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  geo.setIndex(I);
  const mat = new THREE.MeshStandardMaterial({ color: 0x5b5956, roughness: 0.95 });
  patchMaterial(mat, {
    key: 'outerGround',
    uniforms: { tMacro: { value: TEX.macro.map } },
    vertexPars: 'varying vec2 vOG;', vertexMain: 'vOG = ( modelMatrix * vec4( transformed, 1.0 ) ).xz;',
    fragmentPars: 'uniform sampler2D tMacro; varying vec2 vOG;',
    fragment: { map_fragment: 'vec4 om = texture2D( tMacro, vOG / 140.0 ); diffuseColor.rgb *= mix( vec3( 0.55, 0.53, 0.5 ), vec3( 0.42, 0.5, 0.33 ), smoothstep( 0.55, 0.7, om.b ) ) * ( 0.7 + 0.6 * om.r );' },
  });
  const m = new THREE.Mesh(geo, mat);
  m.receiveShadow = true;
  m.name = 'outerGround';
  scene.add(m);
}
