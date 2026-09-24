// Modèles 3D des objets et armes. Chaque modèle est construit une fois (gabarit)
// puis cloné : les clones partagent géométries et matériaux (aucune fuite mémoire).
import * as THREE from 'three';
import { flat, MAT } from '../render/materials.js';
import { rbox, cyl, sphere } from '../world/geo.js';

const S = 0.5; // échelle réaliste des objets tenus en main
const cache = new Map();

function mk(parent, geo, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  parent.add(m);
  return m;
}

function buildItem(id) {
  const g = new THREE.Group();
  const c = (hex, finish = 'matte', extra) => flat(hex, finish, extra);
  switch (id) {
    case 'knuckle': mk(g, rbox(0.5, 0.22, 0.24, 0.09), c(0x8a8f99, 'metal', { roughness: 0.25 })); break;
    case 'baton': mk(g, rbox(0.16, 1.6, 0.16, 0.08), c(0x33373f, 'plastic', { roughness: 0.5 }), 0, -0.55, 0); mk(g, rbox(0.2, 0.4, 0.2, 0.09), c(0x1a1c22, 'rubber'), 0, 0.05, 0); break;
    case 'belt': {
      const pts = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.1, -0.5, 0.15), new THREE.Vector3(-0.1, -1.0, 0.3), new THREE.Vector3(0.15, -1.45, 0.15), new THREE.Vector3(0.05, -1.8, -0.15)];
      mk(g, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 12, 0.07, 6, false), c(0x5a3a22, 'matte', { roughness: 0.6 }));
      mk(g, rbox(0.26, 0.3, 0.1, 0.05), MAT.gold, 0.05, -1.85, -0.15);
      break;
    }
    case 'bottle': {
      const glassG = c(0x2e7d52, 'glass', { roughness: 0.08, transparent: true, opacity: 0.85 });
      mk(g, cyl(0.16, 0.17, 0.62, 12), glassG, 0, -0.15, 0); mk(g, cyl(0.06, 0.14, 0.3, 10), glassG, 0, 0.3, 0); mk(g, cyl(0.175, 0.175, 0.22, 12), c(0xf0e2c0), 0, -0.15, 0);
      break;
    }
    case 'lighter': mk(g, rbox(0.2, 0.34, 0.12, 0.04), c(0xe0562a, 'plastic', { roughness: 0.3 })); mk(g, rbox(0.16, 0.08, 0.1, 0.02), MAT.steel, 0, 0.2, 0); break;
    case 'andouillette': mk(g, rbox(0.3, 0.3, 0.95, 0.15), c(0x9a5a33, 'skin', { roughness: 0.6 })); mk(g, rbox(0.32, 0.32, 0.08, 0.03), c(0x6b3a1c), 0, 0, 0.3); mk(g, rbox(0.32, 0.32, 0.08, 0.03), c(0x6b3a1c), 0, 0, -0.3); break;
    case 'tarte': {
      mk(g, cyl(0.5, 0.42, 0.14, 16), c(0xd9a15a)); mk(g, cyl(0.44, 0.44, 0.08, 16), c(0xff5ea3, 'plastic', { roughness: 0.4 }), 0, 0.09, 0);
      for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; mk(g, sphere(0.07, 6, 5), c(0xff2f85, 'plastic'), Math.cos(a) * 0.28, 0.16, Math.sin(a) * 0.28); }
      break;
    }
    case 'baguette': {
      const b = mk(g, cyl(0.11, 0.09, 1.7, 10), c(0xd7a15e, 'matte', { roughness: 0.95 }), 0, -0.6, 0); b.rotation.x = -0.25;
      for (let i = 0; i < 4; i++) { const k = mk(b, rbox(0.16, 0.03, 0.05, 0.01), c(0xb07c3e), 0, -0.5 + i * 0.34, 0.1); k.rotation.z = 0.5; }
      break;
    }
    case 'poele': {
      mk(g, cyl(0.46, 0.42, 0.12, 18), c(0x2b2e34, 'metal', { roughness: 0.35 }), 0, -0.15, 0);
      mk(g, new THREE.TorusGeometry(0.45, 0.05, 6, 18), c(0x1e2126, 'metal', { roughness: 0.3 }), 0, -0.09, 0).rotation.x = Math.PI / 2;
      mk(g, rbox(0.11, 0.9, 0.09, 0.04), c(0x3a3027), 0, 0.38, 0).rotation.z = 0.12;
      break;
    }
    case 'parapluie':
      mk(g, cyl(0.035, 0.035, 1.5, 6), c(0x2f3540, 'metal'), 0, -0.5, 0);
      mk(g, new THREE.ConeGeometry(0.34, 0.75, 12), c(0x2f4f9e, 'fabric'), 0, 0.05, 0);
      mk(g, new THREE.TorusGeometry(0.12, 0.035, 6, 10, Math.PI), c(0x7a4a2a), 0, -1.22, 0).rotation.y = Math.PI / 2;
      break;
    case 'extincteur': {
      mk(g, cyl(0.22, 0.22, 0.78, 14), c(0xd2231f, 'paint', { roughness: 0.4 }), 0, -0.2, 0);
      mk(g, cyl(0.09, 0.09, 0.16, 8), c(0x2b2e34, 'metal'), 0, 0.25, 0);
      mk(g, cyl(0.05, 0.09, 0.4, 8), c(0x1e2126, 'rubber'), 0, 0.3, 0.28).rotation.x = 1.1;
      mk(g, rbox(0.3, 0.06, 0.06, 0.02), c(0x2b2e34, 'metal'), 0.08, 0.34, 0);
      break;
    }
    case 'petanque': {
      mk(g, sphere(0.28, 16, 12), c(0x9aa3ad, 'metal', { roughness: 0.25 }));
      for (let i = 0; i < 5; i++) { const r = mk(g, new THREE.TorusGeometry(0.28, 0.012, 4, 20), c(0x76808c, 'metal', { roughness: 0.2 })); r.rotation.x = Math.PI / 2; r.position.y = -0.16 + i * 0.08; r.scale.setScalar(Math.cos((i - 2) * 0.42)); }
      break;
    }
    case 'quenelle': mk(g, sphere(0.26, 12, 10), c(0xe8d9b0, 'skin', { roughness: 0.85 })).scale.set(1, 1, 1.9); mk(g, sphere(0.2, 10, 8), c(0xe86a5a, 'plastic', { roughness: 0.6 }), 0, 0.14, 0).scale.set(1, 0.5, 1.5); break;
    case 'corne': mk(g, cyl(0.06, 0.22, 0.6, 12), c(0xd23b3b, 'paint', { roughness: 0.35 }), 0, -0.1, 0).rotation.x = -1.2; mk(g, cyl(0.13, 0.13, 0.3, 12), c(0xe8e4d8, 'plastic'), 0, -0.32, -0.2); break;
    default: break;
  }
  g.scale.setScalar(S);
  return g;
}

