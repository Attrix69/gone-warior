// Audio : effets sonores synthétisés (WebAudio), spatialisés quand une position est
// fournie, et musique procédurale à deux intensités (exploration / combat) cadencée
// par l'horloge audio (planification anticipée : tempo stable).
// Emplacement prévu pour des échantillons réels : assets/audio/ (voir docs/ASSETS.md).
import { opt } from '../core/state.js';
import { camera } from '../core/renderer.js';

export let AC = null;
let master = null, musGain = null, sfxGain = null, ambGain = null;

export function audioInit() {
  if (AC) return;
  try {
    AC = new (window.AudioContext || window.webkitAudioContext)();
    master = AC.createGain(); master.gain.value = 0.9;
    const comp = AC.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 4;
    master.connect(comp); comp.connect(AC.destination);
    musGain = AC.createGain(); musGain.gain.value = 0.09; musGain.connect(master);
    sfxGain = AC.createGain(); sfxGain.gain.value = 0.55; sfxGain.connect(master);
    ambGain = AC.createGain(); ambGain.gain.value = 0.0; ambGain.connect(master);
  } catch { AC = null; }
}
export function audioResume() { if (AC && AC.state === 'suspended') AC.resume(); }
export function sfxOut() { return sfxGain; }
export function ambienceOut() { return ambGain; }

/** Nœud de sortie : panoramique + atténuation selon la distance à la caméra. */
function outFor(pos) {
  if (!pos) return sfxGain;
  const dx = pos.x - camera.position.x, dz = pos.z - camera.position.z;
  const d = Math.hypot(dx, dz);
  const g = AC.createGain();
  g.gain.value = 1 / (1 + d * 0.06);
  const pan = AC.createStereoPanner ? AC.createStereoPanner() : null;
  if (pan) {
    const yaw = Math.atan2(-camera.matrixWorld.elements[8], -camera.matrixWorld.elements[10]);
    const ang = Math.atan2(dx, dz) - yaw;
    pan.pan.value = Math.max(-0.85, Math.min(0.85, -Math.sin(ang)));
    g.connect(pan); pan.connect(sfxGain);
  } else g.connect(sfxGain);
  return g;
}

export function tone(f, dur, type = 'square', vol = 0.3, slide = 0, pos = null, delay = 0) {
  if (!AC || !opt.sfx) return;
  const t0 = AC.currentTime + delay;
  const o = AC.createOscillator(), g = AC.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t0);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, slide), t0 + dur);
  g.gain.setValueAtTime(vol, t0); g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  o.connect(g); g.connect(outFor(pos)); o.start(t0); o.stop(t0 + dur + 0.02);
}

