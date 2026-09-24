// Sauvegarde locale (localStorage). Format v3 conservé : les parties de l'ancienne
// version restent compatibles.
import { P, G, opt, unlocked, settings } from '../core/state.js';
import { DISTRICTS } from '../world/layout.js';
import { ITEMS } from '../combat/items.js';
import { GUNS } from '../combat/guns.js';

const KEY = 'gonewarrior.save.v3';
const OPT_KEY = 'gonewarrior.options.v1';

export function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify({
      x: P.x, z: P.z, hp: P.hp, hpMax: P.hpMax, lvl: P.lvl, xp: P.xp, xpNext: P.xpNext, coins: P.coins, str: P.str, spd: P.spd, def: P.def, gn: P.gn,
      items: P.items, qty: P.qty, guns: P.guns, ammo: P.ammo, kills: P.kills, bosses: P.bosses, throws: P.throws, baille: P.baille,
      mission: G.mission, unlocked, prot: DISTRICTS.map((d) => d.prot), opt, qual: settings.quality,
    }));
  } catch { /* stockage indisponible (navigation privée) */ }
  saveOptions();
}

export function saveOptions() {
  try { localStorage.setItem(OPT_KEY, JSON.stringify({ opt, quality: settings.quality, autoQ: settings.autoQ })); } catch { /* ignoré */ }
}

/** Charge les options seules (disponibles avant toute partie). */
export function loadOptions() {
  try {
    const s = JSON.parse(localStorage.getItem(OPT_KEY) || 'null') || JSON.parse(localStorage.getItem(KEY) || 'null');
    if (!s) return false;
    if (s.opt) Object.assign(opt, s.opt);
    const q = s.quality || s.qual;
    if (q === 'low' || q === 'med' || q === 'high') settings.quality = q;
    if (typeof s.autoQ === 'boolean') settings.autoQ = s.autoQ;
    return true;
  } catch { return false; }
}

export function load() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (!s || !Number.isFinite(s.x) || !Number.isFinite(s.z)) return false;
    Object.assign(P, {
      x: s.x, z: s.z, hp: s.hp, hpMax: s.hpMax, lvl: s.lvl, xp: s.xp, xpNext: s.xpNext, coins: s.coins, str: s.str, spd: s.spd, def: s.def, gn: s.gn,
      items: (s.items || ['fists']).filter((i) => ITEMS[i]), qty: s.qty || {}, guns: (s.guns || []).filter((g) => GUNS[g]), ammo: s.ammo || {},
      itemIdx: 0, kills: s.kills || 0, bosses: s.bosses || 0, throws: s.throws || 0, baille: s.baille || 0,
    });
    if (!P.items.includes('fists')) P.items.unshift('fists');
    G.mission = s.mission || 0;
    Object.assign(unlocked, s.unlocked || {});
    if (s.prot) s.prot.forEach((v, i) => { if (DISTRICTS[i]) DISTRICTS[i].prot = v; });
    return true;
  } catch { return false; }
}

export function hasSave() { try { return !!localStorage.getItem(KEY); } catch { return false; } }
export function wipeSave() { try { localStorage.removeItem(KEY); } catch { /* ignoré */ } }
