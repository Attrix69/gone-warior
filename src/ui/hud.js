// HUD : barres, niveau, minimap orientée, horloge, objectif, combo, notifications,
// arme équipée, boutons contextuels et indicateurs de direction des dégâts.
import { P, G, cam, mstate } from '../core/state.js';
import { clamp } from '../core/math.js';
import { WORLD, DISTRICTS, RIVERS, ROADS_V, ROADS_H, STREETS, districtAt, protPct } from '../world/layout.js';
import { enemies } from '../enemy/enemies.js';
import { nearVehicle } from '../world/vehicles.js';
import { grabTarget } from '../combat/melee.js';
import { curItem, curId } from '../combat/items.js';
import { curGun, ammoOf, GUNS, selectGun } from '../combat/guns.js';
import { curMission, missionTarget } from '../systems/missions.js';
import { clockText } from '../render/atmosphere.js';
import { setWeapon } from '../player/rig.js';

const $ = (id) => document.getElementById(id);
const el = {};
export function initHud() {
  for (const id of ['hpFill', 'hpGhost', 'hpTxt', 'gnFill', 'gnTxt', 'lvl', 'xpFill', 'zone', 'clock', 'bGniac', 'bossBar', 'bGrab', 'bRide', 'bThrow', 'bFire', 'bAim', 'bPunch', 'bKick', 'crosshair',
    'weapon', 'ammo', 'weaponName', 'itemTxt', 'gunBar', 'combo', 'rank', 'misTxt', 'mission', 'zoneBanner', 'hudNote', 'toast', 'alert', 'dmgDir']) el[id] = $(id);
  el.miniCv = $('miniCv'); el.mctx = el.miniCv.getContext('2d');
  buildMiniBase();
}

// ─── fond de minimap (dessiné une fois) ─────────────────────────────────────
let miniBase = null;
const MS = 2; // pixels par mètre
function buildMiniBase() {
  miniBase = document.createElement('canvas');
  miniBase.width = WORLD.w * MS; miniBase.height = WORLD.h * MS;
  const g = miniBase.getContext('2d');
  g.fillStyle = '#1a1c20'; g.fillRect(0, 0, miniBase.width, miniBase.height);
  for (const d of DISTRICTS) {
    g.fillStyle = d.kind === 'park' ? '#26382a' : '#23252a';
    g.fillRect(d.x * MS, d.z * MS, d.w * MS, d.d * MS);
  }
  g.fillStyle = '#3a3d44';
  for (const s of STREETS) {
    const w = s.road * MS;
    if (s.axis === 'x') g.fillRect((s.c - s.road / 2) * MS, s.from * MS, w, (s.to - s.from) * MS);
    else g.fillRect(s.from * MS, (s.c - s.road / 2) * MS, (s.to - s.from) * MS, w);
  }
  g.fillStyle = '#4a4e57';
  for (const rx of ROADS_V) g.fillRect((rx - 6) * MS, 0, 12 * MS, miniBase.height);
  for (const rz of ROADS_H) g.fillRect(0, (rz - 6) * MS, miniBase.width, 12 * MS);
  g.fillStyle = '#1f3d52';
  for (const r of RIVERS) g.fillRect(r.x * MS, 0, r.w * MS, miniBase.height);
}

function drawMini() {
  const c = el.mctx, W = el.miniCv.width, R = W / 2, scale = 2.2; // pixels minimap par mètre
  c.save();
  c.clearRect(0, 0, W, W);
  c.beginPath(); c.arc(R, R, R, 0, Math.PI * 2); c.clip();
  c.fillStyle = '#111317'; c.fillRect(0, 0, W, W);
  c.translate(R, R);
  c.rotate(Math.PI + cam.yaw);
  c.scale(scale / MS, scale / MS);
  c.translate(-P.x * MS, -P.z * MS);
  c.drawImage(miniBase, 0, 0);
  for (const d of DISTRICTS) if (d.assault) { c.fillStyle = 'rgba(216,69,58,0.18)'; c.fillRect(d.x * MS, d.z * MS, d.w * MS, d.d * MS); }
  c.fillStyle = '#e05a48';
  for (const e of enemies) {
    if (e.state === 'dead') continue;
    const s = (e.boss ? 5 : 3) * MS;
    c.fillRect(e.x * MS - s / 2, e.z * MS - s / 2, s, s);
  }
  c.restore();
  // objectif (bordé sur le cercle s'il est loin)
  const t = missionTarget();
  if (t) {
    let dx = t.x - P.x, dz = t.z - P.z;
    const a = Math.atan2(dx, dz) - cam.yaw;
    let dist = Math.hypot(dx, dz) * scale;
    dist = Math.min(dist, R - 8);
    const px = R - Math.sin(a) * dist, py = R - Math.cos(a) * dist;
    c.fillStyle = '#e3a33c';
    c.beginPath(); c.arc(px, py, 5, 0, Math.PI * 2); c.fill();
    c.strokeStyle = 'rgba(0,0,0,0.6)'; c.lineWidth = 2; c.stroke();
  }
  // joueur
  c.save(); c.translate(R, R); c.rotate(-(P.yaw - cam.yaw));
  c.fillStyle = '#f4efe6'; c.beginPath(); c.moveTo(0, -8); c.lineTo(5.5, 6); c.lineTo(0, 3); c.lineTo(-5.5, 6); c.closePath(); c.fill();
  c.restore();
  c.strokeStyle = 'rgba(236,230,218,0.25)'; c.lineWidth = 2; c.beginPath(); c.arc(R, R, R - 1, 0, Math.PI * 2); c.stroke();
  // nord
  const na = -cam.yaw + Math.PI;
  c.fillStyle = '#e3a33c'; c.font = '600 16px "Barlow Condensed", sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillText('N', R - Math.sin(na) * (R - 14), R - Math.cos(na) * (R - 14));
}

