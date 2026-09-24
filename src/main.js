// Point d'entrée : chargement progressif (matières, ville, pipeline), boucle de jeu,
// déroulement de la partie (intro, jeu, K.O., victoire) et qualité automatique.
import './ui/style.css';
import '@fontsource/barlow-condensed/500.css';
import '@fontsource/barlow-condensed/600.css';
import '@fontsource/barlow-condensed/700.css';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import * as THREE from 'three';
import { GLOBAL } from './render/globals.js';

import { P, G, cam, opt, settings, unlocked, PLAYER_DEFAULTS } from './core/state.js';
import { clamp, lerp } from './core/math.js';
import { CAMERA } from './core/config.js';
import { QUALITY, Q, scene, camera, gpu, renderer, createRenderer, onResize, resize } from './core/renderer.js';
import { initInput, onAction } from './core/input.js';
import { gameCamera, menuCamera, cineCamera, snapCamera, setFade } from './core/camera.js';

import { initMaterials, nextFrame } from './render/materials.js';
import { initAtmosphere, applyShadowQuality, update as updateAtmosphere, ATMO } from './render/atmosphere.js';
import { buildPipeline, resizePipeline, renderFrame } from './render/post.js';

import { DISTRICTS, DIST_BY_NAME, SPAWN, groundH, inWater } from './world/layout.js';
import { solidAt } from './world/collision.js';
import { buildTerrain } from './world/terrain.js';
import { buildRivers, updateWater } from './world/water.js';
import { buildBuildings, updateBuildings, buildingQualityChanged } from './world/buildings.js';
import { buildVehicleModels } from './world/vehicleModels.js';
import { buildLandmarks, updateLandmarks } from './world/landmarks.js';
import { buildProps, updateProps, setLampLightCount } from './world/props.js';
import { buildVegetation } from './world/vegetation.js';
import { updateLOD } from './world/lod.js';
import { buildVehicles, updateVehicles, toggleRide } from './world/vehicles.js';
import { buildCivilians, clearCivilians, updateCivilians } from './world/civilians.js';
import { buildBirds, updateBirds } from './world/birds.js';

import { makeRig, initGhosts, updateGhosts } from './player/rig.js';
import { updatePlayer } from './player/player.js';
import { animRig } from './anim/procedural.js';
import { enemies, spawnEnemy, clearEnemies, updateEnemies } from './enemy/enemies.js';
import { tryGrab } from './combat/melee.js';
import { hurtPlayer } from './combat/damage.js';
import { cycleItem, clearProjectiles, updateProjectiles } from './combat/items.js';
import { muzzleLight, updateShots, selectGun, cycleGun, startReload } from './combat/guns.js';

import { initEffects, updateEffects } from './vfx/effects.js';
import { buildWeather, updateWeather, weather } from './vfx/weather.js';
import { audioInit, audioResume, sfx, vib, music, musicStart, musicStop, startAmbience, updateAmbience } from './audio/audio.js';

import { initItemSpawns, clearPickups, updatePickups } from './systems/pickups.js';
import { curMission, startMission, tickMission, tickSpawner } from './systems/missions.js';
import { save, load, loadOptions, hasSave } from './systems/save.js';

import { initHud, hudUpdate, refreshItemUI, toast, hudNote } from './ui/hud.js';
import { initScreens, show, hideAll, isShown, togglePause, openFrom, syncOpt, qualityLabel } from './ui/screens.js';

const $ = (id) => document.getElementById(id);
const PCFG = { skin: 0xe9b98c, cloth: 0xf4f1e8, cloth2: 0xd8342f, pant: 0x2f4f9e, cap: 0xd8342f, jersey: true, scarf: 0xd8342f, name: 'player' };
const gniacLight = new THREE.PointLight(0xffb040, 0, 9, 2);

// ═════════════ CHARGEMENT ═════════════
function progress(frac, label) {
  $('loadFill').style.width = `${Math.round(frac * 100)}%`;
  if (label) $('loadTxt').textContent = label;
  return nextFrame(); // laisse le navigateur afficher la progression
}

