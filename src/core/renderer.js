// Moteur de rendu : renderer WebGL2, scène, caméra, préréglages de qualité,
// détection du GPU et résolution dynamique.
import * as THREE from 'three';
import { settings } from './state.js';

/**
 * Préréglages de qualité. Le nombre de lampes dynamiques et la présence des ombres
 * modifient les shaders : un changement de qualité recompile les matériaux.
 */
export const QUALITY = {
  low: {
    label: 'Basse', dpr: 1, shadows: false, shadowSize: 1024, shadowRange: 26, post: false, ao: false,
    msaa: 0, smaa: false, bloom: false, texSize: 256, fogDensity: 1.0, maxE: 9, parts: 0.45, civils: 6,
    lampLights: 0, dynamicEnv: false, grain: false, dof: false, windowsDetail: false,
  },
  med: {
    label: 'Moyenne', dpr: 1.25, shadows: true, shadowSize: 2048, shadowRange: 38, post: true, ao: 'half',
    msaa: 0, smaa: true, bloom: true, texSize: 512, fogDensity: 1.0, maxE: 13, parts: 0.75, civils: 12,
    lampLights: 4, dynamicEnv: true, grain: true, dof: false, windowsDetail: true,
  },
  high: {
    label: 'Haute', dpr: 1.75, shadows: true, shadowSize: 4096, shadowRange: 55, post: true, ao: 'full',
    msaa: 4, smaa: false, bloom: true, texSize: 1024, fogDensity: 1.0, maxE: 16, parts: 1, civils: 18,
    lampLights: 8, dynamicEnv: true, grain: true, dof: true, windowsDetail: true,
  },
};
export const Q = () => QUALITY[settings.quality];

export const scene = new THREE.Scene();
export const camera = new THREE.PerspectiveCamera(55, 1, 0.2, 900);
camera.position.set(0, 20, 0);
scene.add(camera); // la caméra porte l'AudioListener

export let renderer = null;
export const gpu = { renderer: 'inconnu', tier: 'med', mobile: false, maxAniso: 1 };

export function createRenderer(canvas) {
  renderer = new THREE.WebGLRenderer({
    canvas, antialias: false, powerPreference: 'high-performance', stencil: false, depth: true,
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping; // le tone mapping est fait en post-traitement
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.info.autoReset = false;
  detectGPU();
  return renderer;
}

/** Estime la puissance du GPU pour choisir la qualité de départ. */
function detectGPU() {
  const gl = renderer.getContext();
  const dbg = gl.getExtension('WEBGL_debug_renderer_info');
  const name = (dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)) || '';
  gpu.renderer = name;
  gpu.maxAniso = renderer.capabilities.getMaxAnisotropy();
  gpu.mobile = /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Mac/.test(navigator.userAgent));
  const n = name.toLowerCase();
  let tier = 'med';
  if (/swiftshader|llvmpipe|software|basic render/.test(n)) tier = 'low';
  else if (gpu.mobile) tier = /apple gpu|adreno \(tm\) (7|8)\d\d|mali-g(7|9)\d/.test(n) ? 'med' : 'low';
  else if (/rtx|radeon rx|rx \d{4}|gtx 1(0[6-9]|6)|gtx [2-9]\d{3}|apple m\d|arc a\d/.test(n)) tier = 'high';
  else if (/intel/.test(n) && !/iris xe|arc/.test(n)) tier = 'low';
  const cores = navigator.hardwareConcurrency || 4, mem = navigator.deviceMemory || 8;
  if (tier === 'high' && (cores < 6 || mem < 8)) tier = 'med';
  gpu.tier = tier;
}

export function pixelRatio() {
  return Math.min(window.devicePixelRatio || 1, Q().dpr) * settings.dynScale;
}

const resizeHandlers = new Set();
export function onResize(fn) { resizeHandlers.add(fn); }

export function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setPixelRatio(pixelRatio());
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  for (const fn of resizeHandlers) fn(w, h);
}
window.addEventListener('resize', () => renderer && resize());
window.addEventListener('orientationchange', () => setTimeout(() => renderer && resize(), 200));

/** Libère géométries, matériaux (non partagés) et textures d'un sous-graphe. */
export function disposeTree(root, { materials = true } = {}) {
  root.traverse((o) => {
    if (o.geometry && !o.geometry.userData.shared) o.geometry.dispose();
    if (materials && o.material) {
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) if (!m.userData.shared) m.dispose();
    }
  });
}