// ─── mise à jour par image ──────────────────────────────────────────────────
let ghostW = 100, frame = 0;
export function hudUpdate(dt) {
  const hp = clamp((P.hp / P.hpMax) * 100, 0, 100);
  el.hpFill.style.width = `${hp}%`;
  ghostW = hp > ghostW ? hp : Math.max(hp, ghostW - dt * 25);
  el.hpGhost.style.width = `${ghostW}%`;
  el.hpTxt.textContent = `${Math.ceil(P.hp)} / ${P.hpMax}`;
  el.gnFill.style.width = `${P.gniac}%`;
  el.gnTxt.textContent = `${Math.round(P.gniac)} %`;
  el.lvl.textContent = `NIV. ${P.lvl}`;
  el.xpFill.style.width = `${clamp((P.xp / P.xpNext) * 100, 0, 100)}%`;
  el.bGniac.classList.toggle('ready', P.gniac >= 100);
  let boss = null;
  for (const e of enemies) if ((e.boss || e.type === 'chef') && e.state !== 'dead' && Math.hypot(e.x - P.x, e.z - P.z) < 45) { boss = e; break; }
  el.bossBar.style.display = boss ? 'block' : 'none';
  if (boss) { el.bossBar.querySelector('b').textContent = boss.name.toUpperCase(); el.bossBar.querySelector('i').style.width = `${clamp((boss.hp / boss.hpMax) * 100, 0, 100)}%`; }
  const gt = P.carry || grabTarget();
  el.bGrab.style.display = gt ? 'grid' : 'none';
  el.bGrab.querySelector('.t').textContent = P.carry ? 'JETER' : 'SAISIR';
  const rv = P.vehicle || nearVehicle();
  el.bRide.style.display = rv ? 'grid' : 'none';
  if (rv) el.bRide.querySelector('.t').textContent = P.vehicle ? 'DESCENDRE' : 'MONTER';
  el.bThrow.style.display = !P.vehicle && curItem().throw ? 'grid' : 'none';
  frame++;
  if (frame % 2 === 0) drawMini();
  if (frame % 15 === 0) {
    el.clock.textContent = clockText();
    const zn = districtAt(P.x, P.z);
    el.zone.textContent = `${zn.n} · ${Math.round(zn.prot)} %`;
    if (zn !== G.zone) {
      G.zone = zn;
      el.zoneBanner.querySelector('b').textContent = zn.n.toUpperCase();
      el.zoneBanner.querySelector('span').textContent = `${zn.sub} · protégé à ${Math.round(zn.prot)} %`;
      el.zoneBanner.classList.add('show');
      clearTimeout(el.zoneBanner._h);
      el.zoneBanner._h = setTimeout(() => el.zoneBanner.classList.remove('show'), 2800);
    }
  }
  updateDamageArcs(dt);
}

// ─── combo ──────────────────────────────────────────────────────────────────
const RANKS = [[30, 'S', '#f0c86a'], [20, 'A', '#e3a33c'], [12, 'B', '#cfd6e0'], [6, 'C', '#a8b0bb'], [3, 'D', '#7d848f']];
export function hudCombo(pulse = false) {
  if (!el.combo) return;
  if (P.combo < 2) { el.combo.classList.remove('show'); P.rank = null; return; }
  el.combo.querySelector('b').textContent = `×${P.combo}`;
  const r = RANKS.find((k) => P.combo >= k[0]);
  if (r) {
    el.rank.textContent = r[1]; el.rank.style.color = r[2]; el.rank.style.display = 'block';
    if (r[1] !== P.rank) { P.rank = r[1]; el.rank.style.transform = 'scale(1.4)'; setTimeout(() => { el.rank.style.transform = 'scale(1)'; }, 140); }
  } else { el.rank.style.display = 'none'; P.rank = null; }
  el.combo.classList.add('show');
  if (pulse) { el.combo.style.transform = 'scale(1.12)'; setTimeout(() => { el.combo.style.transform = 'scale(1)'; }, 90); }
}

