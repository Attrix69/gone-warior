// Plan de la ville : quartiers, fleuves, ponts, collines, grands axes.
// Toutes les coordonnées sont en mètres, origine au coin nord-ouest de la carte.
import { smooth } from '../core/math.js';

export const WORLD = { w: 360, h: 260 };

export const PAL = { tuile: 0xb4573c, tuile2: 0x9c4832, zinc: 0x6e7684, ardoise: 0x4d5568 };

// kind : type d'urbanisme (conditionne hauteur des immeubles, sol, mobilier).
export const DISTRICTS = [
  { n: 'Vaise', x: 0, z: 0, w: 106, d: 60, c: 0x6f6f78, danger: 1, kind: 'urban', pal: [0xe3d2ad, 0xd8c49b, 0xcfb992], roof: PAL.zinc, sub: 'Gare et faubourg nord' },
  { n: 'Fourvière', x: 0, z: 60, w: 70, d: 90, c: 0x7d7457, danger: 4, kind: 'hill', pal: [0xeddcb8, 0xe3cfa6, 0xd8c299], roof: PAL.tuile, sub: 'La colline qui prie' },
  { n: 'Vieux Lyon', x: 70, z: 60, w: 36, d: 90, c: 0x8b7a61, danger: 2, kind: 'old', pal: [0xe6a664, 0xdc8e6c, 0xefc87c, 0xd9b189, 0xcd8a72, 0xe8b989], roof: PAL.tuile, sub: 'Traboules et façades ocre' },
  { n: 'Quais de Saône', x: 0, z: 150, w: 106, d: 110, c: 0x73797a, danger: 2, kind: 'quai', pal: [0xe3d2ad, 0xd5c29c], roof: PAL.tuile, sub: 'Péniches et platanes' },
  { n: 'Croix-Rousse', x: 116, z: 0, w: 80, d: 62, c: 0x7f6d6b, danger: 3, kind: 'hill', pal: [0xecc79a, 0xe0a37e, 0xd2b189, 0xe7b795, 0xd89a72], roof: PAL.tuile, sub: 'La colline qui travaille' },
  { n: "Presqu'île", x: 116, z: 62, w: 80, d: 56, c: 0x76747c, danger: 2, kind: 'urban', pal: [0xefe0c2, 0xe5d4b4, 0xdbc9a8], roof: PAL.ardoise, sub: 'Opéra et Hôtel de Ville' },
  { n: 'Bellecour', x: 116, z: 118, w: 80, d: 42, c: 0xa06a48, danger: 1, kind: 'place', pal: [0xefe0c2, 0xe5d4b4], roof: PAL.ardoise, sub: 'La grande place rouge' },
  { n: 'Confluence', x: 116, z: 160, w: 80, d: 100, c: 0x6c7f8e, danger: 3, kind: 'modern', pal: [0xf4f3ef, 0xff7a1f, 0x333842, 0xe6e9ec], roof: 0x3d434e, sub: 'Le musée-nuage et le Cube' },
  { n: 'La Feyssine', x: 208, z: 0, w: 152, d: 38, c: 0x54804f, danger: 2, kind: 'park', pal: [], roof: 0, sub: 'Le parc sauvage' },
  { n: "Tête d'Or", x: 208, z: 38, w: 70, d: 62, c: 0x568a55, danger: 1, kind: 'park', pal: [], roof: 0, sub: 'Le lac et la grille dorée' },
  { n: 'Part-Dieu', x: 278, z: 38, w: 82, d: 62, c: 0x6e7480, danger: 4, kind: 'tower', pal: [0x8fb0cf, 0xa7c2da, 0xbcc3cc, 0x7d96b4], roof: 0x3d434e, sub: 'Le Crayon et les tours' },
  { n: 'Quais du Rhône', x: 208, z: 100, w: 34, d: 160, c: 0x73797a, danger: 2, kind: 'quai', pal: [0xe3d2ad], roof: PAL.tuile, sub: "Guinguettes au bord de l'eau" },
  { n: 'Guillotière', x: 242, z: 100, w: 118, d: 80, c: 0x85706a, danger: 3, kind: 'urban', pal: [0xc9784f, 0xbb6746, 0xdc9d6f, 0xd68c62], roof: PAL.tuile2, sub: 'Le marché et ses stands' },
  { n: 'Gerland', x: 242, z: 180, w: 118, d: 80, c: 0x6d7d72, danger: 3, kind: 'urban', pal: [0xb3bfb2, 0x9dada4, 0xc6ceba], roof: PAL.zinc, sub: 'Le stade et les friches' },
];
DISTRICTS.forEach((d, i) => { d.i = i; d.cx = d.x + d.w / 2; d.cz = d.z + d.d / 2; d.prot = 0; d.assault = false; });
export const DIST_BY_NAME = Object.fromEntries(DISTRICTS.map((d) => [d.n, d]));

