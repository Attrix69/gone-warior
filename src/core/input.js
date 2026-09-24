// Entrées : clavier, souris (verrouillage du pointeur), tactile (joystick virtuel,
// zone de caméra, boutons). Les actions ponctuelles sont publiées via onAction().
import { clamp } from './math.js';
import { cam, opt, G } from './state.js';
import { CAMERA } from './config.js';

export const input = { mx: 0, my: 0 };
export const btn = { punch: false, kick: false, dodge: false, gniac: false, block: false, sprint: false, throw: false, jump: false, fire: false, aim: false };
export const keys = {};
export const mouseBtn = { 0: false, 2: false };
// appuis brefs mémorisés jusqu'à la prochaine lecture : aucun tapotement n'est perdu,
// même quand une image dure plus longtemps que l'appui
const latch = {};
const took = (k) => { const v = latch[k]; latch[k] = false; return !!v; };

const actions = new Map();
export function onAction(name, fn) { actions.set(name, fn); }
function emit(name) { const fn = actions.get(name); if (fn) fn(); }

const $ = (id) => document.getElementById(id);
let stickId = null, stickOx = 0, stickOy = 0, camId = null, camLx = 0, camLy = 0;

function look(dx, dy, k) {
  const inv = opt.inv ? -1 : 1;
  cam.yaw -= dx * k * inv * cam.sens;
  cam.pitch = clamp(cam.pitch + dy * k * 0.6 * cam.sens, CAMERA.minPitch, CAMERA.maxPitch);
}

export function initInput() {
  const canvas = $('game'), stickEl = $('stick');
  canvas.addEventListener('pointerdown', (e) => {
    if (!G.running || G.paused || e.pointerType === 'mouse') return;
    if (e.clientX < window.innerWidth * 0.5 && stickId === null) {
      stickId = e.pointerId; stickOx = e.clientX; stickOy = e.clientY;
      stickEl.style.display = 'block';
      stickEl.style.left = `${stickOx - 55}px`; stickEl.style.top = `${stickOy - 55}px`;
      stickEl.firstElementChild.style.transform = 'translate(0,0)';
    } else if (camId === null) { camId = e.pointerId; camLx = e.clientX; camLy = e.clientY; }
  });
  window.addEventListener('pointermove', (e) => {
    if (e.pointerId === stickId) {
      let dx = e.clientX - stickOx, dy = e.clientY - stickOy;
      const d = Math.hypot(dx, dy), max = 48;
      if (d > max) { dx = (dx / d) * max; dy = (dy / d) * max; }
      stickEl.firstElementChild.style.transform = `translate(${dx}px,${dy}px)`;
      input.mx = dx / max; input.my = dy / max;
    } else if (e.pointerId === camId) {
      look(e.clientX - camLx, e.clientY - camLy, 0.006);
      camLx = e.clientX; camLy = e.clientY;
    }
  });
  const end = (e) => {
    if (e.pointerId === stickId) { stickId = null; input.mx = 0; input.my = 0; stickEl.style.display = 'none'; }
    if (e.pointerId === camId) camId = null;
  };
  window.addEventListener('pointerup', end);
  window.addEventListener('pointercancel', end);

  const bindBtn = (id, key) => {
    const el = $(id);
    el.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); btn[key] = true; latch[`b:${key}`] = true; el.classList.add('on'); });
    const up = (e) => { e.stopPropagation(); btn[key] = false; el.classList.remove('on'); };
    el.addEventListener('pointerup', up); el.addEventListener('pointerleave', up); el.addEventListener('pointercancel', up);
  };
  [['bPunch', 'punch'], ['bKick', 'kick'], ['bDodge', 'dodge'], ['bGniac', 'gniac'], ['bBlock', 'block'], ['bSprint', 'sprint'],
    ['bThrow', 'throw'], ['bJump', 'jump'], ['bFire', 'fire'], ['bAim', 'aim']].forEach(([id, k]) => bindBtn(id, k));

  window.addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    keys[k] = true;
    if (e.key === ' ' || e.key.startsWith('Arrow')) e.preventDefault();
    if (e.repeat) return;
    if (G.running && !G.paused) latch[k] = true;
    const map = { m: 'map', e: 'cycleItem', v: 'ride', r: 'reload', x: 'cycleGun', c: 'grab', escape: 'pause', f1: 'help' };
    if (map[k]) { if (k === 'escape' && document.pointerLockElement) document.exitPointerLock(); emit(map[k]); }
  });
  window.addEventListener('keyup', (e) => { keys[e.key.toLowerCase()] = false; });
  window.addEventListener('blur', () => {
    for (const k of Object.keys(keys)) keys[k] = false;
    for (const k of Object.keys(latch)) latch[k] = false;
    mouseBtn[0] = mouseBtn[2] = false;
    emit('blur');
  });

  canvas.addEventListener('mousemove', (e) => {
    if (!G.running) return;
    if (document.pointerLockElement === canvas || (e.buttons && camId === null && stickId === null)) look(e.movementX, e.movementY, 0.0032);
  });
  canvas.addEventListener('mousedown', (e) => { if (G.running && !G.paused && document.pointerLockElement === canvas) { mouseBtn[e.button] = true; latch[`m:${e.button}`] = true; } });
  window.addEventListener('mouseup', (e) => { mouseBtn[e.button] = false; });
  canvas.addEventListener('contextmenu', (e) => { if (G.running) e.preventDefault(); });
  canvas.addEventListener('click', () => {
    if (G.running && !G.paused && matchMedia('(pointer: fine)').matches && document.pointerLockElement !== canvas) {
      try { canvas.requestPointerLock(); } catch { /* navigateur sans verrouillage */ }
    }
  });
}

