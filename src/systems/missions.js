// Missions (11 étapes), protection des quartiers, assauts aléatoires et apparitions
// d'ambiance.
import * as THREE from 'three';
import { scene, Q } from '../core/renderer.js';
import { P, G, mstate, resetMissionState } from '../core/state.js';
import { clamp, rnd, ri } from '../core/math.js';
import { DISTRICTS, DIST_BY_NAME, WORLD, districtAt, groundH, protPct } from '../world/layout.js';
import { solidAt } from '../world/collision.js';
import { enemies, spawnEnemy, spawnWave } from '../enemy/enemies.js';
import { sfx, vib } from '../audio/audio.js';
import { burst } from '../vfx/effects.js';
import { addXP } from './progression.js';
import { save } from './save.js';
import { toast, alertBanner, updateMissionUI } from '../ui/hud.js';
import { win } from '../main.js';

export const MISSIONS = [
  { t: 'Bienvenue à Lyon', d: 'Rejoins la place Bellecour.', type: 'goto', dist: 'Bellecour', xp: 40, prot: 10 },
  { t: 'Ça chauffe à la Guillotière', d: 'Repousse la première vague.', type: 'clear', dist: 'Guillotière', n: 6, xp: 70, prot: 25 },
  { t: "Défense de la Presqu'île", d: 'Tiens le point pendant 3 vagues.', type: 'defend', dist: "Presqu'île", waves: 3, xp: 110, prot: 35 },
  { t: 'Panique à Part-Dieu', d: 'Sécurise 3 points.', type: 'points', dist: 'Part-Dieu', n: 3, xp: 130, prot: 30 },
  { t: 'Les hauteurs de Fourvière', d: 'Monte la colline et bats le boss.', type: 'boss', dist: 'Fourvière', xp: 200, prot: 60 },
  { t: 'La bataille de la Croix-Rousse', d: 'Nettoie les pentes (10 ennemis).', type: 'clear', dist: 'Croix-Rousse', n: 10, xp: 170, prot: 45 },
  { t: 'Traversée des quais', d: 'Sécurise 3 points le long du Rhône.', type: 'points', dist: 'Quais du Rhône', n: 3, xp: 150, prot: 40 },
  { t: 'Gerland gronde', d: 'Bats le chef de bande de Gerland.', type: 'boss', dist: 'Gerland', xp: 220, prot: 55 },
  { t: 'Nuit à la Confluence', d: 'Tiens le point pendant 4 vagues.', type: 'defend', dist: 'Confluence', waves: 4, xp: 210, prot: 50 },
  { t: 'Le boss de Bellecour', d: "Le chef des bandes t'attend sur la place.", type: 'boss', dist: 'Bellecour', xp: 260, prot: 60 },
  { t: 'Lyon ne tombe pas', d: 'Protège toute la ville.', type: 'final', xp: 400, prot: 0 },
];
export const curMission = () => MISSIONS[Math.min(G.mission, MISSIONS.length - 1)];

// ─── marqueurs d'objectif ───────────────────────────────────────────────────
const markers = [];
const MARK_VS = /* glsl */`varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 ); }`;
const MARK_FS = /* glsl */`uniform vec3 uColor; uniform float uTime; varying vec2 vUv;
void main() {
	float a = pow( 1.0 - vUv.y, 2.0 ) * ( 0.55 + 0.25 * sin( uTime * 3.0 + vUv.y * 12.0 ) );
	gl_FragColor = vec4( uColor * a, a );
}`;
function clearMarkers() {
  while (markers.length) { const m = markers.pop(); scene.remove(m); m.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); o.material.dispose(); } }); }
}
function addMarker(x, z, color) {
  const gy = groundH(x, z), g = new THREE.Group();
  g.position.set(x, gy, z);
  const mat = new THREE.ShaderMaterial({
    vertexShader: MARK_VS, fragmentShader: MARK_FS, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    uniforms: { uColor: { value: new THREE.Color(color) }, uTime: { value: 0 } },
  });
  const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 26, 32, 1, true), mat);
  beam.position.y = 13; g.add(beam);
  const disc = new THREE.Mesh(new THREE.RingGeometry(1.4, 1.65, 48), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.7, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
  disc.rotation.x = -Math.PI / 2; disc.position.y = 0.05; g.add(disc);
  g.userData.mat = mat;
  scene.add(g);
  markers.push(g);
  return g;
}
export function missionTarget() {
  const m = curMission();
  if (m.type === 'points') { const p = mstate.points.find((q) => !q.done); return p ? { x: p.x, z: p.z } : null; }
  if (m.dist) { const d = DIST_BY_NAME[m.dist]; return { x: d.cx, z: d.cz }; }
  return null;
}

