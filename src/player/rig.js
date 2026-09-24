// Personnages procéduraux sous forme de SkinnedMesh : une géométrie unique, pilotée par
// un squelette dont la hiérarchie reproduit les articulations d'origine (bassin, torse,
// cou, bras, avant-bras, cuisses, jambes, écharpe). Les animations procédurales
// (anim/procedural.js) écrivent directement les rotations des os.
//
// Emplacement prévu pour un modèle réaliste : assets/characters/*.glb (voir docs/ASSETS.md).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { scene } from '../core/renderer.js';
import { RIG_SCALE } from '../core/config.js';
import { flat } from '../render/materials.js';
import { rbox } from '../world/geo.js';
import { itemMesh, gunMesh } from '../combat/itemModels.js';

const MATS = {};
function materials() {
  if (MATS.skin) return MATS;
  MATS.skin = flat(0xffffff, 'skin', { vertexColors: true });
  MATS.cloth = flat(0xffffff, 'fabric', { vertexColors: true });
  MATS.dark = flat(0xffffff, 'rubber', { vertexColors: true, roughness: 0.55 });
  return MATS;
}

function jerseyTexture() {
  const c = document.createElement('canvas'); c.width = 512; c.height = 256;
  const g = c.getContext('2d');
  for (const back of [false, true]) {
    const ox = back ? 256 : 0;
    g.save(); g.beginPath(); g.rect(ox, 0, 256, 256); g.clip();
    g.fillStyle = '#f1eee6'; g.fillRect(ox, 0, 256, 256);
    g.translate(ox + 128, 128); g.rotate(-0.35); g.translate(-128, -128);
    g.fillStyle = '#c42c28'; g.fillRect(-60, 150, 380, 26); g.fillStyle = '#2a4a94'; g.fillRect(-60, 182, 380, 18);
    g.restore();
    g.fillStyle = '#2a4a94'; g.fillRect(ox, 0, 256, 14);
    g.textAlign = 'center';
    if (back) {
      g.fillStyle = '#2a4a94'; g.font = '700 34px "Barlow Condensed", Impact, sans-serif'; g.fillText('LUGDUNUM', ox + 128, 64);
      g.fillStyle = '#c42c28'; g.font = '700 118px "Barlow Condensed", Impact, sans-serif'; g.lineWidth = 6; g.strokeStyle = '#2a4a94';
      g.strokeText('69', ox + 128, 180); g.fillText('69', ox + 128, 180);
    } else {
      g.fillStyle = '#d99a2b'; g.beginPath(); g.moveTo(ox + 60, 58); g.lineTo(ox + 112, 58); g.lineTo(ox + 112, 106); g.lineTo(ox + 86, 126); g.lineTo(ox + 60, 106); g.closePath(); g.fill();
      g.fillStyle = '#2a4a94'; g.font = '700 26px "Barlow Condensed", Impact, sans-serif'; g.fillText('LUGDUNUM', ox + 164, 82);
      g.fillStyle = '#c42c28'; g.font = '700 46px "Barlow Condensed", Impact, sans-serif'; g.fillText('69', ox + 172, 126);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
let JERSEY = null;
function jerseyMaterial() {
  if (!JERSEY) {
    JERSEY = new THREE.MeshPhysicalMaterial({ map: jerseyTexture(), roughness: 0.85, sheen: 0.5, sheenRoughness: 0.7, sheenColor: new THREE.Color(0.9, 0.9, 0.9) });
    JERSEY.userData.shared = true;
  }
  return JERSEY;
}

let BLOBTEX = null;
function blobShadow(scale) {
  if (!BLOBTEX) {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d'), rg = g.createRadialGradient(64, 64, 4, 64, 64, 62);
    rg.addColorStop(0, 'rgba(0,0,0,.55)'); rg.addColorStop(0.55, 'rgba(0,0,0,.25)'); rg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = rg; g.fillRect(0, 0, 128, 128);
    BLOBTEX = new THREE.CanvasTexture(c);
  }
  const geo = new THREE.PlaneGeometry(1, 1); geo.rotateX(-Math.PI / 2);
  const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: BLOBTEX, transparent: true, depthWrite: false, opacity: 0.8 }));
  m.scale.set(1.1 * scale, 1, 1.1 * scale); m.position.y = 0.03; m.renderOrder = -1;
  return m;
}