async function boot() {
  createRenderer($('game'));
  if (!loadOptions()) settings.quality = gpu.tier;
  cam.sens = opt.sens || 1;
  await Promise.race([
    Promise.all(['500 16px "Barlow Condensed"', '700 16px "Barlow Condensed"', '400 16px Inter', '600 16px Inter'].map((f) => document.fonts.load(f))),
    new Promise((r) => setTimeout(r, 2500)),
  ]).catch(() => {});

  await progress(0.02, 'Préparation des matières…');
  let n = 0;
  await initMaterials(renderer, Q().texSize, (s) => { n++; $('loadTxt').textContent = s; $('loadFill').style.width = `${Math.round(2 + Math.min(n / 20, 1) * 38)}%`; });
  await progress(0.42, 'Ciel et lumière…');
  initAtmosphere();
  await progress(0.48, 'Construction de la ville…');
  const footprints = buildBuildings();
  await progress(0.58, 'Rues, places et quais…');
  buildTerrain(footprints);
  buildRivers();
  await progress(0.66, 'Monuments…');
  buildVehicleModels();
  buildLandmarks();
  await progress(0.74, 'Mobilier urbain et arbres…');
  buildProps();
  buildVegetation();
  await progress(0.8, 'Circulation et passants…');
  buildVehicles();
  buildCivilians();
  buildBirds();
  initItemSpawns();
  buildWeather();
  initEffects();
  scene.add(muzzleLight, gniacLight);
  setLampLightCount(Q().lampLights);

  P.rig = makeRig(PCFG);
  P.rig.position.set(P.x, groundH(P.x, P.z), P.z);
  scene.add(P.rig);
  initGhosts(PCFG);

  await progress(0.86, 'Post-traitement…');
  applyShadowQuality();
  buildPipeline();
  onResize((w, h) => resizePipeline(w, h));
  resize();

  initInput();
  bindActions();
  initHud();
  initScreens({
    newGame: playIntro, continueGame, quitToMenu, respawn, keepPlaying: () => beginPlay(false), skipIntro, setQuality,
    autoQualityChanged: () => { if (!settings.autoQ && settings.dynScale !== 1) { settings.dynScale = 1; resize(); } },
  });
  syncOpt();
  refreshContinue();

  await progress(0.9, 'Compilation des shaders…');
  menuCamera();
  ambient(0);
  try { await renderer.compileAsync(scene, camera); } catch { /* compilation paresseuse au premier rendu */ }
  renderFrame(0);
  await progress(1, 'Prêt');
  $('loading').classList.add('done');
  show('menu');
  last = performance.now();
  requestAnimationFrame(loop);
}

// ═════════════ BOUCLE ═════════════
let last = 0;
function loop(now) {
  requestAnimationFrame(loop);
  const real = clamp((now - last) / 1000, 1e-4, 0.25);
  last = now;
  let dt = Math.min(real, 0.05);
  if (G.hitstop > 0) { G.hitstop -= dt; dt *= 0.1; }
  if (G.slow > 0) { G.slow -= dt; dt *= 0.35; }
  perfWatch(real);
  cam.sens = opt.sens || 1;
  if (G.running && !G.paused) update(dt);
  else if (!G.paused) {
    G.t += dt;
    updateVehicles(dt); updateCivilians(dt); updateBirds(dt);
    if (G.cine) { cineCamera(dt); animRig(P.rig, { speed: 0 }, dt); }
    else if (G.over) { setFade(0); overCamera(dt); }
    else menuCamera();
  }
  ambient(G.paused ? 0 : dt);
  renderer.info.reset();
  renderFrame(G.paused ? 0 : real);
  frameMs = performance.now() - now;
}
let frameMs = 0;

function update(dt) {
  G.t += dt;
  updatePlayer(dt);
  updateEnemies(dt);
  updatePickups(dt);
  updateProjectiles(dt);
  updateShots(dt);
  updateVehicles(dt);
  updateCivilians(dt);
  updateBirds(dt);
  tickSpawner(dt);
  tickMission(dt);
  musicIntensity(dt);
  gameCamera(dt);
  hudUpdate(dt);
}