export function startMission() {
  const m = curMission();
  resetMissionState();
  clearMarkers();
  if (m.type === 'points') {
    const d = DIST_BY_NAME[m.dist];
    for (let i = 0; i < m.n; i++) {
      let px = d.x + d.w * (0.22 + 0.28 * i) + rnd(-4, 4), pz = d.z + d.d * (0.24 + 0.24 * i);
      for (let k = 0; k < 20 && solidAt(px, pz); k++) { px += rnd(-3, 3); pz += rnd(-3, 3); }
      mstate.points.push({ x: px, z: pz, done: false });
      addMarker(px, pz, 0xffc85a);
    }
  } else if (m.dist) {
    const d = DIST_BY_NAME[m.dist];
    addMarker(d.cx, d.cz, m.type === 'boss' ? 0xe0463c : 0xffc85a);
  }
  updateMissionUI();
}

export function completeMission() {
  const m = curMission();
  addXP(m.xp);
  if (m.dist) { const d = DIST_BY_NAME[m.dist]; d.prot = Math.min(100, d.prot + m.prot); d.assault = false; }
  P.gniac = Math.min(100, P.gniac + 35);
  toast(`MISSION RÉUSSIE  +${m.xp} XP`);
  sfx('win');
  if (protPct() >= 100) { win(); return; }
  if (G.mission < MISSIONS.length - 1) {
    G.mission++;
    startMission();
    setTimeout(() => toast(`NOUVELLE MISSION : ${curMission().t}`, 2000), 1900);
  }
  save();
}

function defendWave(m, d) {
  const n = 4 + mstate.wave * 2;
  for (let i = 0; i < n; i++) {
    const a = (Math.PI * 2 * i) / n, r = rnd(20, 30);
    const x = clamp(d.cx + Math.cos(a) * r, 2, WORLD.w - 2), z = clamp(d.cz + Math.sin(a) * r, 2, WORLD.h - 2);
    if (solidAt(x, z) || groundH(x, z) < -0.5) continue;
    const e = spawnEnemy(i % 4 === 3 ? 'costaud' : i % 3 === 0 ? 'coureur' : 'classic', x, z);
    e.defend = true; e.state = 'chase'; e.alert = 1; e.lastSeen = { x: d.cx, z: d.cz };
  }
}

export function onEnemyKilled(e, d) {
  const m = curMission();
  if (m.type === 'clear' && d.n === m.dist) { mstate.count++; updateMissionUI(); if (mstate.count >= m.n) completeMission(); }
  if (m.type === 'boss' && e.boss && d.n === m.dist) completeMission();
}

