// Collisions du monde : boîtes au sol (AABB 2D + hauteur) rangées dans une grille
// spatiale, repoussée des entités, tests segment/boîte pour la caméra et les tirs.
import { clamp } from '../core/math.js';
import { WORLD } from './layout.js';

/** Obstacles : { x, z, w, d, h (hauteur du sommet, -1 = infranchissable mais sans volume), tag } */
export const OBST = [];
const CELL = 16;
const GW = Math.ceil(WORLD.w / CELL), GH = Math.ceil(WORLD.h / CELL);
const grid = Array.from({ length: GW * GH }, () => []);

function cellsOf(o, fn) {
  const x0 = clamp(Math.floor(o.x / CELL), 0, GW - 1), x1 = clamp(Math.floor((o.x + o.w) / CELL), 0, GW - 1);
  const z0 = clamp(Math.floor(o.z / CELL), 0, GH - 1), z1 = clamp(Math.floor((o.z + o.d) / CELL), 0, GH - 1);
  for (let x = x0; x <= x1; x++) for (let z = z0; z <= z1; z++) fn(grid[z * GW + x]);
}

export function addObstacle(o) {
  o.h ??= 30;
  OBST.push(o);
  cellsOf(o, (c) => c.push(o));
  return o;
}

/** Bloc centré (raccourci utilisé par les monuments). */
export function block(x, z, w, d, h = 30, tag = null) {
  return addObstacle({ x: x - w / 2, z: z - d / 2, w, d, h, tag });
}

export function updateObstacleHeight(o, h) { o.h = h; }

const _near = [];
function nearby(x, z, r) {
  _near.length = 0;
  const x0 = clamp(Math.floor((x - r) / CELL), 0, GW - 1), x1 = clamp(Math.floor((x + r) / CELL), 0, GW - 1);
  const z0 = clamp(Math.floor((z - r) / CELL), 0, GH - 1), z1 = clamp(Math.floor((z + r) / CELL), 0, GH - 1);
  for (let gx = x0; gx <= x1; gx++) for (let gz = z0; gz <= z1; gz++) {
    for (const o of grid[gz * GW + gx]) if (!_near.includes(o)) _near.push(o);
  }
  return _near;
}

/** Repousse une entité {x, z, r} hors des obstacles et la garde dans la carte. */
export function resolveAABB(ent) {
  ent.x = clamp(ent.x, 1, WORLD.w - 1);
  ent.z = clamp(ent.z, 1, WORLD.h - 1);
  for (const o of nearby(ent.x, ent.z, ent.r + 1)) {
    if (ent.x + ent.r > o.x && ent.x - ent.r < o.x + o.w && ent.z + ent.r > o.z && ent.z - ent.r < o.z + o.d) {
      const ox = Math.min(o.x + o.w - (ent.x - ent.r), ent.x + ent.r - o.x);
      const oz = Math.min(o.z + o.d - (ent.z - ent.r), ent.z + ent.r - o.z);
      if (ox < oz) ent.x += ent.x < o.x + o.w / 2 ? -ox : ox;
      else ent.z += ent.z < o.z + o.d / 2 ? -oz : oz;
    }
  }
}

/** Vrai si le point (x, z, y) est à l'intérieur d'un obstacle. */
export function solidAt(x, z, y = null) {
  for (const o of nearby(x, z, 0.5)) {
    if (x > o.x && x < o.x + o.w && z > o.z && z < o.z + o.d && (y == null || y < o.h)) return true;
  }
  return false;
}

/**
 * Intersection segment 3D / boîte (slab). Renvoie la distance paramétrique t∈[0,1]
 * d'entrée, ou -1. `m` élargit la boîte.
 */
export function segmentBox(ax, ay, az, bx, by, bz, o, m = 0, yMin = -5) {
  const lo = [o.x - m, yMin, o.z - m], hi = [o.x + o.w + m, o.h + m, o.z + o.d + m];
  const a = [ax, ay, az], d = [bx - ax, by - ay, bz - az];
  let t0 = 0, t1 = 1;
  for (let i = 0; i < 3; i++) {
    if (Math.abs(d[i]) < 1e-6) { if (a[i] < lo[i] || a[i] > hi[i]) return -1; continue; }
    let u = (lo[i] - a[i]) / d[i], v = (hi[i] - a[i]) / d[i];
    if (u > v) { const q = u; u = v; v = q; }
    t0 = Math.max(t0, u); t1 = Math.min(t1, v);
    if (t0 > t1) return -1;
  }
  return t0;
}

/** Plus proche obstacle coupé par un segment (pour le bras de caméra). */
export function firstHit(ax, ay, az, bx, by, bz, margin = 0.3) {
  const cx = (ax + bx) / 2, cz = (az + bz) / 2, r = Math.hypot(bx - ax, bz - az) / 2 + 2;
  let best = 1, hit = null;
  for (const o of nearby(cx, cz, r)) {
    if (o.h <= 0) continue;
    const t = segmentBox(ax, ay, az, bx, by, bz, o, margin);
    if (t >= 0 && t < best) { best = t; hit = o; }
  }
  return hit ? { t: best, o: hit } : null;
}

/** Tous les obstacles coupés par un segment (occultation caméra → joueur). */
export function allHits(ax, ay, az, bx, by, bz, out, margin = 0) {
  out.length = 0;
  const cx = (ax + bx) / 2, cz = (az + bz) / 2, r = Math.hypot(bx - ax, bz - az) / 2 + 2;
  for (const o of nearby(cx, cz, r)) {
    if (o.h <= 0 || !o.occluder) continue;
    if (segmentBox(ax, ay, az, bx, by, bz, o, margin) >= 0) out.push(o);
  }
  return out;
}