// intensité musicale selon le danger proche
function musicIntensity(dt) {
  let near = 0;
  for (const e of enemies) if (e.state !== 'dead' && Math.hypot(e.x - P.x, e.z - P.z) < 16) near += e.boss ? 3 : 1;
  const want = clamp(near / 3, 0, 1);
  music.intensity = (want > 0.5) !== (music.intensity > 0.5) ? want : lerp(music.intensity, want, clamp(dt * 0.8, 0, 1));
}

const focus = new THREE.Vector3(), fwd = new THREE.Vector3();
function ambient(dt) {
  GLOBAL.uTime.value += dt;
  if (G.running || G.cine || G.over) focus.set(P.x, P.y, P.z);
  else { camera.getWorldDirection(fwd); focus.copy(camera.position).addScaledVector(fwd, 25); focus.y = 0; }
  const gust = 0.6 + Math.sin(G.t * 0.21) * 0.25 + Math.sin(G.t * 0.93) * 0.15 + weather.rain * 0.5;
  GLOBAL.uWind.value.set(0.9 * gust, 0.4 * gust);
  updateAtmosphere(dt, focus);
  updateWeather(dt);
  updateWater(G.t);
  updateLandmarks(dt);
  updateBuildings(dt);
  updateProps(dt, focus);
  updateLOD(camera.position);
  updateEffects(dt);
  updateGhosts(dt);
  gniacLight.position.set(P.x, P.y + 1.2, P.z);
  gniacLight.intensity = lerp(gniacLight.intensity, G.running && P.gniac >= 100 ? 6 : 0, clamp(dt * 4, 0, 1));
  updateAmbience(weather.rain, ATMO.night, gust * 0.5);
}

// caméra lente autour du joueur après un K.O. ou la victoire
function overCamera(dt) {
  const o = G.over;
  o.t += dt;
  if (o.ko) animRig(P.rig, { speed: 0, action: 'die', actionT: Math.min(o.t, 1.2), actionDur: 1.2 }, dt);
  else animRig(P.rig, { speed: 0 }, dt);
  const a = o.a + o.t * 0.12, r = 5.5 + Math.min(o.t, 6) * 0.35;
  camera.position.set(P.x + Math.sin(a) * r, P.y + 2.2 + Math.min(o.t, 6) * 0.3, P.z + Math.cos(a) * r);
  camera.lookAt(P.x, P.y + 0.7, P.z);
  camera.fov = lerp(camera.fov, 45, clamp(dt * 2, 0, 1));
  camera.updateProjectionMatrix();
}

// ═════════════ QUALITÉ ═════════════
const perf = { t: 0, n: 0, avg: 60, lastAdjust: -10 };
function perfWatch(real) {
  perf.t += real; perf.n++;
  if (perf.t < 1) return;
  const fps = perf.n / perf.t;
  perf.t = 0; perf.n = 0;
  perf.avg = perf.avg * 0.6 + fps * 0.4;
  $('fpsTxt').textContent = `${Math.round(perf.avg)} i/s · qualité ${qualityLabel().toLowerCase()} · résolution ${Math.round(settings.dynScale * 100)} %`;
  if (!settings.autoQ || !G.running || G.paused || document.hidden || G.t - perf.lastAdjust < 3) return;
  if (perf.avg < 42 && settings.dynScale > 0.62) {
    settings.dynScale = Math.max(0.62, settings.dynScale - 0.12); resize();
    perf.lastAdjust = G.t; hudNote(`Résolution ajustée (${Math.round(settings.dynScale * 100)} %)`);
  } else if (perf.avg < 34 && settings.quality !== 'low') {
    setQuality(settings.quality === 'high' ? 'med' : 'low'); syncOpt();
    perf.lastAdjust = G.t; hudNote(`Qualité abaissée : ${qualityLabel().toLowerCase()}`);
  } else if (perf.avg > 57 && settings.dynScale < 1) {
    settings.dynScale = Math.min(1, settings.dynScale + 0.08); resize();
    perf.lastAdjust = G.t;
  }
}