// ─── arme / objet ───────────────────────────────────────────────────────────
export function refreshItemUI() {
  if (!el.itemTxt) return;
  const it = curItem(), id = curId(), g = curGun();
  if (!g && P.rig && P.rig.userData.weaponId !== id) setWeapon(P.rig, id); // objet en main
  el.itemTxt.textContent = it.n + (id !== 'fists' ? ` ×${P.qty[id] || 0}` : '');
  el.weaponName.textContent = g ? g.n : it.n;
  const showGun = !!g && !P.vehicle;
  el.weapon.style.display = g ? '' : 'none'; // l'objet de corps à corps est affiché sur le bouton d'objet
  el.bFire.style.display = showGun ? 'grid' : 'none';
  el.bAim.style.display = showGun && g.kind === 'bullet' ? 'grid' : 'none';
  el.bPunch.style.display = showGun ? 'none' : 'grid';
  el.bKick.style.display = showGun ? 'none' : 'grid';
  el.crosshair.style.display = showGun && G.running ? 'block' : 'none';
  if (g) {
    const a = ammoOf(P.gun);
    el.ammo.style.display = 'block';
    el.ammo.innerHTML = `<b>${a.mag}</b> / ${a.res}`;
    el.ammo.classList.toggle('low', a.mag <= Math.max(1, g.mag * 0.25));
  } else el.ammo.style.display = 'none';
  refreshGunBar();
}
function refreshGunBar() {
  const bar = el.gunBar;
  bar.innerHTML = '';
  if (!P.guns.length) { bar.style.display = 'none'; return; }
  bar.style.display = 'flex';
  for (const id of [null, ...P.guns]) {
    const d = document.createElement('div');
    d.className = `gslot${id === P.gun ? ' sel' : ''}`;
    d.textContent = id ? GUNS[id].n.split(' ')[0].toUpperCase() : 'MAINS';
    if (id) { const i2 = document.createElement('i'); const a = ammoOf(id); i2.textContent = `${a.mag}+${a.res}`; d.appendChild(i2); }
    d.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); selectGun(id); });
    bar.appendChild(d);
  }
}

// ─── mission ────────────────────────────────────────────────────────────────
export function updateMissionUI() {
  if (!el.misTxt) return;
  const m = curMission();
  let ex = '';
  if (m.type === 'clear') ex = ` (${mstate.count || 0}/${m.n})`;
  if (m.type === 'defend') ex = ` (vague ${Math.min((mstate.wave || 0) + 1, m.waves)}/${m.waves})`;
  if (m.type === 'points') ex = ` (${mstate.points.filter((p) => p.done).length}/${m.n})`;
  if (m.type === 'final') ex = ` (${protPct()} %)`;
  el.misTxt.textContent = m.d + ex;
  el.mission.querySelector('b').textContent = m.t;
}

// ─── messages ───────────────────────────────────────────────────────────────
export function hudNote(t, d = 2200, big = false) {
  if (big) { toast(t, d, true); return; }
  const e = el.hudNote;
  if (!e) return;
  e.textContent = t; e.classList.add('show');
  clearTimeout(e._h); e._h = setTimeout(() => e.classList.remove('show'), d);
}
export function toast(t, d = 1700, big = false) {
  const e = el.toast;
  if (!e) return;
  e.textContent = t; e.classList.toggle('big', big); e.classList.add('show');
  clearTimeout(e._h); e._h = setTimeout(() => e.classList.remove('show'), d);
}
export function alertBanner(t) {
  const e = el.alert;
  e.firstElementChild.textContent = t; e.classList.add('show');
  clearTimeout(e._h); e._h = setTimeout(() => e.classList.remove('show'), 2800);
}

// ─── direction des dégâts ───────────────────────────────────────────────────
const arcs = [];
export function damageFrom(x, z) {
  let a = arcs.find((q) => q.t <= 0);
  if (!a) {
    if (arcs.length > 4) return;
    const d = document.createElement('div'); d.className = 'dmg-arc'; el.dmgDir.appendChild(d);
    a = { d, t: 0 }; arcs.push(a);
  }
  a.x = x; a.z = z; a.t = 1;
}
function updateDamageArcs(dt) {
  for (const a of arcs) {
    if (a.t <= 0) continue;
    a.t -= dt * 1.4;
    const ang = Math.atan2(a.x - P.x, a.z - P.z) - cam.yaw;
    a.d.style.transform = `rotate(${-ang}rad)`;
    a.d.style.opacity = Math.max(0, a.t);
  }
}
