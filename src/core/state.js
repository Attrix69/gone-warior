// État de jeu partagé. Les objets sont mutés en place (jamais réassignés)
// pour que tous les modules voient la même référence.
import { SPAWN } from '../world/layout.js';

export const PLAYER_DEFAULTS = {
  x: SPAWN.x, z: SPAWN.z, vx: 0, vz: 0, hp: 100, hpMax: 100, lvl: 1, xp: 0, xpNext: 60, coins: 0,
  str: 1, spd: 1, def: 1, gn: 1, gniac: 0, stamina: 100, items: ['fists'], qty: {}, itemIdx: 0,
  kills: 0, bosses: 0, throws: 0, baille: 0, dead: false, action: null, combo: 0,
  gun: null, guns: [], ammo: {}, carry: null,
};

/** Le joueur. `rig` est l'objet 3D animé. */
export const P = {
  ...structuredClone(PLAYER_DEFAULTS),
  y: 0, r: 1.1, yaw: 0, actionT: 0, actionDur: 0, hitDone: false, lastPunch: 'R', lastKick: false,
  hist: [], h: 0, vy: 0, yawRate: 0, vehicle: null, comboT: 0, rank: null, invuln: 0, dodgeCd: 0,
  block: false, blockT: 0, fireT: 0, reloadT: 0, aim: false, gunKick: 0, jumps: 0, rig: null,
};

/** Déroulement de la partie. */
export const G = {
  mission: 0, running: false, paused: false, t: 0, hitstop: 0, slow: 0, eventT: 45, spawnT: 2,
  zone: null, cine: null, fin: null, over: null,
};

/** Caméra orbitale du joueur (angles en radians, distance en mètres). */
export const cam = { yaw: 0, pitch: 0.46, dist: 11, shake: 0, x: 0, y: 0, z: 0, sens: 1, bob: 0, fovKick: 0, roll: 0, arm: 11 };

export const unlocked = { combo3: false, patate: false, dash2: false, gniacFast: false };

/** Options du joueur (persistées). */
export const opt = {
  sfx: true, mus: true, vib: true, inv: false, sens: 1, blood: true, tod: 'cycle',
  comic: false, // onomatopées façon BD (désactivées par défaut, direction réaliste)
  shake: 1, weather: 'auto',
};

/** Réglages de rendu (qualité choisie ou détectée). */
export const settings = { quality: 'med', autoQ: true, dynScale: 1 };

/** Progression de la mission en cours (réinitialisée à chaque mission). */
export const mstate = { count: 0, wave: 0, points: [], spawned: false, timer: 0, active: false };
export function resetMissionState() {
  Object.assign(mstate, { count: 0, wave: 0, points: [], spawned: false, timer: 0, active: false });
}