/** Applique un préréglage à chaud. La résolution des textures change au prochain lancement. */
function setQuality(q) {
  if (!QUALITY[q] || q === settings.quality) return;
  settings.quality = q;
  applyShadowQuality();
  setLampLightCount(Q().lampLights);
  buildingQualityChanged();
  clearCivilians(); buildCivilians();
  buildPipeline();
  resize();
}

// ═════════════ DÉROULEMENT ═════════════
function resetPlayer() {
  Object.assign(P, structuredClone(PLAYER_DEFAULTS), { yaw: 0 });
  for (const d of DISTRICTS) { d.prot = 0; d.assault = false; }
  Object.assign(unlocked, { combo3: false, patate: false, dash2: false, gniacFast: false });
  G.mission = 0;
}

/** Cherche un point libre (ni bâtiment ni eau) autour de (x, z). */
function freeSpot(x, z) {
  if (!solidAt(x, z) && !inWater(x, z)) return [x, z];
  for (let r = 1.5; r < 40; r += 1.5) {
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2, px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
      if (!solidAt(px, pz) && !inWater(px, pz)) return [px, pz];
    }
  }
  return [SPAWN.x, SPAWN.z];
}

function beginPlay(fresh) {
  audioInit(); audioResume();
  if (fresh) resetPlayer();
  clearEnemies(); clearPickups(); clearProjectiles();
  if (P.vehicle) toggleRide();
  Object.assign(P, {
    dead: false, action: null, h: 0, vy: 0, vx: 0, vz: 0, jumps: 0, hist: [], vehicle: null, carry: null,
    reloadT: 0, fireT: 0, block: false, blockT: 0, invuln: 1.2, combo: 0,
  });
  P.hp = Math.max(P.hp, P.hpMax * 0.4);
  [P.x, P.z] = freeSpot(P.x, P.z);
  P.y = groundH(P.x, P.z);
  P.rig.position.set(P.x, P.y, P.z); P.rig.rotation.set(0, P.yaw, 0); P.rig.visible = true;
  G.fin = null; G.cine = null; G.over = null;
  cam.yaw = P.yaw; cam.pitch = CAMERA.pitch; cam.shake = 0;
  snapCamera();
  selectGun(P.guns.includes(P.gun) ? P.gun : null);
  refreshItemUI();
  startMission();
  hideAll();
  $('hud').classList.remove('hidden');
  Object.assign(G, { running: true, paused: false, eventT: 50, spawnT: 2, zone: null });
  musicStart(); startAmbience();
  hudUpdate(0);
  toast(`MISSION : ${curMission().t}`, 2400);
  save();
}

let introTimers = [];
function playIntro() {
  audioInit(); audioResume(); startAmbience();
  resetPlayer();
  [P.x, P.z] = freeSpot(P.x, P.z);
  P.y = groundH(P.x, P.z);
  P.rig.position.set(P.x, P.y, P.z); P.rig.rotation.set(0, P.yaw, 0); P.rig.visible = true;
  cam.yaw = P.yaw; cam.pitch = CAMERA.pitch;
  snapCamera();
  const fv = DIST_BY_NAME['Fourvière'];
  G.cine = {
    t: 0, dur: 7.5,
    from: new THREE.Vector3(fv.cx + 6, groundH(fv.cx, fv.cz) + 34, fv.cz + 26),
    to: new THREE.Vector3(cam.x, cam.y, cam.z),
    lookFrom: new THREE.Vector3(156, 8, 120),
    lookTo: new THREE.Vector3(P.x, P.y + CAMERA.height, P.z),
  };
  const lines = ['Lyon est calme.', 'Puis les quartiers passent en alerte.', '« Lyon est ma ville. Je vais la protéger. »', 'MISSION : PROTÉGER LYON'];
  show('intro');
  const el = $('introTxt');
  let i = 0;
  const next = () => {
    if (i >= lines.length) { introTimers = []; beginPlay(false); return; }
    el.textContent = lines[i];
    el.classList.add('in');
    introTimers.push(setTimeout(() => { el.classList.remove('in'); i++; introTimers.push(setTimeout(next, 400)); }, 1450));
  };
  next();
}
function skipIntro() {
  if (!G.cine) return;
  introTimers.forEach(clearTimeout); introTimers = [];
  beginPlay(false);
}