/** Direction de déplacement clavier (ZQSD / WASD) fusionnée avec le joystick. */
export function readMove() {
  let kx = 0, kz = 0;
  if (keys.q || keys.a) kx -= 1;
  if (keys.d) kx += 1;
  if (keys.z || keys.w) kz -= 1;
  if (keys.s) kz += 1;
  if (kx || kz) { const l = Math.hypot(kx, kz); input.mx = kx / l; input.my = kz / l; }
  else if (stickId === null) { input.mx = 0; input.my = 0; }
}

/** Caméra au clavier (flèches). */
export function keyLook(dt) {
  const cs = 2.2 * dt * cam.sens;
  if (keys.arrowleft) cam.yaw += cs;
  if (keys.arrowright) cam.yaw -= cs;
  if (keys.arrowup) cam.pitch = clamp(cam.pitch - cs * 0.6, CAMERA.minPitch, CAMERA.maxPitch);
  if (keys.arrowdown) cam.pitch = clamp(cam.pitch + cs * 0.6, CAMERA.minPitch, CAMERA.maxPitch);
}

/** Intentions du joueur pour cette image. */
export function intents() {
  const m2 = took('m:2');
  const tap = {
    punch: took('j') | took('m:0') | took('b:punch'), kick: took('k') | m2 | took('b:kick'),
    dodge: took('l') | took('b:dodge'), gniac: took('g') | took('b:gniac'), jump: took(' ') | took('b:jump'),
    fire: took('f') | took('b:fire'), throw: took('t') | took('b:throw'), rmb: m2,
  };
  return {
    sprint: btn.sprint || !!keys.shift,
    punch: btn.punch || !!keys.j || mouseBtn[0] || !!tap.punch,
    kick: btn.kick || !!keys.k || mouseBtn[2] || !!tap.kick,
    dodge: btn.dodge || !!keys.l || !!tap.dodge,
    block: btn.block || !!keys.b,
    gniac: btn.gniac || !!keys.g || !!tap.gniac,
    jump: btn.jump || !!keys[' '] || !!tap.jump,
    fire: btn.fire || !!keys.f || !!tap.fire,
    aim: btn.aim,
    rmb: mouseBtn[2] || !!tap.rmb, // clic droit : pied à mains nues, visée avec une arme à feu
    throw: btn.throw || !!keys.t || !!tap.throw,
  };
}
