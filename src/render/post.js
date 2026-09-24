// Chaîne de post-traitement cinématographique.
//   Rendu (MSAA en Haute) → occlusion ambiante N8AO → [profondeur de champ]
//   → bloom subtil → tone mapping AgX → étalonnage (balance, lift/gain, contraste,
//   saturation, effets de dégâts) → vignette → [SMAA en Moyenne] → grain
// En qualité Basse, rendu direct avec tone mapping du renderer.
import * as THREE from 'three';
import {
  EffectComposer, RenderPass, EffectPass, Effect, BloomEffect, ToneMappingEffect, ToneMappingMode,
  SMAAEffect, SMAAPreset, VignetteEffect, NoiseEffect, BlendFunction, DepthOfFieldEffect, ChromaticAberrationEffect,
} from 'postprocessing';
import { N8AOPostPass } from 'n8ao';
import { renderer, scene, camera, Q } from '../core/renderer.js';
import { ATMO } from './atmosphere.js';

const GRADE_FS = /* glsl */`
uniform float saturation; uniform float contrast; uniform float temperature;
uniform vec3 lift; uniform vec3 gain; uniform float damage; uniform float time;
void mainImage( const in vec4 inputColor, const in vec2 uv, out vec4 outputColor ) {
	vec3 c = inputColor.rgb;
	c *= vec3( 1.0 + temperature, 1.0 + temperature * 0.15, 1.0 - temperature );
	c = c * gain + lift * ( 1.0 - c );
	float l = dot( c, vec3( 0.2126, 0.7152, 0.0722 ) );
	c = mix( vec3( l ), c, saturation * ( 1.0 - damage * 0.55 ) );
	c = max( ( c - 0.18 ) * contrast + 0.18, 0.0 );
	// Blessure : bords rougis qui pulsent
	float v = length( uv - 0.5 ) * 1.4;
	float pulse = 0.75 + 0.25 * sin( time * 6.0 );
	c = mix( c, vec3( 0.35, 0.02, 0.02 ), smoothstep( 0.45, 1.05, v ) * damage * pulse * 0.8 );
	outputColor = vec4( c, inputColor.a );
}`;

class GradeEffect extends Effect {
  constructor() {
    super('GradeEffect', GRADE_FS, {
      blendFunction: BlendFunction.SRC,
      uniforms: new Map([
        ['saturation', new THREE.Uniform(1)], ['contrast', new THREE.Uniform(1)], ['temperature', new THREE.Uniform(0)],
        ['lift', new THREE.Uniform(new THREE.Color(0, 0, 0))], ['gain', new THREE.Uniform(new THREE.Color(1, 1, 1))],
        ['damage', new THREE.Uniform(0)], ['time', new THREE.Uniform(0)],
      ]),
    });
  }
}

let composer = null, ao = null, grade = null, bloom = null, dof = null, dofPass = null, chroma = null;
export const FX = { damage: 0, aberration: 0, dofFocus: 8, dofActive: false, bloomBoost: 0 };

export function buildPipeline() {
  disposePipeline();
  const q = Q();
  if (!q.post) {
    renderer.toneMapping = THREE.AgXToneMapping;
    return;
  }
  renderer.toneMapping = THREE.NoToneMapping;
  composer = new EffectComposer(renderer, { frameBufferType: THREE.HalfFloatType, multisampling: q.msaa });
  composer.addPass(new RenderPass(scene, camera));

  if (q.ao) {
    ao = new N8AOPostPass(scene, camera, window.innerWidth, window.innerHeight);
    ao.setQualityMode(q.ao === 'full' ? 'Medium' : 'Performance');
    Object.assign(ao.configuration, {
      aoRadius: 1.6, distanceFalloff: 0.8, intensity: 2.2, halfRes: q.ao !== 'full', gammaCorrection: false, color: new THREE.Color(0, 0, 0),
    });
    composer.addPass(ao);
  }
  if (q.dof) {
    dof = new DepthOfFieldEffect(camera, { worldFocusDistance: 8, worldFocusRange: 4, bokehScale: 3, resolutionScale: 0.5 });
    dofPass = new EffectPass(camera, dof);
    dofPass.enabled = false;
    composer.addPass(dofPass);
  }
  grade = new GradeEffect();
  const effects = [];
  if (q.bloom) {
    bloom = new BloomEffect({ mipmapBlur: true, luminanceThreshold: 1.0, luminanceSmoothing: 0.25, intensity: 0.45, radius: 0.72 });
    effects.push(bloom);
  }
  effects.push(new ToneMappingEffect({ mode: ToneMappingMode.AGX }));
  effects.push(grade);
  effects.push(new VignetteEffect({ offset: 0.32, darkness: 0.55 }));
  composer.addPass(new EffectPass(camera, ...effects));

  chroma = new ChromaticAberrationEffect({ offset: new THREE.Vector2(0, 0), radialModulation: true, modulationOffset: 0.2 });
  const last = [];
  if (q.smaa) last.push(new SMAAEffect({ preset: SMAAPreset.MEDIUM }));
  else last.push(chroma);
  composer.addPass(new EffectPass(camera, ...last));
  if (q.smaa) composer.addPass(new EffectPass(camera, chroma, ...(q.grain ? [grainEffect()] : [])));
  else if (q.grain) composer.addPass(new EffectPass(camera, grainEffect()));
  resizePipeline(window.innerWidth, window.innerHeight);
}

function grainEffect() {
  const n = new NoiseEffect({ premultiply: true, blendFunction: BlendFunction.SCREEN });
  n.blendMode.opacity.value = 0.18;
  return n;
}

export function resizePipeline(w, h) {
  if (composer) composer.setSize(w, h, false);
  if (ao) ao.setSize(w * renderer.getPixelRatio(), h * renderer.getPixelRatio());
}

function disposePipeline() {
  if (composer) composer.dispose();
  composer = ao = grade = bloom = dof = dofPass = chroma = null;
}

/** Rendu d'une image (dt en secondes réelles pour les animations d'effets). */
export function renderFrame(dt) {
  if (!composer) { renderer.setRenderTarget(null); renderer.render(scene, camera); return; }
  const g = ATMO.grade, u = grade.uniforms;
  u.get('saturation').value = g.saturation;
  u.get('contrast').value = g.contrast;
  u.get('temperature').value = g.temperature;
  u.get('lift').value.copy(g.lift);
  u.get('gain').value.copy(g.gain);
  u.get('damage').value = FX.damage;
  u.get('time').value += dt;
  if (bloom) bloom.intensity = 0.4 + ATMO.night * 0.25 + FX.bloomBoost;
  FX.aberration *= Math.exp(-dt * 7);
  chroma.offset.set(FX.aberration * 0.006, FX.aberration * 0.004);
  if (dofPass) {
    dofPass.enabled = FX.dofActive;
    if (FX.dofActive) { dof.cocMaterial.worldFocusDistance = FX.dofFocus; dof.cocMaterial.worldFocusRange = Math.max(2, FX.dofFocus * 0.35); }
  }
  composer.render(dt);
}