const noiseBuffers = new Map();
function noiseBuffer(dur) {
  const key = Math.round(dur * 100);
  if (!noiseBuffers.has(key)) {
    const n = Math.max(1, Math.floor(AC.sampleRate * dur)), buf = AC.createBuffer(1, n, AC.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    noiseBuffers.set(key, buf);
  }
  return noiseBuffers.get(key);
}
export function noise(dur, vol = 0.3, freq = 400, type = 'highpass', pos = null, delay = 0) {
  if (!AC || !opt.sfx) return;
  const t0 = AC.currentTime + delay;
  const s = AC.createBufferSource(); s.buffer = noiseBuffer(dur);
  const f = AC.createBiquadFilter(); f.type = type; f.frequency.value = freq;
  const g = AC.createGain(); g.gain.value = vol;
  s.connect(f); f.connect(g); g.connect(outFor(pos)); s.start(t0);
}

/** Bibliothèque d'effets. `pos` (optionnel) : {x, z} pour la spatialisation. */
export function sfx(k, pos = null) {
  if (!AC || !opt.sfx) return;
  switch (k) {
    case 'punch': noise(0.05, 0.2, 900, 'lowpass', pos); tone(150, 0.07, 'sine', 0.3, 60, pos); noise(0.03, 0.08, 2500, 'highpass', pos); break;
    case 'kick': noise(0.08, 0.24, 500, 'lowpass', pos); tone(95, 0.13, 'sine', 0.34, 45, pos); break;
    case 'head': noise(0.12, 0.3, 300, 'lowpass', pos); tone(70, 0.2, 'sine', 0.4, 35, pos); noise(0.05, 0.12, 1800, 'bandpass', pos); break;
    case 'whip': noise(0.14, 0.16, 2400, 'highpass', pos); tone(900, 0.06, 'sine', 0.08, 300, pos); break;
    case 'whiff': noise(0.09, 0.07, 1400, 'bandpass', pos); break;
    case 'hit': noise(0.05, 0.14, 1200, 'bandpass', pos); tone(260, 0.05, 'triangle', 0.1, 0, pos); break;
    case 'hurt': tone(190, 0.16, 'sawtooth', 0.14, 110, pos); noise(0.08, 0.1, 700, 'lowpass', pos); break;
    case 'block': noise(0.05, 0.16, 3000, 'highpass', pos); tone(420, 0.08, 'triangle', 0.12, 300, pos); break;
    case 'shot': noise(0.09, 0.34, 900, 'lowpass', pos); noise(0.03, 0.2, 3000, 'highpass', pos); tone(120, 0.12, 'sine', 0.3, 50, pos); break;
    case 'smg': noise(0.05, 0.22, 1100, 'lowpass', pos); noise(0.02, 0.12, 3500, 'highpass', pos); break;
    case 'rocket': noise(0.5, 0.3, 300, 'lowpass', pos); tone(90, 0.5, 'sawtooth', 0.2, 700, pos); break;
    case 'boom':
      noise(1.2, 0.55, 140, 'lowpass', pos); tone(52, 0.9, 'sine', 0.55, 24, pos); noise(0.6, 0.25, 600, 'bandpass', pos, 0.08);
      noise(0.9, 0.12, 4000, 'highpass', pos, 0.15); break;
    case 'reload': noise(0.06, 0.14, 2500, 'bandpass', pos); noise(0.08, 0.16, 1400, 'bandpass', pos, 0.22); break;
    case 'clang': tone(1300, 0.4, 'triangle', 0.16, 420, pos); tone(2100, 0.3, 'sine', 0.12, 700, pos); noise(0.06, 0.1, 3000, 'highpass', pos); break;
    case 'horn': tone(180, 0.6, 'sawtooth', 0.3, 0, pos); tone(240, 0.6, 'square', 0.14, 0, pos); tone(180, 0.5, 'sawtooth', 0.26, 0, pos, 0.24); tone(240, 0.5, 'square', 0.12, 0, pos, 0.24); break;
    case 'spray': noise(0.25, 0.16, 2600, 'highpass', pos); break;
    case 'plouf': noise(0.4, 0.28, 400, 'lowpass', pos); tone(380, 0.25, 'sine', 0.14, 120, pos); break;
    case 'bounce': tone(700, 0.08, 'triangle', 0.14, 400, pos); noise(0.04, 0.08, 2500, 'highpass', pos); break;
    case 'glass': noise(0.3, 0.3, 3200, 'highpass', pos); tone(2600, 0.12, 'sine', 0.08, 1400, pos); tone(3400, 0.1, 'sine', 0.06, 2000, pos, 0.04); break;
    case 'splat': noise(0.12, 0.22, 300, 'lowpass', pos); tone(140, 0.12, 'sine', 0.2, 60, pos); break;
    case 'fire': noise(0.4, 0.12, 600, 'bandpass', pos); break;
    case 'dodge': noise(0.16, 0.1, 900, 'bandpass', pos); break;
    case 'land': noise(0.08, 0.16, 350, 'lowpass', pos); tone(70, 0.08, 'sine', 0.2, 40, pos); break;
    case 'pick': tone(680, 0.07, 'triangle', 0.18, 980); break;
    case 'lvl': [440, 660, 880].forEach((f, i) => tone(f, 0.16, 'triangle', 0.22, 0, null, i * 0.09)); break;
    case 'gniac': tone(70, 0.9, 'sawtooth', 0.35, 900); noise(0.7, 0.34, 180, 'lowpass'); tone(1400, 0.35, 'square', 0.12, 180, null, 0.2); break;
    case 'boss': [110, 110, 146, 110].forEach((f, i) => tone(f, 0.25, 'sawtooth', 0.24, 0, null, i * 0.18)); break;
    case 'win': [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.22, 'triangle', 0.24, 0, null, i * 0.13)); break;
    case 'ko': [300, 220, 150, 90].forEach((f, i) => tone(f, 0.3, 'sawtooth', 0.24, 0, null, i * 0.14)); break;
    case 'ui': tone(520, 0.05, 'sine', 0.12, 700); break;
    default: break;
  }
}

/** Pas selon le sol (asphalte, pierre, pavés, herbe, gravier, eau). */
export function footstep(surface, pos, heavy = 1) {
  if (!AC || !opt.sfx) return;
  const v = 0.07 * heavy;
  switch (surface) {
    case 'grass': noise(0.07, v * 0.8, 1800, 'bandpass', pos); break;
    case 'gravel': noise(0.09, v * 1.3, 2600, 'highpass', pos); noise(0.05, v, 900, 'bandpass', pos, 0.02); break;
    case 'cobble': noise(0.05, v * 1.2, 1300, 'bandpass', pos); tone(160, 0.04, 'sine', v, 90, pos); break;
    case 'water': noise(0.12, v * 1.4, 600, 'lowpass', pos); break;
    case 'metal': tone(420, 0.06, 'triangle', v, 250, pos); break;
    default: noise(0.05, v, 1000, 'bandpass', pos); tone(110, 0.04, 'sine', v * 0.9, 70, pos); break;
  }
}