function buildGun(id) {
  const g = new THREE.Group();
  const steel = flat(0x2e3138, 'metal', { roughness: 0.32 }), dark = flat(0x17191d, 'metal', { roughness: 0.5, metalness: 0.5 });
  const wood = MAT.wood, green = flat(0x4a5a3a, 'paint', { roughness: 0.7 }), red = flat(0xb8402f, 'paint', { roughness: 0.6 });
  const B = (w, h, d, m, x, y, z) => mk(g, rbox(w, h, d, 0.02), m, x, y, z);
  if (id === 'pistol' || id === 'pistolA') { B(0.09, 0.16, 0.5, steel, 0, 0, 0.12); B(0.08, 0.26, 0.12, dark, 0, -0.17, -0.06); B(0.06, 0.05, 0.2, steel, 0, 0.06, 0.2); if (id === 'pistolA') B(0.07, 0.18, 0.1, dark, 0, -0.3, -0.04); }
  else if (id === 'rifle') { B(0.08, 0.13, 0.95, steel, 0, 0, 0.2); B(0.07, 0.22, 0.16, dark, 0, -0.16, -0.12); B(0.1, 0.12, 0.3, wood, 0, -0.02, -0.4); B(0.06, 0.2, 0.1, dark, 0, -0.14, 0.08); B(0.05, 0.05, 0.35, steel, 0, 0.02, 0.72); B(0.07, 0.07, 0.2, dark, 0, 0.12, 0.1); }
  else if (id === 'smg') { B(0.08, 0.15, 0.5, dark, 0, 0, 0.1); B(0.06, 0.24, 0.1, dark, 0, -0.17, -0.02); B(0.06, 0.3, 0.1, steel, 0, -0.2, 0.12); B(0.05, 0.05, 0.18, steel, 0, 0.02, 0.4); B(0.05, 0.09, 0.3, dark, 0, 0.1, -0.14); }
  else if (id === 'shotgun') { B(0.1, 0.12, 1.05, steel, 0, 0, 0.25); B(0.09, 0.09, 0.9, dark, 0, -0.1, 0.2); B(0.12, 0.16, 0.34, wood, 0, -0.06, -0.36); B(0.11, 0.2, 0.14, wood, 0, -0.16, -0.16); }
  else if (id === 'grenade') { mk(g, sphere(0.16, 12, 10), green); B(0.05, 0.13, 0.05, steel, 0, 0.15, 0); }
  else if (id === 'bazooka') {
    mk(g, cyl(0.16, 0.16, 1.7, 14), green, 0, 0, 0.3).rotation.x = Math.PI / 2;
    mk(g, cyl(0.22, 0.16, 0.3, 14), dark, 0, 0, -0.62).rotation.x = Math.PI / 2;
    B(0.07, 0.24, 0.12, dark, 0, -0.2, -0.05); B(0.06, 0.16, 0.3, dark, 0, 0.2, 0.1);
    mk(g, new THREE.ConeGeometry(0.13, 0.3, 12), red, 0, 0, 1.2).rotation.x = Math.PI / 2;
  }
  g.scale.setScalar(S);
  return g;
}

/** Nouvelle instance (clone léger) du modèle d'objet. */
export function itemMesh(id) {
  const key = `item:${id}`;
  if (!cache.has(key)) cache.set(key, buildItem(id));
  return cache.get(key).clone();
}
export function gunMesh(id) {
  const key = `gun:${id}`;
  if (!cache.has(key)) cache.set(key, buildGun(id));
  return cache.get(key).clone();
}