const _col = new THREE.Color();
/** Construit la géométrie d'une pièce rattachée rigidement à un os (poids 1). */
function piece(list, geo, boneIndex, color, matKey, matrix) {
  let g = geo.index ? geo.toNonIndexed() : geo.clone();
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  g.applyMatrix4(matrix);
  const n = g.attributes.position.count;
  const si = new Uint16Array(n * 4), sw = new Float32Array(n * 4), col = new Float32Array(n * 3);
  _col.setHex(color);
  for (let i = 0; i < n; i++) { si[i * 4] = boneIndex; sw[i * 4] = 1; col[i * 3] = _col.r; col[i * 3 + 1] = _col.g; col[i * 3 + 2] = _col.b; }
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
  g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  list.push({ g, matKey });
}

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3();
function tr(x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  return _m.compose(_v.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), _s.set(sx, sy, sz)).clone();
}

/**
 * Crée un personnage.
 * cfg : skin, cloth, cloth2, pant, cap, hair, scale, lite (sans détails), jersey, scarf, shadow
 */
export function makeRig(cfg) {
  const S = RIG_SCALE * (cfg.scale || 1);
  const W = cfg.width || 1; // carrure (costauds, boss)
  const lite = !!cfg.lite;
  const root = new THREE.Group();
  const bones = [];
  const B = (name, parent, x = 0, y = 0, z = 0) => {
    const b = new THREE.Bone(); b.name = name; b.position.set(x, y, z);
    if (parent) parent.add(b);
    bones.push(b);
    return b;
  };
  const pivot = B('pivot', null);
  const hips = B('hips', pivot, 0, 1.7 * S, 0);
  const torso = B('torso', hips);
  const neck = B('neck', torso, 0, 1.32 * S, 0);
  const arm = (side) => {
    const sh = B(`shoulder${side}`, torso, side * 0.68 * S * W, 1.12 * S, 0);
    const up = B(`upperArm${side}`, sh);
    const el = B(`elbow${side}`, up, 0, -0.72 * S, 0);
    const fo = B(`foreArm${side}`, el);
    const fist = new THREE.Object3D(); fist.position.set(0, -0.72 * S, 0); fo.add(fist);
    return { sh, up, el, fo, fist };
  };
  const leg = (side) => {
    const hp = B(`hip${side}`, hips, side * 0.3 * S * W, 0, 0);
    const th = B(`thigh${side}`, hp);
    const kn = B(`knee${side}`, th, 0, -0.85 * S, 0);
    const sh = B(`shin${side}`, kn);
    const foot = new THREE.Object3D(); foot.position.set(0, -0.86 * S, 0.14 * S); sh.add(foot);
    return { hp, th, kn, sh, foot };
  };
  const armL = arm(-1), armR = arm(1), legL = leg(-1), legR = leg(1);
  let scarf = null;
  if (cfg.scarf != null) {
    scarf = [];
    let par = B('scarf0', torso, 0, 1.16 * S, -0.22 * S);
    scarf.push(par);
    for (let i = 1; i < 4; i++) { par = B(`scarf${i}`, par, 0, -0.32 * S, 0); scarf.push(par); }
  }
  const head = new THREE.Object3D(); head.position.set(0, 0.36 * S, 0); neck.add(head);
  const weapon = new THREE.Object3D(); weapon.position.set(0, -0.75 * S, 0); armR.fo.add(weapon);
  root.add(pivot);
  root.updateMatrixWorld(true);

  // ── géométrie (pose de liaison) ──
  const parts = [];
  const bi = (b) => bones.indexOf(b);
  const at = (b) => new THREE.Vector3().setFromMatrixPosition(b.matrixWorld);
  const hp0 = at(hips), nk0 = at(neck);
  const cloth = cfg.cloth, cloth2 = cfg.cloth2 ?? cfg.cloth, pant = cfg.pant ?? 0x2b3550, skin = cfg.skin, shoe = cfg.shoe ?? 0x1c1e22;
  // torse (légèrement effilé vers la taille)
  const torsoGeo = rbox(1.08 * S * W, 1.38 * S, 0.62 * S, 0.24 * S);
  piece(parts, torsoGeo, bi(torso), cfg.jersey ? 0xf1eee6 : cloth, 'cloth', tr(0, hp0.y + 0.62 * S, 0, 0, 0, 0, 1, 1, 1));
  if (cfg.jersey) {
    const front = new THREE.PlaneGeometry(1.0 * S * W, 1.1 * S); const uv = front.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * 0.5);
    piece(parts, front, bi(torso), 0xffffff, 'jersey', tr(0, hp0.y + 0.7 * S, 0.315 * S));
    const back = new THREE.PlaneGeometry(1.0 * S * W, 1.1 * S); const ub = back.attributes.uv;
    for (let i = 0; i < ub.count; i++) ub.setX(i, 0.5 + ub.getX(i) * 0.5);
    piece(parts, back, bi(torso), 0xffffff, 'jersey', tr(0, hp0.y + 0.7 * S, -0.315 * S, 0, Math.PI, 0));
  }
  piece(parts, rbox(1.12 * S * W, 0.2 * S, 0.68 * S, 0.08 * S), bi(torso), cloth2, 'cloth', tr(0, hp0.y + 0.26 * S, 0));
  piece(parts, rbox(1.02 * S * W, 0.5 * S, 0.66 * S, 0.2 * S), bi(hips), pant, 'cloth', tr(0, hp0.y - 0.08 * S, 0));
  if (!lite) for (const side of [-1, 1]) piece(parts, new THREE.SphereGeometry(0.25 * S, 10, 8), bi(torso), cloth, 'cloth', tr(side * 0.6 * S * W, hp0.y + 1.18 * S, 0));
  // cou, tête, visage
  piece(parts, new THREE.CylinderGeometry(0.15 * S, 0.17 * S, 0.34 * S, 10), bi(neck), skin, 'skin', tr(0, nk0.y + 0.06 * S, 0));
  piece(parts, new THREE.SphereGeometry(0.4 * S, 18, 14), bi(neck), skin, 'skin', tr(0, nk0.y + 0.4 * S, 0.01 * S, 0, 0, 0, 0.92, 1.08, 1));
  piece(parts, new THREE.SphereGeometry(0.2 * S, 10, 8), bi(neck), skin, 'skin', tr(0, nk0.y + 0.22 * S, 0.18 * S, 0, 0, 0, 1.3, 0.8, 1)); // mâchoire
  if (!lite) {
    piece(parts, new THREE.ConeGeometry(0.06 * S, 0.16 * S, 6), bi(neck), skin, 'skin', tr(0, nk0.y + 0.36 * S, 0.4 * S, Math.PI / 2 - 0.3, 0, 0));
    for (const side of [-1, 1]) {
      piece(parts, new THREE.SphereGeometry(0.055 * S, 8, 6), bi(neck), 0x121418, 'dark', tr(side * 0.14 * S, nk0.y + 0.45 * S, 0.34 * S));
      piece(parts, rbox(0.14 * S, 0.035 * S, 0.04 * S, 0.012 * S), bi(neck), cfg.hair ?? 0x2a1d14, 'dark', tr(side * 0.14 * S, nk0.y + 0.55 * S, 0.35 * S, 0, 0, -side * 0.12));
      piece(parts, new THREE.SphereGeometry(0.08 * S, 8, 6), bi(neck), skin, 'skin', tr(side * 0.37 * S, nk0.y + 0.4 * S, 0, 0, 0, 0, 0.5, 1, 0.8));
    }
    piece(parts, rbox(0.16 * S, 0.035 * S, 0.04 * S, 0.012 * S), bi(neck), 0x7a3b30, 'skin', tr(0, nk0.y + 0.24 * S, 0.37 * S));
  }
  if (cfg.cap != null) {
    piece(parts, new THREE.SphereGeometry(0.43 * S, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), bi(neck), cfg.cap, 'cloth', tr(0, nk0.y + 0.46 * S, 0, 0, 0, 0, 1, 0.85, 1.02));
    piece(parts, rbox(0.5 * S, 0.05 * S, 0.34 * S, 0.02 * S), bi(neck), cfg.cap, 'cloth', tr(0, nk0.y + 0.5 * S, 0.44 * S, -0.12, 0, 0));
  } else if (cfg.hair != null) {
    piece(parts, new THREE.SphereGeometry(0.43 * S, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), bi(neck), cfg.hair, 'cloth', tr(0, nk0.y + 0.44 * S, -0.03 * S, -0.15, 0, 0, 1, 0.8, 1.05));
  }
  // bras
  for (const a of [armL, armR]) {
    const p = at(a.up), e = at(a.fo);
    piece(parts, new THREE.CapsuleGeometry(0.14 * S, 0.5 * S, 4, 10), bi(a.up), cloth, 'cloth', tr(p.x, p.y - 0.34 * S, p.z));
    piece(parts, new THREE.CapsuleGeometry(0.12 * S, 0.5 * S, 4, 10), bi(a.fo), skin, 'skin', tr(e.x, e.y - 0.33 * S, e.z));
    piece(parts, rbox(0.24 * S, 0.3 * S, 0.2 * S, 0.09 * S), bi(a.fo), skin, 'skin', tr(e.x, e.y - 0.72 * S, e.z + 0.02 * S));
  }
  // jambes
  for (const l of [legL, legR]) {
    const p = at(l.th), k = at(l.sh);
    piece(parts, new THREE.CapsuleGeometry(0.17 * S * W, 0.58 * S, 4, 10), bi(l.th), pant, 'cloth', tr(p.x, p.y - 0.42 * S, p.z));
    piece(parts, new THREE.CapsuleGeometry(0.145 * S, 0.56 * S, 4, 10), bi(l.sh), pant, 'cloth', tr(k.x, k.y - 0.4 * S, k.z));
    piece(parts, rbox(0.3 * S, 0.2 * S, 0.62 * S, 0.09 * S), bi(l.sh), shoe, 'dark', tr(k.x, k.y - 0.86 * S, k.z + 0.12 * S));
  }
  if (scarf) {
    piece(parts, rbox(0.9 * S, 0.24 * S, 0.74 * S, 0.11 * S), bi(torso), cfg.scarf, 'cloth', tr(0, hp0.y + 1.2 * S, 0));
    scarf.forEach((b) => { const p = at(b); piece(parts, rbox(0.3 * S, 0.34 * S, 0.08 * S, 0.04 * S), bi(b), cfg.scarf, 'cloth', tr(p.x, p.y - 0.17 * S, p.z)); });
  }

  const M = materials();
  const order = ['skin', 'cloth', 'dark', 'jersey'];
  const used = order.filter((k) => parts.some((p) => p.matKey === k));
  const geos = used.map((k) => mergeGeometries(parts.filter((p) => p.matKey === k).map((p) => p.g)));
  const geo = mergeGeometries(geos, true);
  for (const p of parts) p.g.dispose();
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.9, 0), 2.2 * (cfg.scale || 1));
  const mats = used.map((k) => (k === 'jersey' ? jerseyMaterial() : M[k]));
  const mesh = new THREE.SkinnedMesh(geo, mats);
  mesh.castShadow = cfg.shadow !== false; mesh.receiveShadow = true;
  mesh.name = cfg.name || 'personnage';
  const skeleton = new THREE.Skeleton(bones);
  mesh.add(pivot);
  mesh.bind(skeleton);
  root.add(mesh);
  const blob = blobShadow(S / RIG_SCALE);
  root.add(blob);
  root.userData = { pivot, hips, torso, neck, head, armL, armR, legL, legR, weapon, blob, scarf, S, t: Math.random() * 6, anim: 0, mesh };
  return root;
}

