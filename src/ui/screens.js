// Écrans : menu, pause, options, carte, compétences, K.O., victoire, intro.
import { P, G, opt, settings, unlocked } from '../core/state.js';
import { QUALITY } from '../core/renderer.js';
import { WORLD, DISTRICTS, RIVERS, ROADS_V, ROADS_H, STREETS, DIST_BY_NAME, protPct } from '../world/layout.js';
import { MISSIONS, curMission } from '../systems/missions.js';
import { save, saveOptions, wipeSave } from '../systems/save.js';
import { sfx, musicStart, musicStop } from '../audio/audio.js';

const $ = (id) => document.getElementById(id);
const SCREENS = ['menu', 'mapScreen', 'skillScreen', 'optScreen', 'pauseScreen', 'koScreen', 'winScreen', 'intro'];
let returnTo = 'menu';

export function hideAll() { for (const s of SCREENS) $(s).classList.remove('show'); }
export function show(id) { hideAll(); $(id).classList.add('show'); }
export const isShown = (id) => $(id).classList.contains('show');

export const HELP_TEXT = 'Clavier et souris : ZQSD ou WASD déplacement · souris ou flèches caméra (clic pour capturer la souris) · '
  + 'clic gauche ou J poing · clic droit ou K pied (visée avec une arme) · Espace saut (double saut au niveau 5) · L esquive · B garde '
  + '(juste avant l\'impact : parade puis contre-attaque au poing) · Maj sprint · G Gniac · T lancer · E changer d\'objet · C saisir / jeter · '
  + 'V monter / descendre d\'un véhicule · F tirer · R recharger · X changer d\'arme · M carte · Échap pause. '
  + 'Tactile : pouce gauche pour se déplacer, un doigt sur la moitié droite pour la caméra.';

// ─── pause ──────────────────────────────────────────────────────────────────
export function togglePause() {
  if (!G.running) return;
  if (isShown('pauseScreen')) { hideAll(); G.paused = false; return; }
  $('pauseInfo').innerHTML = [
    [P.lvl, 'Niveau'], [`${protPct()} %`, 'Lyon protégée'], [P.kills, 'Ennemis K.O.'], [P.baille || 0, 'À la baille'],
  ].map(([v, l]) => `<div class="stat"><b>${v}</b>${l}</div>`).join('');
  show('pauseScreen');
  G.paused = true;
  if (document.pointerLockElement) document.exitPointerLock();
}
export function openFrom(id, from) {
  returnTo = from;
  if (id === 'mapScreen') drawBigMap();
  if (id === 'skillScreen') drawSkills();
  if (id === 'optScreen') syncOpt();
  show(id);
  if (G.running) G.paused = true;
}
function back() {
  if (returnTo === 'pause') { togglePauseOpen(); return; }
  if (G.running) { hideAll(); G.paused = false; } else show('menu');
}
function togglePauseOpen() { hideAll(); G.paused = false; togglePause(); }

