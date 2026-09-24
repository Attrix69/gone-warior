// Météo : alternance dégagé / nuageux / pluie (ou forcée par l'option), pluie en
// traînées animées sur le GPU autour de la caméra, humidité du sol (flaques).
import * as THREE from 'three';
import { scene, camera } from '../core/renderer.js';
import { opt, settings } from '../core/state.js';
import { clamp, lerp, rnd } from '../core/math.js';
import { GLOBAL } from '../render/globals.js';
import { ATMO } from '../render/atmosphere.js';

const W = { rain: 0, rainTarget: 0, cloudTarget: 0.42, timer: 90, state: 'cloudy' };
export const weather = W;
let rainMesh = null;

const RAIN_VS = /* glsl */`
attribute vec4 aSeed;
uniform float uTime; uniform vec3 uCam; uniform float uBox; uniform float uHeight; uniform vec2 uWind;
varying float vFade;
void main() {
	float fall = 11.0 + aSeed.w * 4.0;
	vec3 base;
	base.xz = uCam.xz + ( fract( ( aSeed.xz * uBox - uCam.xz ) / uBox + 0.5 ) - 0.5 ) * uBox;
	base.y = uCam.y - uHeight * 0.4 + fract( aSeed.y - uTime * fall / uHeight ) * uHeight;
	vec3 toCam = normalize( vec3( uCam.x - base.x, 0.0, uCam.z - base.z ) + 1e-4 );
	vec3 side = normalize( cross( vec3( 0.0, 1.0, 0.0 ), toCam ) );
	vec3 wp = base + side * position.x * 0.012 + vec3( uWind.x, 1.0, uWind.y ) * position.y * 0.55;
	vec4 mv = viewMatrix * vec4( wp, 1.0 );
	float dCam = length( base - uCam );
	// les gouttes trop proches de l'objectif deviennent de longs traits : on les efface
	vFade = smoothstep( uBox * 0.5, uBox * 0.15, length( base.xz - uCam.xz ) ) * smoothstep( 1.5, 5.0, dCam );
	gl_Position = projectionMatrix * mv;
}`;
const RAIN_FS = /* glsl */`
uniform vec3 uColor; uniform float uIntensity;
varying float vFade;
void main() { gl_FragColor = vec4( uColor * uIntensity * vFade, 1.0 ); }`;

export function buildWeather() {
  const n = { low: 1600, med: 4200, high: 7000 }[settings.quality];
  const g = new THREE.InstancedBufferGeometry();
  const base = new THREE.PlaneGeometry(1, 1).translate(0, 0.5, 0);
  g.index = base.index; g.attributes.position = base.attributes.position;
  const seeds = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) { seeds[i * 4] = Math.random(); seeds[i * 4 + 1] = Math.random(); seeds[i * 4 + 2] = Math.random(); seeds[i * 4 + 3] = Math.random(); }
  g.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 4));
  g.instanceCount = n;
  const m = new THREE.ShaderMaterial({
    vertexShader: RAIN_VS, fragmentShader: RAIN_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: GLOBAL.uTime, uCam: { value: new THREE.Vector3() }, uBox: { value: 36 }, uHeight: { value: 18 }, uWind: { value: new THREE.Vector2(0.12, 0.05) },
      uColor: { value: new THREE.Color(0.6, 0.65, 0.72) }, uIntensity: { value: 0 },
    },
  });
  rainMesh = new THREE.Mesh(g, m);
  rainMesh.frustumCulled = false;
  rainMesh.renderOrder = 8;
  rainMesh.visible = false;
  scene.add(rainMesh);
}

function pickAuto() {
  const r = Math.random();
  W.state = r < 0.45 ? 'clear' : r < 0.78 ? 'cloudy' : 'rain';
  W.timer = rnd(120, 240);
}

export function updateWeather(dt) {
  const mode = opt.weather || 'auto';
  if (mode === 'auto') { W.timer -= dt; if (W.timer <= 0) pickAuto(); } else W.state = mode;
  W.cloudTarget = W.state === 'clear' ? 0.18 : W.state === 'cloudy' ? 0.62 : 0.92;
  W.rainTarget = W.state === 'rain' ? 1 : 0;
  ATMO.cloud = lerp(ATMO.cloud, W.cloudTarget, clamp(dt * 0.08, 0, 1));
  W.rain = lerp(W.rain, W.rainTarget * clamp((ATMO.cloud - 0.6) / 0.3, 0, 1), clamp(dt * 0.3, 0, 1));
  // le sol se mouille sous la pluie et sèche lentement
  ATMO.wet = clamp(ATMO.wet + (W.rain > 0.3 ? dt / 25 : -dt / 90), 0, 1);
  GLOBAL.uWet.value = ATMO.wet;
  if (rainMesh) {
    rainMesh.visible = W.rain > 0.02;
    const u = rainMesh.material.uniforms;
    u.uCam.value.copy(camera.position);
    u.uIntensity.value = W.rain * (0.22 + ATMO.day * 0.26 + ATMO.night * 0.2);
    u.uColor.value.copy(scene.fog.color).lerp(new THREE.Color(0.75, 0.78, 0.85), 0.5);
  }
}