/** Libère la géométrie propre à un personnage (les matériaux sont partagés). */
export function disposeRig(rig) {
  rig.userData.mesh.geometry.dispose();
  rig.userData.mesh.skeleton.dispose();
  rig.userData.blob.geometry.dispose();
  rig.userData.blob.material.dispose();
}

// ─── rémanences d'esquive ───────────────────────────────────────────────────
const GHOSTS = [];
export function initGhosts(cfg) {
  for (let i = 0; i < 4; i++) {
    const r = makeRig({ ...cfg, lite: true, jersey: false, scarf: null, shadow: false });
    const gm = new THREE.MeshBasicMaterial({ color: 0x9fb8c8, transparent: true, opacity: 0.16, depthWrite: false, blending: THREE.AdditiveBlending });
    r.userData.mesh.material = r.userData.mesh.material.map(() => gm);
    r.userData.blob.visible = false;
    r.visible = false;
    scene.add(r);
    GHOSTS.push({ rig: r, t: 0, mat: gm });
  }
}
function copyPose(src, dst) {
  const a = src.userData, b = dst.userData;
  const pairs = [[a.pivot, b.pivot], [a.hips, b.hips], [a.torso, b.torso], [a.neck, b.neck], [a.armL.up, b.armL.up], [a.armL.fo, b.armL.fo],
    [a.armR.up, b.armR.up], [a.armR.fo, b.armR.fo], [a.legL.th, b.legL.th], [a.legL.sh, b.legL.sh], [a.legR.th, b.legR.th], [a.legR.sh, b.legR.sh]];
  for (const [s, d] of pairs) { d.position.copy(s.position); d.quaternion.copy(s.quaternion); }
  dst.position.copy(src.position); dst.rotation.copy(src.rotation);
}
export function spawnGhost(rig) {
  const g = GHOSTS.find((q) => q.t <= 0);
  if (!g) return;
  copyPose(rig, g.rig); g.t = 0.28; g.rig.visible = true;
}
export function updateGhosts(dt) {
  for (const g of GHOSTS) {
    if (g.t <= 0) continue;
    g.t -= dt;
    if (g.t <= 0) { g.rig.visible = false; continue; }
    const k = g.t / 0.28;
    g.mat.opacity = 0.16 * k;
  }
}