// ─── carte ──────────────────────────────────────────────────────────────────
export function drawBigMap() {
  const cv = $('mapCv'), g = cv.getContext('2d'), W = cv.width, H = cv.height, sx = W / WORLD.w, sy = H / WORLD.h;
  g.fillStyle = '#101216'; g.fillRect(0, 0, W, H);
  for (const d of DISTRICTS) {
    g.fillStyle = d.kind === 'park' ? '#1f2e22' : '#1a1c21';
    g.fillRect(d.x * sx, d.z * sy, d.w * sx, d.d * sy);
    g.fillStyle = d.assault ? 'rgba(216,69,58,.32)' : d.prot >= 100 ? 'rgba(87,176,124,.22)' : d.prot > 0 ? 'rgba(227,163,60,.12)' : 'rgba(0,0,0,0)';
    g.fillRect(d.x * sx, d.z * sy, d.w * sx, d.d * sy);
  }
  g.fillStyle = '#2e3138';
  for (const s of STREETS) {
    if (s.axis === 'x') g.fillRect((s.c - s.road / 2) * sx, s.from * sy, s.road * sx, (s.to - s.from) * sy);
    else g.fillRect(s.from * sx, (s.c - s.road / 2) * sy, (s.to - s.from) * sx, s.road * sy);
  }
  g.fillStyle = '#3c4048';
  for (const rx of ROADS_V) g.fillRect((rx - 6) * sx, 0, 12 * sx, H);
  for (const rz of ROADS_H) g.fillRect(0, (rz - 6) * sy, W, 12 * sy);
  g.fillStyle = '#1d3b50';
  for (const r of RIVERS) g.fillRect(r.x * sx, 0, r.w * sx, H);
  g.textAlign = 'center';
  for (const d of DISTRICTS) {
    g.fillStyle = '#ece6da'; g.font = '600 15px "Barlow Condensed", sans-serif';
    g.fillText(d.n.toUpperCase(), d.cx * sx, d.cz * sy);
    g.fillStyle = d.assault ? '#e05a48' : '#9d978c'; g.font = '500 11px Inter, sans-serif';
    g.fillText(d.assault ? 'assaut en cours' : `${Math.round(d.prot)} %`, d.cx * sx, d.cz * sy + 15);
  }
  const m = curMission();
  if (m.dist) { const d = DIST_BY_NAME[m.dist]; g.strokeStyle = '#e3a33c'; g.lineWidth = 2; g.beginPath(); g.arc(d.cx * sx, d.cz * sy - 24, 8, 0, Math.PI * 2); g.stroke(); }
  g.fillStyle = '#f4efe6'; g.beginPath(); g.arc(P.x * sx, P.z * sy, 6, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#0b0d10'; g.lineWidth = 2; g.stroke();
  $('protTxt').textContent = `LYON PROTÉGÉE : ${protPct()} %  ·  BOSS VAINCUS : ${P.bosses}`;
}

// ─── compétences ────────────────────────────────────────────────────────────
function drawSkills() {
  $('statGrid').innerHTML = [[P.hpMax, 'Vie max'], [P.str.toFixed(2), 'Force'], [P.spd.toFixed(2), 'Vitesse'], [P.def.toFixed(2), 'Défense'], [P.gn.toFixed(2), 'Gniac'], [P.coins, 'Pièces']]
    .map(([v, l]) => `<div class="stat"><b>${v}</b>${l}</div>`).join('');
  const rows = [
    ['Poing → Poing → Poing = Triplé du Gone (uppercut, envoie en l\'air)', 'Dès le départ', true],
    ['Pied → Poing → Pied = Balayage (met au sol)', 'Dès le départ', true],
    ['Esquive puis Poing = Charge d\'épaule', 'Dès le départ', true],
    ['Garde au dernier moment = Parade, puis Poing = Contre-attaque', 'Dès le départ', true],
    ['En l\'air + Pied = Pied plongeant', 'Dès le départ', true],
    ['Poing → Poing → Pied = Coup de pied sauté', 'Dès le départ', true],
    ['Pied → Pied = Coup de pied retourné (touche tout autour)', 'Dès le départ', true],
    ['Double saut', 'Niveau 5', P.lvl >= 5],
    ['Poing → Pied → Pied = Coup de tête extrême', 'Niveau 2', unlocked.combo3],
    ['Pied → Pied → Poing = Patate lyonnaise (envoie en l\'air)', 'Niveau 3', unlocked.patate],
    ['Roulade améliorée', 'Niveau 4', unlocked.dash2],
    ['Recharge Gniac accélérée', 'Niveau 6', unlocked.gniacFast],
  ];
  $('comboList').innerHTML = rows.map((r) => `<div class="mrow ${r[2] ? 'done' : ''}"><b>${r[0]}</b><br><span style="opacity:.7">${r[2] ? 'Débloqué' : `Verrouillé · ${r[1]}`}</span></div>`).join('')
    + '<div class="mrow cur"><b>Objets à lancer</b><br><span style="opacity:.8">Bouteille : éclats · Briquet : met le feu · Andouillette : étourdit · Tarte aux pralines : englue le groupe · Boule de pétanque : rebondit trois fois · Quenelle : explose en sauce Nantua · Corne de brume : assourdit tout le monde alentour</span></div>'
    + '<div class="mrow cur"><b>Au corps à corps</b><br><span style="opacity:.8">Poing américain · Ceinture (fouet) · Matraque · Baguette (longue, casse vite) · Poêle (sonne l\'adversaire) · Parapluie (très rapide) · Extincteur (cône de mousse qui repousse et gèle)</span></div>'
    + '<div class="mrow cur"><b>Missions</b></div>'
    + MISSIONS.map((m, i) => `<div class="mrow ${i < G.mission ? 'done' : i === G.mission ? 'cur' : ''}">${i + 1}. ${m.t}<br><span style="opacity:.65">${m.d}</span></div>`).join('');
}

// ─── options ────────────────────────────────────────────────────────────────
const TOD = { cycle: 'Heure : cycle jour/nuit', day: 'Heure : plein jour', dusk: 'Heure : coucher de soleil', night: 'Heure : nuit' };
const WEATHER = { auto: 'Météo : variable', clear: 'Météo : dégagé', cloudy: 'Météo : nuageux', rain: 'Météo : pluie' };
export function syncOpt() {
  document.querySelectorAll('#qRow .chip').forEach((b) => b.classList.toggle('sel', b.dataset.q === settings.quality));
  const tog = (id, on, label) => { $(id).textContent = `${label} : ${on ? 'oui' : 'non'}`; $(id).classList.toggle('sel', on); };
  tog('sfxT', opt.sfx, 'Sons'); tog('musT', opt.mus, 'Musique'); tog('vibT', opt.vib, 'Vibration');
  tog('invT', opt.inv, 'Caméra inversée'); tog('bloodT', opt.blood !== false, 'Sang'); tog('comicT', !!opt.comic, 'Onomatopées BD');
  tog('autoQ', settings.autoQ, 'Qualité auto'); tog('shakeT', opt.shake > 0, 'Secousses');
  $('sensT').textContent = `Sensibilité : ${opt.sens === 0.6 ? 'basse' : opt.sens === 1.6 ? 'haute' : 'normale'}`;
  $('todT').textContent = TOD[opt.tod || 'cycle']; $('todT').classList.add('sel');
  $('weatherT').textContent = WEATHER[opt.weather || 'auto']; $('weatherT').classList.add('sel');
  $('helpTxt').textContent = HELP_TEXT;
}

/** Branche les boutons des écrans. `actions` fournit les transitions de flux du jeu. */
export function initScreens(actions) {
  const on = (id, fn) => $(id).addEventListener('click', () => { sfx('ui'); fn(); });
  on('mPlay', actions.newGame);
  on('mContinue', actions.continueGame);
  on('mMap', () => openFrom('mapScreen', 'menu'));
  on('mSkills', () => openFrom('skillScreen', 'menu'));
  on('mOpt', () => openFrom('optScreen', 'menu'));
  on('mapBack', back); on('skillBack', back);
  on('optBack', () => { save(); back(); });
  on('pResume', () => { hideAll(); G.paused = false; });
  on('pMap', () => openFrom('mapScreen', 'pause'));
  on('pSkills', () => openFrom('skillScreen', 'pause'));
  on('pOpt', () => openFrom('optScreen', 'pause'));
  on('pQuit', actions.quitToMenu);
  on('koBack', actions.respawn);
  on('winBack', actions.keepPlaying);
  on('introSkip', actions.skipIntro);
  $('bMap').addEventListener('click', (e) => { e.stopPropagation(); openFrom('mapScreen', 'game'); });
  $('bPause').addEventListener('click', (e) => { e.stopPropagation(); togglePause(); });
  $('mini').addEventListener('click', () => openFrom('mapScreen', 'game'));
  on('wipe', () => { if (confirm('Effacer la sauvegarde ?')) { wipeSave(); location.reload(); } });
  document.querySelectorAll('#qRow .chip').forEach((b) => b.addEventListener('click', () => { actions.setQuality(b.dataset.q); syncOpt(); saveOptions(); }));
  const flip = (id, fn) => on(id, () => { fn(); syncOpt(); saveOptions(); });
  flip('sfxT', () => { opt.sfx = !opt.sfx; });
  flip('musT', () => { opt.mus = !opt.mus; if (opt.mus && G.running) musicStart(); else musicStop(); });
  flip('vibT', () => { opt.vib = !opt.vib; });
  flip('invT', () => { opt.inv = !opt.inv; });
  flip('bloodT', () => { opt.blood = opt.blood === false; });
  flip('comicT', () => { opt.comic = !opt.comic; });
  flip('shakeT', () => { opt.shake = opt.shake > 0 ? 0 : 1; });
  flip('autoQ', () => { settings.autoQ = !settings.autoQ; actions.autoQualityChanged(); });
  flip('sensT', () => { opt.sens = opt.sens === 1.6 ? 0.6 : opt.sens === 0.6 ? 1 : 1.6; });
  flip('todT', () => { opt.tod = { cycle: 'day', day: 'dusk', dusk: 'night', night: 'cycle' }[opt.tod || 'cycle']; });
  flip('weatherT', () => { opt.weather = { auto: 'clear', clear: 'cloudy', cloudy: 'rain', rain: 'auto' }[opt.weather || 'auto']; });
  if (matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0) document.body.classList.add('touch');
  window.addEventListener('pointerdown', (e) => { if (e.pointerType === 'touch') document.body.classList.add('touch'); }, { passive: true });
}

export function qualityLabel() { return QUALITY[settings.quality].label; }