export const RIVERS = [{ x: 106, w: 10, name: 'Saône' }, { x: 196, w: 12, name: 'Rhône' }];
export const BRIDGES = [38, 112, 176, 232];
export const BRW = 8;
export const HILLS = [{ x: 35, z: 105, r: 46, h: 26 }, { x: 156, z: 30, r: 38, h: 14 }];
export const PARK = { x: 258, z: 228, w: 34, d: 26, bays: 11, busBays: 5 };
// Grands axes : quais et avenues traversantes, toujours dégagés.
export const ROADS_V = [100, 122, 190, 213];
export const ROADS_H = [38, 112, 176, 232];
export const ROADW = 7;
export const AVENUE_W = 6;
export const AVENUE_SIDE = 2.4;
export const SPAWN = { x: 156, z: 90 };

export function onRoad(x, z, m = 0) {
  for (const rx of ROADS_V) if (Math.abs(x - rx) < ROADW + m) return true;
  for (const rz of ROADS_H) if (Math.abs(z - rz) < ROADW + m) return true;
  return false;
}

function onBridge(z) { for (const b of BRIDGES) if (Math.abs(z - b) < BRW) return true; return false; }

/** Altitude du sol (collines lissées, lit des fleuves hors ponts). */
export function groundH(x, z) {
  let h = 0;
  for (const hl of HILLS) { const d = Math.hypot(x - hl.x, z - hl.z); if (d < hl.r) h += hl.h * smooth(1 - d / hl.r); }
  for (const r of RIVERS) if (x > r.x - 2 && x < r.x + r.w + 2 && !onBridge(z)) h = Math.min(h, -1.4);
  return h;
}

export function inWater(x, z) {
  for (const r of RIVERS) if (x > r.x - 1 && x < r.x + r.w + 1 && !onBridge(z)) return true;
  return false;
}

export function districtAt(x, z) {
  for (const d of DISTRICTS) if (x >= d.x && x < d.x + d.w && z >= d.z && z < d.z + d.d) return d;
  return DISTRICTS[5];
}

export function protPct() {
  return Math.round(DISTRICTS.reduce((s, d) => s + Math.min(100, d.prot), 0) / DISTRICTS.length);
}

// Zones réservées aux monuments : aucun immeuble générique n'y est posé.
export const LMZONES = [];
(function () {
  const L = (n, dx = 0, dz = 0, r) => { const d = DIST_BY_NAME[n]; LMZONES.push({ x: d.cx + dx, z: d.cz + dz, r }); };
  L('Fourvière', 0, 0, 26); L('Vieux Lyon', 0, 20, 20); L('Bellecour', 0, 0, 22); L('Bellecour', 26, 0, 18);
  L("Presqu'île", -16, -8, 18); L("Presqu'île", 16, -8, 18); L('Croix-Rousse', 0, 25, 12); L('Confluence', 0, 34, 26); L('Confluence', -26, 10, 14);
  L('Part-Dieu', 0, 0, 18); L('Part-Dieu', 18, 12, 14); L('Part-Dieu', -18, 14, 14); L('Part-Dieu', 0, -22, 22);
  L("Tête d'Or", 0, 4, 24); L('Gerland', 0, 8, 30); LMZONES.push({ x: PARK.x + PARK.w / 2, z: PARK.z + PARK.d / 2, r: 22 });
  const gu = DIST_BY_NAME['Guillotière']; for (const dx of [-44, -20, 6, 32]) LMZONES.push({ x: gu.cx + dx, z: gu.cz - 22, r: 9 });
  L('Guillotière', -30, 0, 20); L('Vaise', 0, -10, 20);
})();
export function landmarkZone(x, z) {
  for (const l of LMZONES) if (Math.abs(x - l.x) < l.r && Math.abs(z - l.z) < l.r) return true;
  return false;
}

export function inPark(x, z) {
  return x > PARK.x - 2 && x < PARK.x + PARK.w + 2 && z > PARK.z - 2 && z < PARK.z + PARK.d + 2;
}