export function tickMission(dt) {
  const m = curMission(), pd = districtAt(P.x, P.z);
  for (const mk of markers) mk.userData.mat.uniforms.uTime.value = G.t;
  if (m.type === 'goto') { if (pd.n === m.dist) completeMission(); }
  else if (m.type === 'clear') {
    if (pd.n === m.dist && !mstate.spawned) { mstate.spawned = true; spawnWave(P.x, P.z, Math.min(5, m.n)); alertBanner('Ils arrivent !'); }
    if (mstate.spawned && mstate.count < m.n) {
      const near = enemies.filter((e) => e.state !== 'dead' && districtAt(e.x, e.z).n === m.dist).length;
      if (near < 2) { mstate.timer -= dt; if (mstate.timer <= 0) { mstate.timer = 4; spawnWave(P.x, P.z, Math.min(4, m.n - mstate.count)); } }
    }
  } else if (m.type === 'defend') {
    const d = DIST_BY_NAME[m.dist];
    if (!mstate.active && Math.hypot(P.x - d.cx, P.z - d.cz) < 16) { mstate.active = true; mstate.wave = 0; defendWave(m, d); }
    if (mstate.active && enemies.filter((e) => e.defend && e.state !== 'dead').length === 0) {
      mstate.wave++;
      if (mstate.wave >= m.waves) { mstate.active = false; completeMission(); }
      else { updateMissionUI(); toast(`VAGUE ${mstate.wave + 1}`, 1200); defendWave(m, d); }
    }
  } else if (m.type === 'points') {
    mstate.points.forEach((p, i) => {
      if (!p.done && Math.hypot(P.x - p.x, P.z - p.z) < 3) {
        p.done = true; sfx('pick'); burst(p.x, groundH(p.x, p.z) + 0.6, p.z, 0xffd166, 16, 1.1);
        updateMissionUI(); spawnWave(p.x, p.z, 3);
        if (markers[i]) { markers[i].userData.mat.uniforms.uColor.value.setHex(0x3fae6a); markers[i].children[1].material.color.setHex(0x3fae6a); }
        if (mstate.points.every((q) => q.done)) completeMission();
      }
    });
  } else if (m.type === 'boss') {
    const d = DIST_BY_NAME[m.dist];
    if (!mstate.spawned && Math.hypot(P.x - d.cx, P.z - d.cz) < 34) {
      mstate.spawned = true;
      let bx = d.cx, bz = d.cz;
      for (let k = 0; k < 30 && solidAt(bx, bz); k++) { bx = d.cx + rnd(-10, 10); bz = d.cz + rnd(-10, 10); }
      const b = spawnEnemy('boss', bx, bz, 1 + G.mission * 0.06);
      b.name = `Boss de ${m.dist}`; b.state = 'chase'; b.alert = 1; b.lastSeen = { x: P.x, z: P.z };
      spawnWave(bx, bz, 3);
      alertBanner(`BOSS : ${m.dist.toUpperCase()}`);
      sfx('boss'); vib([60, 40, 60]);
    }
  } else if (m.type === 'final') {
    updateMissionUI();
    if (protPct() >= 100) completeMission();
  }
}

// ─── apparitions d'ambiance et assauts ──────────────────────────────────────
export function tickSpawner(dt) {
  G.spawnT -= dt;
  if (G.spawnT <= 0) {
    G.spawnT = 2.5;
    if (enemies.length < Q().maxE) {
      const d = DISTRICTS[ri(0, DISTRICTS.length - 1)];
      if ((d.prot < 100 || d.assault) && Math.random() * 5 < d.danger) {
        const a = rnd(0, Math.PI * 2), r = rnd(30, 55);
        const x = clamp(P.x + Math.cos(a) * r, 2, WORLD.w - 2), z = clamp(P.z + Math.sin(a) * r, 2, WORLD.h - 2);
        if (groundH(x, z) > -0.5 && !solidAt(x, z) && districtAt(x, z).prot < 100) spawnEnemy(Math.random() < 0.15 ? 'costaud' : Math.random() < 0.3 ? 'coureur' : 'classic', x, z);
      }
    }
  }
  G.eventT -= dt;
  if (G.eventT <= 0) {
    G.eventT = rnd(60, 100);
    const c = DISTRICTS.filter((d) => d.prot < 100 && !d.assault);
    if (c.length) {
      const d = c[ri(0, c.length - 1)];
      d.assault = true;
      alertBanner(`ASSAUT EN COURS À ${d.n.toUpperCase()}`);
      sfx('boss');
      if (Math.hypot(P.x - d.cx, P.z - d.cz) < 80) spawnWave(d.cx, d.cz, 4);
    }
  }
  for (const d of DISTRICTS) {
    if (d.assault && Math.hypot(P.x - d.cx, P.z - d.cz) < 60 && !enemies.some((e) => e.state !== 'dead' && districtAt(e.x, e.z) === d)) {
      d.assault = false; d.prot = Math.min(100, d.prot + 8);
      toast(`${d.n} sécurisé !`);
    }
  }
}