function continueGame() {
  if (load()) {
    for (const d of DISTRICTS) d.assault = false;
    syncOpt();
    beginPlay(false);
  } else playIntro();
}

function endRun(ko) {
  G.running = false;
  G.over = { t: 0, a: P.yaw + Math.PI * 0.8, ko };
  musicStop();
  if (document.pointerLockElement) document.exitPointerLock();
  save();
}

export function gameOver() {
  endRun(true);
  sfx('ko'); vib([80, 60, 150]);
  setTimeout(() => { show('koScreen'); $('hud').classList.add('hidden'); }, 900);
}

export function win() {
  endRun(false);
  sfx('win');
  $('winStats').textContent = `Niveau ${P.lvl} · ${P.kills} ennemis K.O. · ${P.bosses} boss vaincus · ${P.throws} objets lancés`;
  show('winScreen');
  $('hud').classList.add('hidden');
}

function respawn() {
  P.hp = P.hpMax; P.x = SPAWN.x; P.z = SPAWN.z;
  beginPlay(false);
}

function quitToMenu() {
  save();
  G.running = false; G.paused = false; G.over = null;
  musicStop();
  clearEnemies(); clearProjectiles();
  $('hud').classList.add('hidden');
  refreshContinue();
  show('menu');
}

function refreshContinue() { $('mContinue').style.display = hasSave() ? '' : 'none'; }

// ═════════════ ACTIONS PONCTUELLES ═════════════
const playing = () => G.running && !G.paused;
function bindActions() {
  onAction('map', () => {
    if (!G.running) return;
    if (isShown('mapScreen')) { hideAll(); G.paused = false; } else if (!G.paused) openFrom('mapScreen', 'game');
  });
  onAction('cycleItem', () => { if (playing()) cycleItem(); });
  onAction('ride', () => { if (playing()) toggleRide(); refreshItemUI(); });
  onAction('reload', () => { if (playing()) startReload(); });
  onAction('cycleGun', () => { if (playing()) cycleGun(); });
  onAction('grab', () => { if (playing()) tryGrab(); });
  onAction('help', () => { if (G.running && !G.paused) openFrom('optScreen', 'game'); });
  onAction('pause', () => {
    if (G.cine) { skipIntro(); return; }
    if (!G.running) return;
    if (G.paused && !isShown('pauseScreen')) { hideAll(); G.paused = false; return; }
    togglePause();
  });
  onAction('blur', () => { if (playing()) togglePause(); });
  const tap = (id, fn) => $(id).addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); if (playing()) fn(); });
  tap('bItem', cycleItem);
  tap('bRide', () => { toggleRide(); refreshItemUI(); });
  tap('bGrab', tryGrab);
  document.addEventListener('visibilitychange', () => { if (document.hidden && playing()) togglePause(); });
  setInterval(() => { if (playing()) save(); }, 15000);
}

// point d'accès pour les tests automatisés et le débogage
window.GW = {
  P, G, cam, opt, settings, enemies, atmo: ATMO, weather,
  spawn: (type = 'classic', dx = 2, dz = 2) => spawnEnemy(type, P.x + dx, P.z + dz),
  hurt: (dmg) => hurtPlayer(dmg, P.yaw + Math.PI),
  teleport: (x, z, yaw = P.yaw) => { [P.x, P.z] = freeSpot(x, z); P.yaw = cam.yaw = yaw; P.vx = P.vz = 0; snapCamera(); },
  get info() {
    const r = renderer.info.render;
    return { fps: perf.avg, frameMs, quality: settings.quality, dynScale: settings.dynScale, calls: r.calls, tris: r.triangles, programs: renderer.info.programs.length };
  },
};

boot().catch((e) => {
  console.error(e);
  $('loadTxt').textContent = `Erreur au chargement : ${e.message}. WebGL 2 est nécessaire.`;
  $('loading').classList.add('error');
});

