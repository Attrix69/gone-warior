// Animation procédurale des personnages : pour chaque état (marche, course, coups,
// esquive, chutes…) on calcule une pose cible, puis chaque os s'en rapproche avec un
// amortissement exponentiel (transitions fluides, anticipation / impact / récupération
// découpées en phases dans chaque attaque).
import { clamp, lerp, ease } from '../core/math.js';

/**
 * @param {THREE.Group} rig
 * @param {object} st  speed, action, actionT, actionDur, block, air, gun, kick, carry, lean, side, beltSway
 */
export function animRig(rig, st, dt) {
  const u = rig.userData, S = u.S;
  u.t += dt;
  const A = u.armL, B = u.armR, L = u.legL, R = u.legR, T = u.torso, H = u.hips, N = u.neck;
  const sp = (st.speed || 0) / 0.5; // vitesses exprimées dans l'échelle d'origine
  const walk = clamp(sp / 9, 0, 1.5), run = clamp((sp - 9) / 7, 0, 1), lean = st.lean || 0;
  u.anim += dt * (4 + walk * 7);
  const w = u.anim, breathe = Math.sin(u.t * 2) * 0.035;
  const tgt = {
    hipY: 1.7 * S - walk * 0.1 * S + Math.abs(Math.sin(w)) * 0.07 * S * walk, hipRotY: -Math.sin(w) * 0.22 * walk, hipRotX: walk * 0.18 + run * 0.2,
    torRotY: Math.sin(w) * 0.28 * walk, torRotX: breathe + walk * 0.12 + run * 0.2, torRotZ: -lean * 0.5, neckRotX: -walk * 0.16 - run * 0.15, neckRotY: Math.sin(w) * 0.1 * walk,
    aUp: Math.sin(w) * (1.0 + run * 0.4) * walk - 0.12 - breathe, aEl: -0.3 - walk * 0.5 - run * 0.8, bUp: -Math.sin(w) * (1.0 + run * 0.4) * walk - 0.12 - breathe, bEl: -0.3 - walk * 0.5 - run * 0.8,
    aUpZ: 0.12 + walk * 0.08, bUpZ: -0.12 - walk * 0.08, lTh: -Math.sin(w) * (0.95 + run * 0.35) * walk, lKn: Math.max(0, Math.sin(w - 0.7)) * (1.1 + run * 0.5) * walk,
    rTh: Math.sin(w) * (0.95 + run * 0.35) * walk, rKn: Math.max(0, Math.sin(w + 2.44)) * (1.1 + run * 0.5) * walk, pivX: 0, pivY: 0, pivZ: 0, hipZ: 0, pivC: 0,
  };
  if (st.block) { tgt.aUp = -1.25; tgt.aEl = -1.8; tgt.bUp = -1.25; tgt.bEl = -1.8; tgt.aUpZ = 0.5; tgt.bUpZ = -0.5; tgt.torRotX = 0.22; tgt.hipY -= 0.12 * S; }
  const act = st.action, p = act ? clamp(st.actionT / st.actionDur, 0, 1) : 0;
  if (act === 'punchR' || act === 'punchL') {
    const left = act === 'punchL', main = left ? 'a' : 'b', off = left ? 'b' : 'a', sgn = left ? 1 : -1;
    let ext, el, rot, fwd, dip;
    if (p < 0.3) { const q = ease(p / 0.3); ext = lerp(-0.15, 0.95, q); el = lerp(-0.35, -1.85, q); rot = lerp(0, 0.7 * sgn, q); fwd = lerp(0, -0.14, q) * S; dip = lerp(0, 0.06, q) * S; }
    else if (p < 0.42) { const q = 1 - Math.pow(1 - (p - 0.3) / 0.12, 3); ext = lerp(0.95, -2.05, q); el = lerp(-1.85, -0.02, q); rot = lerp(0.7 * sgn, -0.75 * sgn, q); fwd = lerp(-0.14, 0.34, q) * S; dip = lerp(0.06, 0.12, q) * S; }
    else { const q = ease((p - 0.42) / 0.58); ext = lerp(-2.05, -0.15, q); el = lerp(-0.02, -0.35, q); rot = lerp(-0.75 * sgn, 0, q); fwd = lerp(0.34, 0, q) * S; dip = lerp(0.12, 0, q) * S; }
    tgt[`${main}Up`] = ext; tgt[`${main}El`] = el; tgt[`${main}UpZ`] = (left ? 1 : -1) * 0.1;
    tgt[`${off}Up`] = -1.05; tgt[`${off}El`] = -1.75; tgt[`${off}UpZ`] = (left ? -1 : 1) * 0.42;
    tgt.hipRotY = rot; tgt.torRotY = rot * 1.05; tgt.torRotX = 0.08 + Math.sin(p * Math.PI) * 0.2; tgt.torRotZ = -rot * 0.18;
    tgt.neckRotY = -rot * 0.45; tgt.neckRotX = Math.sin(p * Math.PI) * 0.12;
    tgt.hipY = 1.7 * S - dip; tgt.hipZ = fwd;
    tgt.lTh = -0.22 + rot * 0.25; tgt.rTh = 0.22 - rot * 0.25; tgt.lKn = 0.2; tgt.rKn = 0.3;
  } else if (act === 'whip') {
    if (p < 0.38) { const q = ease(p / 0.38); tgt.bUp = lerp(-0.15, -2.5, q); tgt.bUpZ = lerp(-0.12, -1.4, q); tgt.bEl = -0.6; tgt.hipRotY = 0.7 * q; tgt.torRotY = 0.8 * q; }
    else if (p < 0.55) { const q = ease((p - 0.38) / 0.17); tgt.bUp = -1.55; tgt.bUpZ = lerp(-1.4, 1.1, q); tgt.bEl = -0.2; tgt.hipRotY = lerp(0.7, -0.6, q); tgt.torRotY = lerp(0.8, -0.7, q); }
    else { const q = ease((p - 0.55) / 0.45); tgt.bUp = lerp(-1.55, -0.15, q); tgt.bUpZ = lerp(1.1, -0.12, q); tgt.bEl = -0.4; tgt.hipRotY = lerp(-0.6, 0, q); tgt.torRotY = lerp(-0.7, 0, q); }
    tgt.aUp = -0.8; tgt.aEl = -1.4; tgt.torRotX = 0.15; tgt.hipZ = Math.sin(p * Math.PI) * 0.18 * S;
  } else if (act === 'kick') {
    let th, kn, ln, rot, dip;
    if (p < 0.26) { const q = ease(p / 0.26); th = lerp(0, -0.85, q); kn = lerp(0, 1.9, q); ln = lerp(0, 0.3, q); rot = lerp(0, 0.35, q); dip = lerp(0, 0.12, q); }
    else if (p < 0.38) { const q = 1 - Math.pow(1 - (p - 0.26) / 0.12, 3); th = lerp(-0.85, -1.85, q); kn = lerp(1.9, 0.02, q); ln = lerp(0.3, 0.5, q); rot = 0.35; dip = lerp(0.12, 0.2, q); }
    else if (p < 0.62) { const q = ease((p - 0.38) / 0.24); th = lerp(-1.85, -0.9, q); kn = lerp(0.02, 1.7, q); ln = lerp(0.5, 0.3, q); rot = 0.35; dip = 0.2; }
    else { const q = ease((p - 0.62) / 0.38); th = lerp(-0.9, 0, q); kn = lerp(1.7, 0, q); ln = lerp(0.3, 0, q); rot = lerp(0.35, 0, q); dip = lerp(0.2, 0, q); }
    tgt.rTh = th; tgt.rKn = kn; tgt.lTh = 0.16; tgt.lKn = 0.3 + dip;
    tgt.torRotX = -ln; tgt.hipRotY = -rot; tgt.torRotY = rot * 1.2; tgt.torRotZ = rot * 0.25; tgt.pivZ = -ln * 0.12;
    tgt.aUp = -1.45; tgt.aEl = -0.85; tgt.bUp = 0.95; tgt.bEl = -0.7; tgt.aUpZ = 0.85; tgt.bUpZ = -0.85;
    tgt.hipY = 1.7 * S - dip * S; tgt.hipZ = Math.sin(p * Math.PI) * 0.12 * S;
  } else if (act === 'spinKick') {
    if (p < 0.25) { const q = ease(p / 0.25); tgt.hipY = lerp(1.7, 1.4, q) * S; tgt.lKn = 1.2 * q; tgt.rKn = 1.2 * q; tgt.torRotX = 0.3 * q; }
    else if (p < 0.65) { const q = ease((p - 0.25) / 0.15); tgt.rTh = lerp(0.3, -1.6, q); tgt.rKn = 0.1; tgt.lTh = 0.2; tgt.lKn = 0.6; tgt.torRotX = lerp(0.3, -0.4, q); tgt.torRotZ = -0.5 * q; tgt.hipY = 1.85 * S; tgt.aUp = -1.8; tgt.bUp = -1.8; tgt.aUpZ = 1.4; tgt.bUpZ = -1.4; tgt.aEl = -0.4; tgt.bEl = -0.4; }
    else { const q = ease((p - 0.65) / 0.35); tgt.rTh = lerp(-1.6, 0, q); tgt.hipY = lerp(1.5, 1.7, q) * S; tgt.lKn = 0.8 * (1 - q); tgt.torRotX = 0.3 * (1 - q); }
  } else if (act === 'jumpKick') {
    if (p < 0.22) { const q = ease(p / 0.22); tgt.hipY = lerp(1.7, 1.2, q) * S; tgt.lKn = 1.4 * q; tgt.rKn = 1.4 * q; tgt.torRotX = 0.4 * q; tgt.aUp = -1.2 * q; tgt.bUp = -1.2 * q; }
    else if (p < 0.7) { const q = ease((p - 0.22) / 0.2); tgt.rTh = lerp(0.4, -1.9, q); tgt.rKn = lerp(1.4, 0, q); tgt.lTh = lerp(0.2, -0.9, q); tgt.lKn = 1.6; tgt.torRotX = lerp(0.4, -0.5, q); tgt.aUp = 1.0; tgt.bUp = 1.0; tgt.aEl = -1.0; tgt.bEl = -1.0; tgt.aUpZ = 0.6; tgt.bUpZ = -0.6; tgt.hipY = 1.7 * S; tgt.neckRotX = 0.4; }
    else { const q = ease((p - 0.7) / 0.3); tgt.hipY = lerp(1.25, 1.7, q) * S; tgt.lKn = 1.3 * (1 - q); tgt.rKn = 1.3 * (1 - q); tgt.torRotX = 0.5 * (1 - q); }
  } else if (act === 'headX') {
    let ln;
    if (p < 0.5) { const q = ease(p / 0.5); ln = lerp(0, -0.95, q); tgt.hipY = lerp(1.7, 1.35, q) * S; tgt.aUp = 1.4 * q; tgt.bUp = 1.4 * q; tgt.aUpZ = 1.2 * q; tgt.bUpZ = -1.2 * q; tgt.aEl = -1.5; tgt.bEl = -1.5; }
    else if (p < 0.6) { const q = ease((p - 0.5) / 0.1); ln = lerp(-0.95, 1.15, q); tgt.hipY = lerp(1.35, 1.6, q) * S; tgt.aUp = -0.6; tgt.bUp = -0.6; tgt.aEl = -1.9; tgt.bEl = -1.9; tgt.aUpZ = 0.9; tgt.bUpZ = -0.9; }
    else { const q = ease((p - 0.6) / 0.4); ln = lerp(1.15, 0, q); tgt.aUp = lerp(-0.6, -0.15, q); tgt.bUp = lerp(-0.6, -0.15, q); }
    tgt.torRotX = ln; tgt.neckRotX = ln * 0.7; tgt.hipRotX = ln * 0.35;
  } else if (act === 'patate') {
    if (p < 0.42) { const q = ease(p / 0.42); tgt.hipY = lerp(1.7, 1.44, q) * S; tgt.lTh = 0.45 * q; tgt.rTh = 0.45 * q; tgt.torRotX = 0.55 * q; tgt.hipRotY = 0.75 * q; tgt.torRotY = 0.6 * q; tgt.bUp = lerp(-0.15, 1.35, q); tgt.bEl = -1.7; tgt.bUpZ = -0.35; tgt.aUp = -0.9; tgt.aEl = -1.6; tgt.lKn = 1.05 * q; tgt.rKn = 1.05 * q; tgt.neckRotX = 0.4 * q; }
    else if (p < 0.56) { const q = ease((p - 0.42) / 0.14); tgt.hipY = lerp(1.44, 2.35, q) * S; tgt.torRotX = lerp(0.55, -0.45, q); tgt.hipRotY = lerp(0.75, -0.55, q); tgt.torRotY = lerp(0.6, -0.5, q); tgt.bUp = lerp(1.35, -3.0, q); tgt.bEl = -0.05; tgt.aUp = 0.9; tgt.aEl = -1.4; tgt.lTh = -0.6; tgt.rTh = 0.5; tgt.lKn = 0.4; tgt.rKn = 1.2; tgt.neckRotX = -0.6; }
    else { const q = ease((p - 0.56) / 0.44); tgt.hipY = lerp(2.35, 1.7, q) * S; tgt.torRotX = lerp(-0.45, 0, q); tgt.bUp = lerp(-3.0, -0.15, q); tgt.bEl = lerp(-0.05, -0.3, q); tgt.hipRotY = lerp(-0.55, 0, q); tgt.torRotY = lerp(-0.5, 0, q); tgt.lKn = 0.8 * (1 - q); tgt.rKn = 0.8 * (1 - q); }
  } else if (act === 'throw') {
    if (p < 0.4) { const q = ease(p / 0.4); tgt.bUp = lerp(-0.15, 1.6, q); tgt.bEl = -2.1; tgt.bUpZ = -0.5; tgt.hipRotY = 0.7 * q; tgt.torRotY = 0.7 * q; tgt.torRotX = -0.25 * q; tgt.aUp = -1.2; tgt.aEl = -0.4; }
    else if (p < 0.55) { const q = ease((p - 0.4) / 0.15); tgt.bUp = lerp(1.6, -2.3, q); tgt.bEl = lerp(-2.1, -0.15, q); tgt.hipRotY = lerp(0.7, -0.6, q); tgt.torRotY = lerp(0.7, -0.6, q); tgt.torRotX = lerp(-0.25, 0.45, q); tgt.aUp = -0.4; }
    else { const q = ease((p - 0.55) / 0.45); tgt.bUp = lerp(-2.3, -0.15, q); tgt.bEl = lerp(-0.15, -0.3, q); tgt.hipRotY = lerp(-0.6, 0, q); tgt.torRotY = lerp(-0.6, 0, q); tgt.torRotX = lerp(0.45, 0, q); }
  } else if (act === 'uppercut') {
    if (p < 0.34) { const q = ease(p / 0.34); tgt.hipY = lerp(1.7, 1.3, q) * S; tgt.torRotX = 0.4 * q; tgt.hipRotY = 0.6 * q; tgt.torRotY = 0.55 * q; tgt.bUp = lerp(-0.15, 1.1, q); tgt.bEl = -1.9; tgt.aUp = -1.1; tgt.aEl = -1.7; tgt.lKn = 0.9 * q; tgt.rKn = 0.9 * q; }
    else if (p < 0.48) { const q = 1 - Math.pow(1 - (p - 0.34) / 0.14, 3); tgt.hipY = lerp(1.3, 2.1, q) * S; tgt.torRotX = lerp(0.4, -0.55, q); tgt.bUp = lerp(1.1, -2.9, q); tgt.bEl = lerp(-1.9, -0.05, q); tgt.hipRotY = lerp(0.6, -0.5, q); tgt.torRotY = lerp(0.55, -0.45, q); tgt.neckRotX = -0.5; }
    else { const q = ease((p - 0.48) / 0.52); tgt.hipY = lerp(2.1, 1.7, q) * S; tgt.torRotX = lerp(-0.55, 0, q); tgt.bUp = lerp(-2.9, -0.15, q); tgt.bEl = lerp(-0.05, -0.3, q); tgt.hipRotY = lerp(-0.5, 0, q); tgt.torRotY = lerp(-0.45, 0, q); }
  } else if (act === 'sweep') {
    if (p < 0.26) { const q = ease(p / 0.26); tgt.hipY = lerp(1.7, 1.05, q) * S; tgt.torRotX = 0.5 * q; tgt.lKn = 1.9 * q; tgt.lTh = 0.7 * q; tgt.aUp = -1.6 * q; tgt.bUp = -1.6 * q; tgt.aEl = -1.2; tgt.bEl = -1.2; tgt.aUpZ = 0.9; tgt.bUpZ = -0.9; }
    else if (p < 0.5) { const q = 1 - Math.pow(1 - (p - 0.26) / 0.24, 2); tgt.hipY = 1.0 * S; tgt.rTh = lerp(0.3, -1.5, q); tgt.rKn = 0.1; tgt.hipRotY = lerp(0.4, -1.9, q); tgt.torRotY = lerp(0.3, -0.9, q); tgt.torRotX = 0.55; tgt.lKn = 1.9; tgt.lTh = 0.8; }
    else { const q = ease((p - 0.5) / 0.5); tgt.hipY = lerp(1.0, 1.7, q) * S; tgt.rTh = lerp(-1.5, 0, q); tgt.lKn = 1.9 * (1 - q); tgt.lTh = 0.8 * (1 - q); tgt.hipRotY = lerp(-1.9, 0, q); tgt.torRotY = lerp(-0.9, 0, q); tgt.torRotX = 0.55 * (1 - q); }
  } else if (act === 'shoulder') {
    const q = p < 0.3 ? ease(p / 0.3) : 1, r2 = p > 0.55 ? ease((p - 0.55) / 0.45) : 0;
    tgt.torRotX = lerp(0.85, 0.1, r2); tgt.torRotZ = lerp(-0.35, 0, r2); tgt.hipRotY = lerp(0.5, 0, r2);
    tgt.hipY = lerp(1.52, 1.7, r2) * S; tgt.neckRotX = -0.4;
    tgt.aUp = lerp(-1.9 * q, -0.2, r2); tgt.aEl = -1.9; tgt.bUp = lerp(1.2 * q, -0.15, r2); tgt.bEl = -1.4;
    tgt.aUpZ = 0.7; tgt.bUpZ = -0.6; tgt.lTh = -0.7 * q; tgt.rTh = 0.6 * q; tgt.lKn = 0.6; tgt.rKn = 1.0;
  } else if (act === 'diveKick') {
    const q = ease(Math.min(1, p / 0.24));
    tgt.torRotX = lerp(0, 0.75, q); tgt.hipY = 1.5 * S;
    tgt.rTh = lerp(0, -1.75, q); tgt.rKn = lerp(1.2, 0.05, q); tgt.lTh = lerp(0, 0.9, q); tgt.lKn = 1.7;
    tgt.aUp = -1.9; tgt.bUp = -1.9; tgt.aEl = -1.1; tgt.bEl = -1.1; tgt.aUpZ = 1.1; tgt.bUpZ = -1.1; tgt.neckRotX = -0.3;
  } else if (act === 'grab') {
    const q = ease(p); tgt.aUp = lerp(-0.15, -2.2, q); tgt.bUp = lerp(-0.15, -2.2, q); tgt.aEl = -0.5; tgt.bEl = -0.5;
    tgt.aUpZ = 0.55; tgt.bUpZ = -0.55; tgt.hipY = lerp(1.7, 1.52, q) * S; tgt.torRotX = 0.25 * q;
  } else if (act === 'throwMan') {
    const q = ease(p); tgt.aUp = lerp(-2.3, -0.4, q); tgt.bUp = lerp(-2.3, -0.4, q); tgt.aEl = -0.3; tgt.bEl = -0.3;
    tgt.torRotX = lerp(-0.3, 0.5, q); tgt.hipY = 1.66 * S; tgt.aUpZ = 0.4; tgt.bUpZ = -0.4;
  } else if (act === 'launched') {
    const q = Math.min(1, p * 2); tgt.pivC = 0.95 * S; tgt.pivX = -0.75 * q; tgt.aUp = -2.6; tgt.bUp = -2.6; tgt.aUpZ = 1.3; tgt.bUpZ = -1.3; tgt.aEl = -0.6; tgt.bEl = -0.6; tgt.lTh = -0.9; tgt.rTh = 0.6; tgt.lKn = 1.2; tgt.rKn = 0.3; tgt.neckRotX = -0.6; tgt.torRotX = -0.4;
  } else if (act === 'down') {
    tgt.pivC = 0.95 * S; tgt.pivX = -Math.PI / 2; tgt.pivY = -0.35 * S; tgt.aUp = -2.4; tgt.bUp = -1.0; tgt.aUpZ = 0.8; tgt.bUpZ = -1.2; tgt.lTh = 0.3; tgt.rTh = -0.2; tgt.hipY = 1.7 * S; tgt.neckRotX = 0.3;
  } else if (act === 'getup') {
    const q = ease(p); tgt.pivC = 0.95 * S; tgt.pivX = (-Math.PI / 2) * (1 - q); tgt.pivY = -0.35 * S * (1 - q); tgt.lKn = 1.4 * (1 - q); tgt.rKn = 1.4 * (1 - q); tgt.torRotX = 0.6 * (1 - q); tgt.aUp = -1.5 * (1 - q); tgt.bUp = -1.5 * (1 - q);
  } else if (act === 'stun') {
    const s2 = Math.sin(u.t * 5); tgt.torRotZ = s2 * 0.25; tgt.hipRotY = Math.cos(u.t * 3.3) * 0.3; tgt.neckRotY = s2 * 0.5; tgt.neckRotX = 0.3; tgt.aUp = 0.3; tgt.bUp = 0.3; tgt.aEl = -0.2; tgt.bEl = -0.2; tgt.hipY = 1.55 * S;
  } else if (act === 'dodge') {
    let ln, hip, fz, g2;
    if (p < 0.13) { const q = ease(p / 0.13); ln = lerp(0, 0.3, q); hip = lerp(1.7, 1.46, q) * S; fz = 0; g2 = q * 0.25; }
    else if (p < 0.32) { const q = 1 - Math.pow(1 - (p - 0.13) / 0.19, 3); ln = lerp(0.3, 0.85, q); hip = lerp(1.46, 1.34, q) * S; fz = lerp(0, 0.28, q) * S; g2 = lerp(0.25, 1, q); }
    else if (p < 0.6) { ln = 0.85; hip = 1.34 * S; fz = 0.28 * S; g2 = 1; }
    else { const q = ease((p - 0.6) / 0.4); ln = lerp(0.85, 0, q); hip = lerp(1.34, 1.7, q) * S; fz = lerp(0.28, 0, q) * S; g2 = 1 - q; }
    tgt.torRotX = ln; tgt.hipRotX = ln * 0.4; tgt.neckRotX = -ln * 0.8; tgt.hipY = hip; tgt.hipZ = fz;
    tgt.rTh = lerp(0.15, -0.95, g2); tgt.rKn = lerp(0.3, 0.5, g2); tgt.lTh = lerp(-0.15, 0.7, g2); tgt.lKn = lerp(0.3, 1.5, g2);
    tgt.aUp = lerp(-0.2, 1.45, g2); tgt.bUp = lerp(-0.2, 1.3, g2); tgt.aEl = -1.5; tgt.bEl = -1.35; tgt.aUpZ = 0.45; tgt.bUpZ = -0.45;
    tgt.torRotZ = Math.sin(p * Math.PI) * 0.1;
  } else if (act === 'gniac') {
    if (p < 0.45) { const q = ease(p / 0.45); tgt.hipY = lerp(1.7, 1.42, q) * S; tgt.torRotX = lerp(0, -0.5, q); tgt.lTh = 0.5 * q; tgt.rTh = 0.5 * q; tgt.lKn = 1.0 * q; tgt.rKn = 1.0 * q; tgt.aUp = lerp(-0.15, 1.5, q); tgt.bUp = lerp(-0.15, 1.5, q); tgt.aEl = -1.2; tgt.bEl = -1.2; tgt.aUpZ = 1.1; tgt.bUpZ = -1.1; }
    else { const q = ease((p - 0.45) / 0.55); tgt.hipY = lerp(2.2, 1.7, q) * S; tgt.torRotX = lerp(0.9, 0, q); tgt.lTh = 0.4 * (1 - q); tgt.rTh = 0.4 * (1 - q); tgt.lKn = 0.8 * (1 - q); tgt.rKn = 0.8 * (1 - q); tgt.aUp = lerp(-2.6, -0.15, q); tgt.bUp = lerp(-2.6, -0.15, q); tgt.aEl = -0.1; tgt.bEl = -0.1; }
  } else if (act === 'eWind') {
    const q = ease(p); tgt.bUp = lerp(-0.15, 1.15, q); tgt.bEl = -1.6; tgt.bUpZ = -0.9; tgt.hipRotY = lerp(0, 0.6, q); tgt.torRotY = lerp(0, 0.7, q); tgt.torRotX = -0.2;
  } else if (act === 'eStrike') {
    const q = ease(p); tgt.bUp = lerp(1.15, -1.8, q); tgt.bEl = lerp(-1.6, -0.1, q); tgt.hipRotY = lerp(0.6, -0.5, q); tgt.torRotY = lerp(0.7, -0.6, q); tgt.torRotX = 0.25;
  } else if (act === 'hurt') {
    const q = Math.sin(p * Math.PI); tgt.torRotX = -0.55 * q; tgt.torRotZ = (st.side || 0) * 0.4 * q; tgt.neckRotX = -0.5 * q; tgt.aUp = -0.15 - 0.7 * q; tgt.bUp = -0.15 - 0.7 * q; tgt.hipY = 1.7 * S - 0.12 * S * q;
  } else if (act === 'die') {
    const q = ease(p); tgt.pivC = 0.95 * S; tgt.pivX = (-Math.PI / 2) * q; tgt.pivY = lerp(0, -0.35 * S, q); tgt.hipY = lerp(1.7, 1.0, q) * S; tgt.aUp = -2.4; tgt.bUp = -2.4; tgt.aUpZ = 0.7; tgt.bUpZ = -0.7;
  }
  const k = 1 - Math.exp(-(act ? 34 : 13) * dt);
  const pc = tgt.pivC || 0;
  H.position.y = lerp(H.position.y, tgt.hipY - pc, k); H.position.z = lerp(H.position.z, tgt.hipZ || 0, k);
  H.rotation.y = lerp(H.rotation.y, tgt.hipRotY, k); H.rotation.x = lerp(H.rotation.x, tgt.hipRotX, k);
  T.rotation.y = lerp(T.rotation.y, tgt.torRotY, k); T.rotation.x = lerp(T.rotation.x, tgt.torRotX, k); T.rotation.z = lerp(T.rotation.z, tgt.torRotZ || 0, k);
  N.rotation.x = lerp(N.rotation.x, tgt.neckRotX, k); N.rotation.y = lerp(N.rotation.y, tgt.neckRotY, k);
  A.up.rotation.x = lerp(A.up.rotation.x, tgt.aUp, k); A.up.rotation.z = lerp(A.up.rotation.z, tgt.aUpZ, k);
  B.up.rotation.x = lerp(B.up.rotation.x, tgt.bUp, k); B.up.rotation.z = lerp(B.up.rotation.z, tgt.bUpZ, k);
  A.fo.rotation.x = lerp(A.fo.rotation.x, tgt.aEl, k); B.fo.rotation.x = lerp(B.fo.rotation.x, tgt.bEl, k);
  L.th.rotation.x = lerp(L.th.rotation.x, tgt.lTh, k); L.sh.rotation.x = lerp(L.sh.rotation.x, tgt.lKn, k);
  R.th.rotation.x = lerp(R.th.rotation.x, tgt.rTh, k); R.sh.rotation.x = lerp(R.sh.rotation.x, tgt.rKn, k);
  const hard = act === 'dodge' || act === 'die' || act === 'down' || act === 'getup' || act === 'launched';
  u.pivot.rotation.x = hard ? tgt.pivX : lerp(u.pivot.rotation.x, tgt.pivX, 1 - Math.exp(-34 * dt));
  const py = pc + tgt.pivY;
  u.pivot.position.y = hard ? py : lerp(u.pivot.position.y, py, 1 - Math.exp(-26 * dt));
  u.pivot.rotation.z = lerp(u.pivot.rotation.z, tgt.pivZ || 0, 1 - Math.exp(-26 * dt));
  if (st.gun) {
    const k2 = 1 - Math.exp(-16 * dt), kick = st.kick || 0;
    B.up.rotation.x = lerp(B.up.rotation.x, -1.35 + kick * 0.5, k2); B.up.rotation.z = lerp(B.up.rotation.z, -0.18, k2);
    B.fo.rotation.x = lerp(B.fo.rotation.x, -0.2, k2);
    A.up.rotation.x = lerp(A.up.rotation.x, -1.2 + kick * 0.35, k2); A.up.rotation.z = lerp(A.up.rotation.z, 0.42, k2);
    A.fo.rotation.x = lerp(A.fo.rotation.x, -0.75, k2);
    T.rotation.y = lerp(T.rotation.y, -0.32, k2); N.rotation.y = lerp(N.rotation.y, 0.22, k2);
    T.rotation.x = lerp(T.rotation.x, 0.06 + kick * 0.22, k2);
  }
  if (st.carry) {
    const k3 = 1 - Math.exp(-14 * dt);
    A.up.rotation.x = lerp(A.up.rotation.x, -2.2, k3); B.up.rotation.x = lerp(B.up.rotation.x, -2.2, k3);
    A.up.rotation.z = lerp(A.up.rotation.z, 0.5, k3); B.up.rotation.z = lerp(B.up.rotation.z, -0.5, k3);
    A.fo.rotation.x = lerp(A.fo.rotation.x, -0.45, k3); B.fo.rotation.x = lerp(B.fo.rotation.x, -0.45, k3);
  }
  if (u.scarf) {
    const sp2 = clamp(sp / 12, 0, 1.4);
    for (let i = 0; i < u.scarf.length; i++) {
      const seg = u.scarf[i], ph = u.t * 7 - i * 0.7;
      seg.rotation.x = lerp(seg.rotation.x, -0.2 - sp2 * (0.5 + i * 0.2) + Math.sin(ph) * 0.09 * (0.4 + sp2), 1 - Math.exp(-14 * dt));
      seg.rotation.z = lerp(seg.rotation.z, Math.sin(ph * 0.8 + i) * 0.13 * (0.3 + sp2), 1 - Math.exp(-12 * dt));
    }
  }
  if (u.blob && u.blob.visible) {
    const air = Math.max(0, st.air || 0), k2 = clamp(1 - air / 3, 0.35, 1);
    u.blob.scale.x = u.blob.scale.z = (u.blobBase ??= u.blob.scale.x) * k2;
    u.blob.material.opacity = 0.8 * k2;
  }
  if (u.weapon.children.length && st.beltSway != null) u.weapon.rotation.x = lerp(u.weapon.rotation.x, st.beltSway, clamp(dt * 8, 0, 1));
}
