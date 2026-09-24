// Monuments et lieux emblématiques (fiction inspirée de Lyon). Chaque monument est
// assemblé puis fusionné par matériau ; les parties animées restent des objets séparés.
import * as THREE from 'three';
import { scene } from '../core/renderer.js';
import { seeded } from '../core/math.js';
import { MAT, triMat, flat } from '../render/materials.js';
import { patchMaterial } from '../render/shaderPatch.js';
import { DIST_BY_NAME, PARK, groundH } from './layout.js';
import { block } from './collision.js';
import { PartBuilder, rbox, cyl, sphere } from './geo.js';
import { waterMaterial } from './water.js';

export const animated = []; // { g, axis, v }
const OCCLUDERS = [];

/** Rend un groupe fusionné « effaçable » pour la caméra (attribut aHide par sommet). */
function fadable(group) {
  const attrs = [];
  group.traverse((o) => {
    if (!o.isMesh) return;
    const a = new THREE.BufferAttribute(new Float32Array(o.geometry.attributes.position.count), 1);
    a.setUsage(THREE.DynamicDrawUsage);
    o.geometry.setAttribute('aHide', a);
    attrs.push(a);
  });
  const occ = { kind: 'group', value: 0, target: 0, attrs };
  OCCLUDERS.push(occ);
  return occ;
}

/** Ajoute un monument : fusion, ombres, collisions (boîtes [x, z, w, d, h]). */
function place(pb, x, y, z, boxes = [], name = '', { rotY = 0, fade = true } = {}) {
  const g = pb.build({ name });
  g.position.set(x, y, z);
  g.rotation.y = rotY;
  scene.add(g);
  const occ = fade ? fadable(g) : null;
  for (const [bx, bz, bw, bd, bh] of boxes) {
    const o = block(bx, bz, bw, bd, y + bh, name);
    if (occ) o.occluder = occ;
  }
  return g;
}

// Mur-rideau : trame de meneaux en coordonnées monde, vitrage réfléchissant, bureaux
// éclairés la nuit.
function curtainWall(tint = 0x5f7890, cell = new THREE.Vector2(1.6, 3.8)) {
  const m = new THREE.MeshStandardMaterial({ color: tint, roughness: 0.06, metalness: 0.65, envMapIntensity: 1.3 });
  patchMaterial(m, {
    key: 'curtain',
    uniforms: { uCell: { value: cell } },
    vertexPars: 'varying vec3 vCW; varying vec3 vCWN;',
    vertexMain: 'vCW = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz; vCWN = normalize( mat3( modelMatrix ) * objectNormal );',
    fragmentPars: /* glsl */`
      uniform vec2 uCell; uniform float uNight; varying vec3 vCW; varying vec3 vCWN;
      float cwh( vec3 p ) { p = fract( p * 0.1031 ); p += dot( p, p.zyx + 31.32 ); return fract( ( p.x + p.y ) * p.z ); }`,
    fragment: {
      map_fragment: /* glsl */`
        vec3 an = abs( normalize( vCWN ) );
        float h = an.x > an.z ? vCW.z : vCW.x;
        vec2 g = vec2( h / uCell.x, vCW.y / uCell.y );
        vec2 f = abs( fract( g ) - 0.5 );
        float mull = an.y > 0.7 ? 1.0 : max( step( 0.47, f.x ), step( 0.44, f.y ) );
        float cwLit = step( 0.7 - uNight * 0.1, cwh( vec3( floor( g ), floor( vCW.x + vCW.z ) ) ) ) * ( 1.0 - mull );
        diffuseColor.rgb = mix( diffuseColor.rgb, vec3( 0.16, 0.17, 0.18 ), mull );`,
      roughnessmap_fragment: 'float roughnessFactor = mix( roughness, 0.45, mull );',
      emissivemap_fragment: 'totalEmissiveRadiance += vec3( 0.75, 0.85, 1.0 ) * cwLit * uNight * 0.9;',
    },
  });
  m.userData.shared = true;
  return m;
}

