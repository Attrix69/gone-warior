// Géométries utilitaires et assemblage de pièces statiques fusionnées par matériau.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const RBOX = new Map();

function rrShape(w, h, r) {
  const s = new THREE.Shape(), x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

/** Boîte aux arêtes arrondies (partagée, ne pas modifier). */
export function rbox(w, h, d, r) {
  const k = [w, h, d, r].map((v) => v.toFixed(3)).join('|');
  let g = RBOX.get(k);
  if (g) return g;
  r = Math.min(r, w * 0.49, h * 0.49, d * 0.49);
  if (r < 0.004) g = new THREE.BoxGeometry(w, h, d);
  else {
    g = new THREE.ExtrudeGeometry(rrShape(w - 2 * r, h - 2 * r, Math.max(0.001, r * 0.5)), {
      depth: Math.max(0.001, d - 2 * r), bevelEnabled: true, bevelThickness: r, bevelSize: r, bevelSegments: 2, curveSegments: 2,
    });
    g.center();
  }
  g.userData.shared = true;
  RBOX.set(k, g);
  return g;
}

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3();

/**
 * Collecte des pièces (géométrie + matériau + transformation) puis les fusionne :
 * un seul maillage par matériau.
 */
export class PartBuilder {
  constructor() { this.parts = new Map(); }

  /** rot : [rx, ry, rz] (radians), scale : nombre ou [sx, sy, sz] */
  add(geo, mat, x = 0, y = 0, z = 0, rot = null, scale = null) {
    _e.set(...(rot || [0, 0, 0]));
    _q.setFromEuler(_e);
    _p.set(x, y, z);
    if (scale == null) _s.set(1, 1, 1); else if (typeof scale === 'number') _s.setScalar(scale); else _s.set(...scale);
    _m.compose(_p, _q, _s);
    return this.addMatrix(geo, mat, _m);
  }

  addMatrix(geo, mat, matrix) {
    let g = geo.index ? geo.toNonIndexed() : geo.clone();
    for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    g.applyMatrix4(matrix);
    if (!this.parts.has(mat)) this.parts.set(mat, []);
    this.parts.get(mat).push(g);
    return this;
  }

  /** Crée un Group contenant un maillage fusionné par matériau. */
  build({ castShadow = true, receiveShadow = true, name = '' } = {}) {
    const group = new THREE.Group();
    group.name = name;
    for (const [mat, geos] of this.parts) {
      const merged = mergeGeometries(geos, false);
      for (const g of geos) g.dispose();
      merged.computeBoundingSphere();
      const mesh = new THREE.Mesh(merged, mat);
      mesh.castShadow = castShadow; mesh.receiveShadow = receiveShadow;
      group.add(mesh);
    }
    this.parts.clear();
    return group;
  }
}

/** Cylindre ouvert/fermé pratique (partagé par paramètres). */
const CYL = new Map();
export function cyl(rt, rb, h, seg = 12, open = false, thetaLen = Math.PI * 2) {
  const k = `${rt}|${rb}|${h}|${seg}|${open}|${thetaLen}`;
  let g = CYL.get(k);
  if (!g) { g = new THREE.CylinderGeometry(rt, rb, h, seg, 1, open, 0, thetaLen); g.userData.shared = true; CYL.set(k, g); }
  return g;
}

const SPH = new Map();
export function sphere(r, ws = 16, hs = 12) {
  const k = `${r}|${ws}|${hs}`;
  let g = SPH.get(k);
  if (!g) { g = new THREE.SphereGeometry(r, ws, hs); g.userData.shared = true; SPH.set(k, g); }
  return g;
}