// ─── réseau de rues et îlots ────────────────────────────────────────────────
// Taille d'îlot (entre axes de rues) et profil de rue selon l'urbanisme du quartier.
export const BLOCK_SIZE = { urban: 34, old: 25, hill: 30, modern: 40, tower: 46, quai: 32 };
export const STREET_SPEC = {
  urban: { road: 7.0, side: 2.6, pave: 'asphalt' },
  old: { road: 5.2, side: 0, pave: 'cobble' },
  hill: { road: 6.4, side: 2.2, pave: 'asphalt' },
  modern: { road: 7.6, side: 3.2, pave: 'asphalt' },
  tower: { road: 9.0, side: 3.6, pave: 'asphalt' },
  quai: { road: 7.0, side: 2.6, pave: 'asphalt' },
  place: { road: 7.0, side: 2.6, pave: 'asphalt' },
};

/** Rues : { axis: 'x' (orientée nord-sud) | 'z', c, from, to, road, side, pave, d } */
export const STREETS = [];
/** Îlots constructibles : { x, z, w, d, district } */
export const BLOCKS = [];

function lines(start, len, size) {
  const n = Math.max(1, Math.round(len / size));
  const step = len / n;
  return Array.from({ length: n + 1 }, (_, i) => start + i * step);
}

(function buildStreetNetwork() {
  for (const d of DISTRICTS) {
    if (d.kind === 'park') continue;
    const spec = STREET_SPEC[d.kind];
    if (d.kind === 'place') {
      // Bellecour : rues le long du pourtour, îlots en bordure de la place.
      const inner = { x: d.x + 12, z: d.z + 9, w: d.w - 24, d: d.d - 18 };
      STREETS.push({ axis: 'z', c: inner.z - spec.road / 2 - spec.side, from: d.x, to: d.x + d.w, ...spec, d });
      STREETS.push({ axis: 'z', c: inner.z + inner.d + spec.road / 2 + spec.side, from: d.x, to: d.x + d.w, ...spec, d });
      BLOCKS.push({ x: d.x, z: d.z, w: d.w, d: inner.z - d.z - spec.road - spec.side * 2, district: d });
      BLOCKS.push({ x: d.x, z: inner.z + inner.d + spec.road + spec.side * 2, w: d.w, d: d.z + d.d - (inner.z + inner.d + spec.road + spec.side * 2), district: d });
      continue;
    }
    const size = BLOCK_SIZE[d.kind];
    const xs = lines(d.x, d.w, size), zs = lines(d.z, d.d, size);
    const half = spec.road / 2 + spec.side;
    for (const x of xs) STREETS.push({ axis: 'x', c: x, from: d.z, to: d.z + d.d, ...spec, d });
    for (const z of zs) STREETS.push({ axis: 'z', c: z, from: d.x, to: d.x + d.w, ...spec, d });
    for (let i = 0; i < xs.length - 1; i++) for (let j = 0; j < zs.length - 1; j++) {
      const bx = xs[i] + half, bz = zs[j] + half;
      const bw = xs[i + 1] - xs[i] - half * 2, bd = zs[j + 1] - zs[j] - half * 2;
      if (bw > 5 && bd > 5) BLOCKS.push({ x: bx, z: bz, w: bw, d: bd, district: d });
    }
  }
})();

/** Rue (ou avenue) sous le point, avec la bande concernée : 'road' | 'side' | null. */
export function streetAt(x, z) {
  for (const s of STREETS) {
    const across = s.axis === 'x' ? x - s.c : z - s.c, along = s.axis === 'x' ? z : x;
    if (along < s.from || along > s.to) continue;
    const a = Math.abs(across);
    if (a < s.road / 2) return { s, band: 'road' };
    if (a < s.road / 2 + s.side) return { s, band: 'side' };
  }
  return null;
}

/**
 * Nature du sol à une position — sert aux bruits de pas et aux particules d'impact.
 * Renvoie 'asphalt' | 'stone' | 'cobble' | 'grass' | 'gravel' | 'water'.
 */
export function surfaceAt(x, z) {
  if (inWater(x, z)) return 'water';
  if (onRoad(x, z, -1)) return 'asphalt';
  const d = districtAt(x, z);
  if (d.kind === 'park') return 'grass';
  if (d.kind === 'place' && x > d.x + 12 && x < d.x + d.w - 12 && z > d.z + 9 && z < d.z + d.d - 9) return 'gravel';
  const st = streetAt(x, z);
  if (st && st.band === 'road') return st.s.pave;
  return d.kind === 'old' ? 'cobble' : 'stone';
}