function signTexture(txt, sub) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#14100c'; g.fillRect(0, 0, 512, 128);
  g.fillStyle = '#a8231b'; g.fillRect(0, 0, 512, 8); g.fillStyle = '#0f6a37'; g.fillRect(0, 120, 512, 8);
  g.textAlign = 'center'; g.font = '700 60px "Barlow Condensed", Impact, sans-serif';
  const gr = g.createLinearGradient(0, 20, 0, 96); gr.addColorStop(0, '#ffe7a8'); gr.addColorStop(1, '#ff9d2e');
  g.fillStyle = gr; g.fillText(txt, 256, 72);
  g.font = '500 22px Inter, sans-serif'; g.fillStyle = '#f3e9d8'; g.fillText(sub, 256, 106);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

export function buildLandmarks() {
  const D = DIST_BY_NAME;
  const stone = triMat('ashlar', { color: 0xf4ead8 });
  const white = triMat('plaster', { color: 0xf0ebe0, tile: 4 });
  const cream = triMat('plaster', { color: 0xe6d6b8, tile: 4 });
  const dark = flat(0x1b1e24, 'paint', { roughness: 0.35, metalness: 0.4 });
  const lead = triMat('zinc', { color: 0x6d737a, metalness: 0.8, useMetal: true, tile: 2 });
  const slate = MAT.slate;
  const gold = MAT.gold, bronze = MAT.bronze, iron = MAT.iron, glass = MAT.glass;
  const metal = flat(0xa3a7ad, 'metal', { roughness: 0.45 });

  // ── Fourvière : basilique + tour métallique ──
  {
    const d = D['Fourvière'], gy = groundH(d.cx, d.cz), pb = new PartBuilder();
    pb.add(rbox(20, 24, 14, 0.3), stone, 0, 12, 0);
    pb.add(rbox(20.6, 1.2, 14.6, 0.2), stone, 0, 24.4, 0);
    pb.add(new THREE.CylinderGeometry(0.01, 10.4, 5, 4, 1), lead, 0, 27.2, 0, [0, Math.PI / 4, 0], [1, 1, 0.68]);
    // portique : colonnes et fronton
    for (let i = -3; i <= 3; i++) pb.add(cyl(0.55, 0.62, 9, 12), stone, i * 2.6, 4.5, 7.6);
    pb.add(rbox(19, 1.6, 2.4, 0.2), stone, 0, 9.8, 7.4);
    pb.add(new THREE.CylinderGeometry(0.01, 6.4, 3, 3, 1), stone, 0, 12, 7.5, [Math.PI / 2, 0, Math.PI], [1.45, 1, 0.35]);
    for (let i = -2; i <= 2; i++) pb.add(rbox(1.4, 3.6, 0.3, 0.1), dark, i * 3.6, 15.5, 7.05);
    // tours octogonales crénelées
    for (const [ox, oz] of [[-8.6, -5.6], [8.6, -5.6], [-8.6, 5.6], [8.6, 5.6]]) {
      pb.add(cyl(2.0, 2.2, 30, 8), stone, ox, 15, oz);
      pb.add(cyl(2.35, 2.35, 1.2, 8), stone, ox, 30.6, oz);
      for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; pb.add(rbox(0.6, 0.9, 0.6, 0.05), stone, ox + Math.cos(a) * 2.1, 31.6, oz + Math.sin(a) * 2.1); }
      for (let k = 0; k < 3; k++) pb.add(rbox(0.5, 2.6, 0.2, 0.05), dark, ox, 18 + k * 4, oz + Math.sign(oz) * 2.02);
    }
    // chapelle et Vierge dorée
    pb.add(cyl(2.2, 2.4, 12, 8), stone, 14.5, 6, -4);
    pb.add(cyl(1.6, 2.0, 6, 8), stone, 14.5, 15, -4);
    pb.add(new THREE.CylinderGeometry(0.25, 1.3, 3, 8), gold, 14.5, 19.5, -4);
    pb.add(sphere(0.45, 12, 8), gold, 14.5, 21.3, -4);
    place(pb, d.cx, gy, d.cz, [[d.cx, d.cz, 20, 16, 32], [d.cx + 14.5, d.cz - 4, 5, 5, 22]], 'basilique');
    const tx = d.cx + 16, tz = d.cz + 7, tgy = groundH(tx, tz), tp = new PartBuilder();
    for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const bx = sx * 3.2, bz = sz * 3.2, tx2 = sx * 0.45, tz2 = sz * 0.45, H = 40;
      const len = Math.hypot(bx - tx2, H, bz - tz2);
      const m = new THREE.Matrix4().lookAt(new THREE.Vector3(bx, 0, bz), new THREE.Vector3(tx2, H, tz2), new THREE.Vector3(0, 1, 0));
      const g = rbox(0.28, 0.28, len, 0.04).clone();
      g.applyMatrix4(m); g.translate((bx + tx2) / 2, H / 2, (bz + tz2) / 2);
      tp.add(g, metal);
    }
    for (let y = 4; y < 38; y += 4.5) {
      const w = 3.2 - (y / 40) * 2.75;
      for (const r of [0, Math.PI / 2]) tp.add(rbox(w * 2, 0.12, 0.12, 0.02), metal, 0, y, w * (r ? 1 : -1), [0, 0, 0]);
      tp.add(rbox(0.12, 0.12, w * 2, 0.02), metal, w, y, 0); tp.add(rbox(0.12, 0.12, w * 2, 0.02), metal, -w, y, 0);
      tp.add(rbox(w * 2, 0.12, 0.12, 0.02), metal, 0, y, w);
    }
    tp.add(rbox(2.2, 0.3, 2.2, 0.05), metal, 0, 30, 0);
    tp.add(cyl(0.12, 0.2, 10, 6), metal, 0, 45, 0);
    tp.add(sphere(0.3, 8, 6), MAT.redLight, 0, 50.2, 0);
    place(tp, tx, tgy, tz, [[tx, tz, 5, 5, 40]], 'tour métallique', { fade: false });
  }
  // ── Vieux Lyon : cathédrale Saint-Jean ──
  {
    const d = D['Vieux Lyon'], x = d.cx, z = d.cz + 20, gy = groundH(x, z), pb = new PartBuilder();
    pb.add(rbox(15, 18, 24, 0.3), stone, 0, 9, 0);
    pb.add(new THREE.CylinderGeometry(0.01, 8.2, 5, 4, 1), slate, 0, 20.4, 1.5, [0, Math.PI / 4, 0], [1, 1, 1.9]);
    for (const sx of [-1, 1]) {
      pb.add(rbox(4.8, 26, 4.8, 0.2), stone, sx * 4.9, 13, -10.2);
      for (let k = 0; k < 4; k++) pb.add(rbox(0.5, 2.4, 0.5, 0.05), stone, sx * 4.9 + (k % 2 ? 1.9 : -1.9), 27.2, -10.2 + (k < 2 ? 1.9 : -1.9));
      for (let i = 0; i < 4; i++) { pb.add(rbox(1.1, 9, 1.4, 0.2), stone, sx * 8.0, 5.5, -7 + i * 5.5); pb.add(rbox(0.9, 3, 1.2, 0.2), stone, sx * 8.0, 11, -7 + i * 5.5, [0, 0, sx * 0.35]); }
    }
    for (let i = -1; i <= 1; i++) {
      pb.add(rbox(i === 0 ? 3.4 : 2.4, i === 0 ? 7 : 5.5, 0.5, 0.1), dark, i * 4.6, i === 0 ? 3.5 : 2.75, -12.05);
      pb.add(new THREE.CylinderGeometry(0.01, i === 0 ? 2.1 : 1.5, i === 0 ? 3 : 2.4, 3, 1), stone, i * 4.6, i === 0 ? 8.4 : 6.8, -12.1, [0, 0, 0], [1, 1, 0.2]);
    }
    pb.add(new THREE.CylinderGeometry(3.1, 3.1, 0.4, 24), flat(0x2f4f9e, 'emissive', { emissiveIntensity: 0.35 }), 0, 13.2, -12.3, [Math.PI / 2, 0, 0]);
    pb.add(new THREE.TorusGeometry(3.3, 0.35, 6, 24), stone, 0, 13.2, -12.3);
    place(pb, x, gy, z, [[x, z, 17, 26, 26]], 'cathédrale');
  }
  // ── Bellecour : grande roue + statue équestre ──
  {
    const d = D.Bellecour, gy = groundH(d.cx, d.cz);
    const base = new PartBuilder();
    for (const s of [-1, 1]) for (const zz of [-3, 3]) base.add(cyl(0.35, 0.6, 19.5, 8), white, s * 5.4, 9.5, zz, [0, 0, s * 0.28]);
    base.add(cyl(0.5, 0.5, 7, 10), white, 0, 18, 0, [Math.PI / 2, 0, 0]);
    base.add(rbox(14, 0.8, 8, 0.2), stone, 0, 0.4, 0);
    base.add(rbox(4, 2.6, 3, 0.2), flat(0xe8e2d4, 'paint'), 6.5, 1.3, 4.5);
    place(base, d.cx + 26, gy, d.cz, [[d.cx + 26, d.cz, 14, 8, 20]], 'grande roue', { fade: false });
    const rot = new THREE.Group(); rot.position.set(d.cx + 26, gy + 18, d.cz); scene.add(rot);
    const ring = new PartBuilder();
    for (const zz of [-1.2, 1.2]) ring.add(new THREE.TorusGeometry(14, 0.32, 8, 64), white, 0, 0, zz);
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      for (const zz of [-1.2, 1.2]) ring.add(cyl(0.07, 0.07, 14, 4), white, Math.cos(a) * 7, Math.sin(a) * 7, zz, [0, 0, a - Math.PI / 2]);
    }
    const ringG = ring.build({ name: 'roue' }); rot.add(ringG);
    const gondolas = [];
    const gcols = [0xd23b3b, 0xe8e2d4, 0x2f4f9e, 0xe8a33d];
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2, gp = new PartBuilder();
      gp.add(rbox(2, 1.9, 1.9, 0.5), flat(gcols[i % 4], 'paint'), 0, -1.3, 0);
      gp.add(rbox(2.05, 0.8, 1.95, 0.1), glass, 0, -1.0, 0);
      gp.add(cyl(0.04, 0.04, 0.6, 4), iron, 0, -0.2, 0);
      const gg = gp.build({ name: 'nacelle' });
      gg.position.set(Math.cos(a) * 14, Math.sin(a) * 14, 0);
      rot.add(gg); gondolas.push(gg);
    }
    animated.push({ g: rot, axis: 'z', v: 0.06, keepUpright: gondolas });
    const st = new PartBuilder();
    st.add(rbox(7, 4.2, 4.2, 0.3), stone, 0, 2.1, 0);
    st.add(rbox(7.8, 0.5, 5, 0.15), stone, 0, 4.45, 0);
    // cheval et cavalier (bronze)
    st.add(rbox(3.4, 1.4, 1.2, 0.55), bronze, 0, 6.6, 0);
    st.add(rbox(0.8, 1.6, 0.7, 0.3), bronze, 1.8, 7.6, 0, [0, 0, -0.5]);
    st.add(rbox(1.1, 0.55, 0.55, 0.22), bronze, 2.45, 8.35, 0, [0, 0, 0.3]);
    for (const [lx, lz, a] of [[-1.2, -0.4, 0.2], [-1.2, 0.4, -0.1], [1.2, -0.4, -0.3], [1.3, 0.4, 0.5]]) st.add(cyl(0.16, 0.12, 1.9, 6), bronze, lx, 5.4, lz, [0, 0, a]);
    st.add(rbox(0.25, 1.3, 0.35, 0.1), bronze, -1.8, 6.6, 0, [0, 0, 0.6]);
    st.add(rbox(0.8, 1.2, 0.7, 0.3), bronze, -0.2, 7.9, 0);
    st.add(sphere(0.3, 10, 8), bronze, -0.1, 8.8, 0);
    st.add(cyl(0.05, 0.05, 1.2, 4), bronze, 0.5, 8.3, 0, [0, 0, -1]);
    place(st, d.cx, gy, d.cz, [[d.cx, d.cz, 7.2, 4.4, 9]], 'statue');
  }
  // ── Presqu'île : Hôtel de Ville + Opéra ──
  {
    const d = D["Presqu'île"], x = d.cx - 14, z = d.cz - 8, gy = groundH(x, z), pb = new PartBuilder();
    pb.add(rbox(20, 11, 10, 0.2), cream, 0, 5.5, 0);
    pb.add(rbox(21, 1.0, 11, 0.2), stone, 0, 11.3, 0);
    pb.add(new THREE.CylinderGeometry(0.01, 7.6, 3, 4, 1), slate, 0, 13.3, 0, [0, Math.PI / 4, 0], [1.9, 1, 1]);
    for (let i = -4; i <= 4; i++) for (let fl = 0; fl < 2; fl++) {
      pb.add(rbox(1.1, 2.4, 0.2, 0.05), dark, i * 2.1, 3 + fl * 4, 5.02);
      pb.add(rbox(1.4, 0.2, 0.3, 0.05), stone, i * 2.1, 1.7 + fl * 4, 5.1);
    }
    for (let i = -4; i <= 4; i += 2) pb.add(rbox(0.5, 10.5, 0.4, 0.1), stone, i * 2.1 + 1.05, 5.4, 5.1);
    pb.add(rbox(4, 10, 4, 0.1), cream, 0, 16, 0);
    pb.add(cyl(1.7, 2.1, 6, 8), stone, 0, 24, 0);
    pb.add(new THREE.CylinderGeometry(0.01, 2.2, 3.6, 8), slate, 0, 28.8, 0);
    pb.add(new THREE.CylinderGeometry(1.6, 1.6, 0.2, 24), flat(0xf3eee0, 'emissive', { emissiveIntensity: 0.8 }), 0, 19, 2.05, [Math.PI / 2, 0, 0]);
    place(pb, x, gy, z, [[x, z, 21, 11, 14], [x, z, 5, 5, 30]], 'hôtel de ville');
    const ox = d.cx + 14, oz = d.cz - 8, ogy = groundH(ox, oz), op = new PartBuilder();
    op.add(rbox(18, 9, 11, 0.2), cream, 0, 4.5, 0);
    for (let i = -3; i <= 3; i++) op.add(rbox(1.3, 5.5, 0.3, 0.05), dark, i * 2.4, 4, 5.55);
    for (let i = -3; i <= 3; i++) op.add(cyl(0.4, 0.45, 7, 10), stone, i * 2.4 + 1.2, 3.5, 5.6);
    op.add(new THREE.CylinderGeometry(5.5, 5.5, 18, 24, 1, false, 0, Math.PI), curtainWall(0x1c2229, new THREE.Vector2(1.2, 1.2)), 0, 9, 0, [0, 0, Math.PI / 2]);
    for (let i = 0; i < 8; i++) op.add(rbox(0.7, 1.4, 0.5, 0.2), gold, -7 + i * 2, 9.9, 5.5);
    place(op, ox, ogy, oz, [[ox, oz, 18, 11, 15]], 'opéra', { rotY: 0 });
  }
  // ── Croix-Rousse : Gros Caillou ──
  {
    const d = D['Croix-Rousse'], x = d.cx, z = d.z + d.d - 8, gy = groundH(x, z), pb = new PartBuilder();
    pb.add(new THREE.DodecahedronGeometry(2.6, 1), triMat('concrete', { color: 0xe8e2d6, tile: 2 }), 0, 2.2, 0, [0.3, 0.5, 0.2], [1, 0.92, 1.05]);
    pb.add(rbox(6.5, 0.4, 6.5, 0.1), stone, 0, 0.2, 0);
    place(pb, x, gy, z, [[x, z, 5, 5, 4.5]], 'gros caillou', { fade: false });
  }
  // ── Confluence : musée + Cube orange ──
  {
    const d = D.Confluence, x = d.cx, z = d.z + d.d - 16, gy = groundH(x, z), pb = new PartBuilder();
    const met = flat(0xc7ced6, 'metal', { roughness: 0.28 });
    pb.add(rbox(22, 7, 14, 1.5), met, 0, 6, 0, [0, 0, 0.1]);
    pb.add(rbox(16, 6, 12, 2), curtainWall(0x7f96ab), 4, 11, -2, [0.12, 0.3, -0.08]);
    pb.add(sphere(6, 20, 14), curtainWall(0xa7b8c8, new THREE.Vector2(1.4, 1.4)), -6, 12, 2);
    for (const [ox, oz] of [[-8, -5], [8, -5], [-8, 5], [8, 5]]) pb.add(cyl(0.45, 0.45, 6, 8), met, ox, 3, oz);
    place(pb, x, gy, z, [[x, z, 22, 14, 16]], 'musée des confluences');
    const cx = d.cx - 24, cz = d.cz + 10, cgy = groundH(cx, cz), cp = new PartBuilder();
    const orange = flat(0xff6a14, 'paint', { roughness: 0.35 });
    cp.add(rbox(10, 10, 10, 0.4), orange, 0, 5, 0);
    cp.add(new THREE.TorusGeometry(3.1, 0.9, 10, 28), dark, 0, 5, 5.05);
    cp.add(new THREE.CircleGeometry(2.3, 24), flat(0x0b0d10, 'matte'), 0, 5, 5.02);
    place(cp, cx, cgy, cz, [[cx, cz, 10, 10, 10]], 'cube orange');
  }
  // ── Part-Dieu : Crayon, tours, gare ──
  {
    const d = D['Part-Dieu'], pb = new PartBuilder();
    pb.add(cyl(4, 5.5, 46, 24), curtainWall(0x98a4b8, new THREE.Vector2(1.4, 3.6)), 0, 23, 0);
    pb.add(new THREE.ConeGeometry(4, 11, 24), flat(0x5b6780, 'metal', { roughness: 0.4 }), 0, 51.5, 0);
    pb.add(rbox(9, 58, 9, 1.2), curtainWall(0x4c6a86), 16, 29, 10);
    pb.add(rbox(10, 42, 10, 1.0), triMat('concrete', { color: 0xc9c1b3 }), -16, 21, 12);
    pb.add(rbox(10.4, 1, 10.4, 0.2), metal, -16, 42.5, 12);
    pb.add(rbox(30, 8, 12, 1.0), cream, 0, 4, -22);
    pb.add(new THREE.CylinderGeometry(6, 6, 30, 24, 1, false, 0, Math.PI), curtainWall(0x8aa1b6, new THREE.Vector2(1.5, 1.5)), 0, 8, -22, [0, 0, Math.PI / 2]);
    place(pb, d.cx, 0, d.cz, [[d.cx, d.cz, 11, 11, 57], [d.cx + 16, d.cz + 10, 9, 9, 58], [d.cx - 16, d.cz + 12, 10, 10, 43], [d.cx, d.cz - 22, 30, 12, 14]], 'part-dieu');
  }
  // ── Tête d'Or : lac + grille dorée ──
  {
    const d = D["Tête d'Or"], x = d.cx, z = d.cz + 4, gy = groundH(x, z);
    const lake = new THREE.Mesh(new THREE.CircleGeometry(18, 48), waterMaterial(new THREE.Vector2(0.01, 0.006), 0x2a3f33, 0.25));
    lake.rotation.x = -Math.PI / 2; lake.scale.set(1, 0.62, 1); lake.position.set(x, gy + 0.06, z); lake.receiveShadow = true;
    scene.add(lake);
    block(x, z, 36, 22, -1, 'lac');
    const isl = new PartBuilder();
    isl.add(sphere(3, 16, 10), triMat('grass', { tile: 3 }), 0, -1.6, 0, null, [1.4, 1, 1]);
    place(isl, x + 6, gy, z - 2, [], 'île', { fade: false });
    const gx = d.x + 4, gz = d.z + d.d - 4, ggy = groundH(gx, gz), gp = new PartBuilder();
    for (const s of [-5.5, 5.5]) { gp.add(rbox(1.3, 7, 1.3, 0.2), stone, s, 3.5, 0); gp.add(sphere(0.6, 12, 8), gold, s, 7.5, 0); }
    gp.add(new THREE.TorusGeometry(5, 0.22, 8, 36, Math.PI), gold, 0, 6.5, 0);
    for (let i = -4.5; i <= 4.5; i += 0.5) { gp.add(cyl(0.05, 0.05, 6.2, 5), iron, i, 3.1, 0); gp.add(new THREE.ConeGeometry(0.1, 0.35, 5), gold, i, 6.3, 0); }
    gp.add(rbox(10, 0.15, 0.1, 0.02), gold, 0, 1.2, 0); gp.add(rbox(10, 0.15, 0.1, 0.02), gold, 0, 5.6, 0);
    place(gp, gx, ggy, gz, [[gx - 5.5, gz, 1.3, 1.3, 8], [gx + 5.5, gz, 1.3, 1.3, 8]], 'grille');
  }
  // ── Gerland : stade ──
  {
    const d = D.Gerland, x = d.cx, z = d.cz + 8, gy = groundH(x, z), pb = new PartBuilder();
    const conc = triMat('concrete', { color: 0xb7b3ab });
    pb.add(new THREE.TorusGeometry(24, 7, 12, 64), conc, 0, 4, 0, [Math.PI / 2, 0, 0], [1, 0.72, 1]);
    for (let i = 0; i < 36; i++) { const a = (i / 36) * Math.PI * 2; pb.add(rbox(1.2, 12, 1.2, 0.2), conc, Math.cos(a) * 30.5, 6, Math.sin(a) * 22); }
    pb.add(new THREE.CircleGeometry(17, 40), triMat('grass', { color: 0x9fd47a, tile: 5 }), 0, 0.12, 0, [-Math.PI / 2, 0, 0], [1, 0.72, 1]);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      pb.add(cyl(0.35, 0.6, 24, 8), metal, Math.cos(a) * 28, 12, Math.sin(a) * 19);
      pb.add(rbox(4, 1.5, 1.2, 0.2), flat(0xfff3d6, 'emissive', { emissiveIntensity: 1.5 }), Math.cos(a) * 28, 24, Math.sin(a) * 19, [0, -a, 0]);
    }
    place(pb, x, gy, z, [[x, z, 58, 40, 12]], 'stade');
  }
  // ── Guillotière : marché ──
  {
    const d = D['Guillotière'], x = d.cx - 30, z = d.cz, gy = groundH(x, z), R = seeded(8);
    const awnings = [0xc8281e, 0xe8e2d4, 0x2f7a4a, 0xe8a33d];
    const fruits = [0xd23b2b, 0xf0a020, 0x7fbf3a, 0x6a2a8a, 0xf2d34a];
    for (let i = 0; i < 7; i++) {
      const pb = new PartBuilder();
      pb.add(rbox(3.4, 0.9, 1.8, 0.1), MAT.wood, 0, 0.55, 0);
      for (const sx of [-1.6, 1.6]) for (const sz of [-0.8, 0.8]) pb.add(cyl(0.04, 0.04, 2.4, 5), iron, sx, 1.2, sz);
      for (let k = 0; k < 8; k++) pb.add(rbox(0.42, 0.06, 2.1, 0.02), flat(k % 2 ? awnings[i % 4] : 0xf2ede2, 'matte', { side: THREE.DoubleSide }), -1.5 + k * 0.43, 2.45, 0.15, [0.18, 0, 0]);
      for (let k = 0; k < 10; k++) pb.add(sphere(0.12, 8, 6), flat(fruits[Math.floor(R() * fruits.length)], 'plastic', { roughness: 0.5 }), -1.4 + (k % 5) * 0.7, 1.08, -0.3 + Math.floor(k / 5) * 0.6);
      for (let k = 0; k < 2; k++) pb.add(rbox(0.6, 0.35, 0.45, 0.03), MAT.wood, -1.2 + k * 2.4, 0.2, 1.3);
      place(pb, x + i * 4.4, gy, z, [[x + i * 4.4, z, 3.4, 2, 2.5]], 'étal', { fade: false });
    }
  }
  // ── Guillotière : kebabs ──
  {
    const d = D['Guillotière'];
    const shops = [['KEBAB', 'Chez Momo · broche maison', -44, -22], ['GRILL 69', 'Assiette ou galette', -20, -22], ['SNACK', 'Frites fraîches, sauce blanche', 6, -22], ['KEBAB', 'Le Gone Gourmand', 32, -22]];
    for (const [txt, sub, dx, dz] of shops) {
      const x = d.cx + dx, z = d.cz + dz, gy = groundH(x, z), pb = new PartBuilder();
      pb.add(rbox(11, 7, 9, 0.2), triMat('plaster', { color: 0xd9c4a0, tile: 3 }), 0, 3.5, 0);
      pb.add(rbox(11.6, 0.6, 9.6, 0.1), stone, 0, 7.1, 0);
      const tex = signTexture(txt, sub);
      pb.add(rbox(10.6, 1.3, 0.25, 0.04), MAT.metalDark, 0, 5.4, 4.55);
      pb.add(new THREE.PlaneGeometry(10.4, 1.1), new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 0.6, roughness: 0.5 }), 0, 5.4, 4.69);
      for (let i = 0; i < 13; i++) pb.add(rbox(0.8, 0.06, 2.4, 0.02), flat(i % 2 ? 0xc8281e : 0xf3e9d8, 'matte'), -4.8 + i * 0.8, 4.3, 5.6, [0.22, 0, 0]);
      pb.add(rbox(8.6, 2.6, 0.12, 0.03), MAT.glassBlue, 0, 2.2, 4.55);
      pb.add(rbox(8.8, 0.5, 0.6, 0.08), stone, 0, 0.6, 4.6);
      pb.add(rbox(1.7, 2.4, 0.3, 0.05), MAT.steel, -1.65, 2.2, 3.1);
      pb.add(new THREE.BoxGeometry(1.5, 2.1, 0.12), flat(0xff7a2e, 'emissive', { emissiveIntensity: 1.6 }), -1.8, 2.2, 3.0);
      for (let i = 0; i < 2; i++) {
        const tx = 3.2 + i * 2.6;
        pb.add(cyl(0.9, 0.9, 0.06, 16), MAT.steel, tx, 1.05, 6.6);
        pb.add(cyl(0.05, 0.08, 1.05, 6), iron, tx, 0.52, 6.6);
        for (const j of [-1, 1]) pb.add(rbox(0.45, 0.06, 0.45, 0.02), flat(0xc8281e, 'plastic'), tx + j * 1.3, 0.48, 6.6);
      }
      place(pb, x, gy, z, [[x, z, 11, 9, 7.5]], 'kebab');
      const spit = new THREE.Group(); spit.position.set(x - 2.6, gy, z + 3.1); scene.add(spit);
      const sp = new PartBuilder();
      sp.add(cyl(0.05, 0.05, 3, 6), MAT.steel, 0, 2.4, 0);
      sp.add(cyl(0.6, 0.42, 2.0, 14), triMat('wood', { color: 0xb06a34, tile: 0.5 }), 0, 2.2, 0);
      spit.add(sp.build({ name: 'broche' }));
      animated.push({ g: spit, axis: 'y', v: 0.9 });
    }
  }
  // ── Vaise : gare ──
  {
    const d = D.Vaise, x = d.cx, z = d.cz - 10, gy = groundH(x, z), pb = new PartBuilder();
    pb.add(rbox(26, 7, 12, 0.4), cream, 0, 3.5, 0);
    pb.add(new THREE.CylinderGeometry(6, 6, 26, 24, 1, false, 0, Math.PI), curtainWall(0x4e5a66, new THREE.Vector2(1.6, 1.6)), 0, 7, 0, [0, 0, Math.PI / 2]);
    for (let i = -5; i <= 5; i++) pb.add(rbox(1.2, 3.8, 0.2, 0.05), dark, i * 2.2, 3.2, 6.05);
    pb.add(new THREE.CylinderGeometry(1.1, 1.1, 0.2, 24), flat(0xf3eee0, 'emissive', { emissiveIntensity: 0.8 }), 0, 8.8, 6.1, [Math.PI / 2, 0, 0]);
    place(pb, x, gy, z, [[x, z, 26, 12, 13]], 'gare de vaise');
  }
  // ── dépôt de bus ──
  {
    const pb = new PartBuilder(), bx = PARK.x + 2, bz = PARK.z + 2, gy = groundH(bx, bz);
    pb.add(rbox(3, 3, 3, 0.2), cream, 0, 1.5, 0);
    pb.add(rbox(3.4, 0.3, 3.4, 0.1), MAT.metalDark, 0, 3.1, 0);
    pb.add(rbox(2.2, 1.2, 0.1, 0.03), glass, 0, 2, 1.55);
    place(pb, bx, gy, bz, [[bx, bz, 3, 3, 3.3]], 'dépôt');
    for (let i = 0; i < 4; i++) {
      const px = PARK.x + 4 + i * 9, pz = PARK.z + 18, pp = new PartBuilder();
      pp.add(cyl(0.12, 0.16, 8, 6), MAT.iron, 0, 4, 0);
      pp.add(rbox(1.6, 0.25, 0.5, 0.05), MAT.metalDark, 0.7, 8, 0);
      pp.add(rbox(1.3, 0.1, 0.4, 0.03), MAT.lampGlow, 0.9, 7.86, 0);
      place(pp, px, groundH(px, pz), pz, [[px, pz, 0.4, 0.4, 8]], 'mât', { fade: false });
    }
  }
}

export function updateLandmarks(dt) {
  for (const a of animated) {
    a.g.rotation[a.axis] += a.v * dt;
    if (a.keepUpright) for (const gd of a.keepUpright) gd.rotation.z = -a.g.rotation.z;
  }
  for (const o of OCCLUDERS) {
    if (Math.abs(o.value - o.target) < 0.005) continue;
    o.value += (o.target - o.value) * Math.min(1, dt * 10);
    for (const a of o.attrs) { a.array.fill(o.value); a.needsUpdate = true; }
  }
}
export function setOccluderHidden(occ, hidden) { occ.target = hidden ? 0.85 : 0; }
