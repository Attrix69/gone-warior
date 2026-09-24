// Modèles de véhicules décomposés en pièces (une géométrie par matériau) pour le
// rendu instancié : tous les véhicules d'un même type partagent quelques draw calls.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { rbox, cyl } from './geo.js';

function part(list) {
  const geos = list.map(([g, x, y, z, rx = 0, ry = 0, rz = 0, s = null]) => {
    let c = g.index ? g.toNonIndexed() : g.clone();
    for (const k of Object.keys(c.attributes)) if (!['position', 'normal', 'uv'].includes(k)) c.deleteAttribute(k);
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)),
      s ? new THREE.Vector3(...s) : new THREE.Vector3(1, 1, 1));
    c.applyMatrix4(m);
    return c;
  });
  const g = mergeGeometries(geos);
  g.computeBoundingSphere();
  return g;
}

/** Roue unitaire (pneu + jante), axe X. */
function wheelGeo(r, w) {
  return part([[new THREE.CylinderGeometry(r, r, w, 14), 0, 0, 0, 0, 0, Math.PI / 2]]);
}
function rimGeo(r, w) {
  return part([[new THREE.CylinderGeometry(r * 0.58, r * 0.58, w + 0.02, 10), 0, 0, 0, 0, 0, Math.PI / 2]]);
}

/** Pneus / jantes des 4 roues fusionnés (véhicules immobiles). */
function wheelSet(model, rimOnly) {
  return part(model.wheels.map(([x, y, z]) => [rimOnly ? MODELS.rim : MODELS.wheel, x, y, z, 0, 0, 0, [0.22, model.wheelR, model.wheelR]]));
}

export const MODELS = {};

export function buildVehicleModels() {
  // ── voiture citadine (4,3 m) ──
  MODELS.car = {
    rad: 2.3, len: 4.3, wid: 1.8,
    body: part([
      [rbox(1.8, 0.62, 4.3, 0.2), 0, 0.62, 0],
      [rbox(1.72, 0.3, 1.25, 0.14), 0, 0.98, 1.35, -0.12],     // capot
      [rbox(1.56, 0.1, 1.75, 0.05), 0, 1.47, -0.3],             // pavillon
      [rbox(1.72, 0.3, 0.8, 0.12), 0, 0.98, -1.75, 0.08],       // coffre
    ]),
    glass: part([
      [rbox(1.6, 0.5, 2.0, 0.16), 0, 1.2, -0.3],
    ]),
    trim: part([
      [rbox(1.84, 0.26, 0.3, 0.1), 0, 0.42, 2.08], [rbox(1.84, 0.26, 0.3, 0.1), 0, 0.42, -2.08],
      [rbox(0.08, 0.1, 0.18, 0.03), 0.86, 1.08, 0.72], [rbox(0.08, 0.1, 0.18, 0.03), -0.86, 1.08, 0.72],
      [rbox(1.0, 0.18, 0.04, 0.02), 0, 0.5, 2.24],               // plaque
    ]),
    head: part([[rbox(0.38, 0.13, 0.06, 0.03), 0.58, 0.8, 2.15], [rbox(0.38, 0.13, 0.06, 0.03), -0.58, 0.8, 2.15]]),
    tail: part([[rbox(0.34, 0.14, 0.06, 0.03), 0.6, 0.82, -2.15], [rbox(0.34, 0.14, 0.06, 0.03), -0.6, 0.82, -2.15]]),
    wheels: [[0.8, 0.34, 1.35], [-0.8, 0.34, 1.35], [0.8, 0.34, -1.35], [-0.8, 0.34, -1.35]],
    wheelR: 0.34,
  };
  // ── bus articulé TCL (fictif) ──
  MODELS.bus = {
    rad: 3.4, len: 11.5, wid: 2.55,
    body: part([
      [rbox(2.55, 2.1, 11.5, 0.3), 0, 1.45, 0],
      [rbox(2.45, 0.3, 11.2, 0.12), 0, 3.0, 0],
    ]),
    glass: part([
      [rbox(2.6, 1.05, 10.2, 0.08), 0, 2.2, -0.3],
      [rbox(2.3, 1.6, 0.08, 0.05), 0, 1.85, 5.76],
    ]),
    trim: part([
      [rbox(2.58, 0.45, 11.52, 0.1), 0, 0.62, 0],
      [rbox(2.2, 0.35, 2.4, 0.1), 0, 3.3, -2],
      [rbox(2.2, 0.35, 2.0, 0.1), 0, 3.3, 3],
    ]),
    head: part([[rbox(0.4, 0.18, 0.06, 0.03), 0.9, 0.85, 5.77], [rbox(0.4, 0.18, 0.06, 0.03), -0.9, 0.85, 5.77]]),
    tail: part([[rbox(0.3, 0.4, 0.06, 0.03), 1.0, 1.0, -5.77], [rbox(0.3, 0.4, 0.06, 0.03), -1.0, 1.0, -5.77]]),
    sign: part([[rbox(2.0, 0.34, 0.05, 0.02), 0, 2.85, 5.78]]),
    wheels: [[1.1, 0.5, 4.0], [-1.1, 0.5, 4.0], [1.1, 0.5, -3.3], [-1.1, 0.5, -3.3]],
    wheelR: 0.5,
  };
  // ── Vélo'v ──
  const tube = (len) => cyl(0.022, 0.022, len, 6);
  MODELS.bike = {
    rad: 1.0, len: 1.7, wid: 0.5,
    body: part([
      [tube(0.72), 0, 0.72, 0.1, 0.9], [tube(0.62), 0, 0.62, -0.28, -0.5], [tube(0.55), 0, 0.9, -0.05, 1.57],
      [tube(0.6), 0, 0.55, 0.52, -0.3], [rbox(0.44, 0.04, 0.05, 0.02), 0, 1.02, 0.55],
      [rbox(0.2, 0.28, 0.34, 0.05), 0, 0.82, 0.72],             // panier
    ]),
    trim: part([[rbox(0.14, 0.06, 0.26, 0.03), 0, 0.98, -0.34], [rbox(0.08, 0.3, 0.22, 0.03), 0, 0.4, -0.66]]),
    wheels: [[0, 0.33, 0.58], [0, 0.33, -0.58]],
    wheelR: 0.33, thinWheel: true,
  };
  MODELS.wheel = wheelGeo(1, 1);
  MODELS.rim = rimGeo(1, 1);
  MODELS.car.tires = wheelSet(MODELS.car, false);
  MODELS.car.rims = wheelSet(MODELS.car, true);
  // silhouette simplifiée pour la distance
  MODELS.car.lowBody = part([[new THREE.BoxGeometry(1.8, 0.7, 4.3), 0, 0.6, 0], [new THREE.BoxGeometry(1.56, 0.12, 1.8), 0, 1.47, -0.3]]);
  MODELS.car.lowGlass = part([[new THREE.BoxGeometry(1.6, 0.5, 2.0), 0, 1.2, -0.3]]);
  MODELS.thinWheel = part([[new THREE.TorusGeometry(0.93, 0.07, 6, 20), 0, 0, 0, 0, Math.PI / 2, 0]]);
}