// ─── objets en main ─────────────────────────────────────────────────────────

export function setWeapon(rig, id) {
  const w = rig.userData.weapon;
  while (w.children.length) w.remove(w.children[0]);
  rig.userData.gunNode = null;
  rig.userData.weaponId = id || 'fists';
  if (!id || id === 'fists') return;
  const m = itemMesh(id);
  const rot = { baton: -0.4, bottle: -0.3, poele: -0.5, parapluie: -0.5, baguette: -0.35, extincteur: -1.3 }[id];
  if (rot) m.rotation.x = rot;
  if (id === 'knuckle') m.position.y = 0.02;
  w.add(m);
}
export function setGunMesh(rig, id) {
  const w = rig.userData.weapon;
  while (w.children.length) w.remove(w.children[0]);
  rig.userData.gunNode = null;
  rig.userData.weaponId = id ? `gun:${id}` : null;
  if (!id) return;
  const m = gunMesh(id);
  m.rotation.x = -1.45; m.position.set(0.03, -0.05, 0.09);
  w.add(m);
  rig.userData.gunNode = m;
}

const _lp = new THREE.Vector3();
/** Position monde d'un membre ('fistL' | 'fistR' | 'foot' | 'head'). */
export function limbPos(rig, limb) {
  const u = rig.userData;
  const o = limb === 'fistL' ? u.armL.fist : limb === 'fistR' ? u.armR.fist : limb === 'foot' ? u.legR.foot : u.head;
  return o.getWorldPosition(_lp);
}