export function vib(pattern) {
  if (opt.vib && navigator.vibrate) try { navigator.vibrate(pattern); } catch { /* non pris en charge */ }
}

// ─── musique procédurale ────────────────────────────────────────────────────
const BASS = [0, 0, 7, 0, 3, 3, 10, 7, 0, 0, 5, 0, 3, 7, 10, 12];
const LEAD = [12, 15, 19, 15, 12, 10, 7, 10, 12, 19, 22, 19, 17, 15, 12, 10];
export const music = { intensity: 0, playing: false };
let step = 0, nextTime = 0, timer = null;

function drum(kind, t) {
  if (kind === 'kick') {
    const o = AC.createOscillator(), g = AC.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    g.gain.setValueAtTime(0.5, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
    o.connect(g); g.connect(musGain); o.start(t); o.stop(t + 0.18);
  } else {
    const snare = kind === 'snare';
    const s = AC.createBufferSource(); s.buffer = noiseBuffer(snare ? 0.12 : 0.04);
    const f = AC.createBiquadFilter(); f.type = snare ? 'bandpass' : 'highpass'; f.frequency.value = snare ? 1800 : 7000;
    const g = AC.createGain(); g.gain.value = snare ? 0.28 : 0.12;
    s.connect(f); f.connect(g); g.connect(musGain); s.start(t);
  }
}
function note(freq, dur, type, vol, t) {
  const o = AC.createOscillator(), g = AC.createGain(), f = AC.createBiquadFilter();
  f.type = 'lowpass'; f.frequency.value = 900 + music.intensity * 2600;
  o.type = type; o.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.015); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(f); f.connect(g); g.connect(musGain); o.start(t); o.stop(t + dur + 0.02);
}
function schedule() {
  if (!AC || !opt.mus) return;
  while (nextTime < AC.currentTime + 0.25) {
    const st = step % 16, combat = music.intensity > 0.5, t = nextTime;
    note(55 * Math.pow(2, BASS[st] / 12), combat ? 0.2 : 0.34, 'sawtooth', 0.14 + music.intensity * 0.05, t);
    if (st % 4 === 0) drum('kick', t);
    if (combat && st % 8 === 4) drum('snare', t);
    if (combat && st % 2 === 1) drum('hat', t);
    if (combat && st % 2 === 0) note(220 * Math.pow(2, LEAD[st] / 12), 0.16, 'square', 0.04 + music.intensity * 0.04, t);
    if (!combat && st % 8 === 0) note(220 * Math.pow(2, LEAD[st] / 12), 0.8, 'triangle', 0.05, t);
    nextTime += combat ? 0.15 : 0.23;
    step++;
  }
}
export function musicStart() {
  audioInit();
  if (!AC || timer || !opt.mus) return;
  nextTime = AC.currentTime + 0.05;
  music.playing = true;
  timer = setInterval(schedule, 60);
}
export function musicStop() { if (timer) { clearInterval(timer); timer = null; } music.playing = false; }

// ─── ambiances en boucle : rumeur urbaine, vent, pluie ──────────────────────
const amb = {};
function loopNoise(type, freq, q = 0.7) {
  const n = AC.sampleRate * 4, buf = AC.createBuffer(1, n, AC.sampleRate), d = buf.getChannelData(0);
  let b = 0;
  for (let i = 0; i < n; i++) { b = 0.97 * b + 0.03 * (Math.random() * 2 - 1); d[i] = type === 'brown' ? b * 6 : Math.random() * 2 - 1; }
  const s = AC.createBufferSource(); s.buffer = buf; s.loop = true;
  const f = AC.createBiquadFilter(); f.type = type === 'brown' ? 'lowpass' : 'bandpass'; f.frequency.value = freq; f.Q.value = q;
  const g = AC.createGain(); g.gain.value = 0;
  s.connect(f); f.connect(g); g.connect(ambGain); s.start();
  return g;
}
export function startAmbience() {
  audioInit();
  if (!AC || amb.city) return;
  ambGain.gain.value = 1;
  amb.city = loopNoise('brown', 320);
  amb.wind = loopNoise('white', 500, 0.4);
  amb.rain = loopNoise('white', 3200, 0.3);
}
/** Mise à jour douce des niveaux d'ambiance. */
export function updateAmbience(rain, night, wind = 0.3) {
  if (!AC || !amb.city) return;
  const t = AC.currentTime, on = opt.sfx ? 1 : 0;
  amb.city.gain.setTargetAtTime(on * (0.05 - night * 0.025), t, 0.8);
  amb.wind.gain.setTargetAtTime(on * (0.008 + wind * 0.02 + rain * 0.01), t, 1.2);
  amb.rain.gain.setTargetAtTime(on * rain * 0.07, t, 1.0);
}
