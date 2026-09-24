// Atmosphère : course du soleil et de la lune (latitude de Lyon), ciel procédural
// (dégradé, halo, nuages, étoiles, lune), panorama de Lyon à l'horizon, lumière
// principale avec ombres stabilisées, brouillard de hauteur, éclairage d'environnement
// (IBL) régénéré depuis le ciel, exposition et étalonnage selon l'heure.
import * as THREE from 'three';
import { scene, camera, renderer, Q } from '../core/renderer.js';
import { clamp, lerp, smooth } from '../core/math.js';
import { GLOBAL } from './globals.js';
import { TEX, assetUrl } from './materials.js';
import { opt } from '../core/state.js';
import { WORLD } from '../world/layout.js';

const LAT = THREE.MathUtils.degToRad(45.76);
const DECL = THREE.MathUtils.degToRad(12);
const DAY_LENGTH = 480; // secondes de jeu pour 24 h

/** État lisible par les autres systèmes (éclairage des fenêtres, lampadaires, audio…). */
export const ATMO = {
  t: 0.735, // heure normalisée (0 = minuit, 0.5 = midi)
  sunDir: new THREE.Vector3(), moonDir: new THREE.Vector3(), sunAlt: 0,
  day: 1, night: 0, dusk: 0, exposure: 1,
  cloud: 0.42, wet: 0,
  grade: { saturation: 1, contrast: 1, temperature: 0, tint: 0, lift: new THREE.Color(0, 0, 0), gain: new THREE.Color(1, 1, 1) },
};

// ─── dégradés de ciel selon l'altitude du soleil (degrés) ───────────────────
// zénith, horizon, sol (sous l'horizon), couleur du soleil (intensité incluse)
const KEYS = [
  { a: -20, zen: 0x03050d, hor: 0x1c1822, gnd: 0x07070a, sun: 0x000000, fog: 0x0f1018 },
  { a: -12, zen: 0x060a1a, hor: 0x1e2034, gnd: 0x0a0a10, sun: 0x000000, fog: 0x141724 },
  { a: -6, zen: 0x121c3d, hor: 0x4b3d5c, gnd: 0x16141c, sun: 0x3a1a18, fog: 0x2a2838 },
  { a: -2, zen: 0x24386a, hor: 0xc76a50, gnd: 0x2a2224, sun: 0xa8452a, fog: 0x6a4a48 },
  { a: 2, zen: 0x33579a, hor: 0xf0a060, gnd: 0x3a3230, sun: 0xff8a40, fog: 0xb07a5c },
  { a: 8, zen: 0x3a68b0, hor: 0xe9c79e, gnd: 0x4a4540, sun: 0xffc27a, fog: 0xb9a48e },
  { a: 20, zen: 0x3571c0, hor: 0xbcd3e6, gnd: 0x55524e, sun: 0xfff0d8, fog: 0xaebfcf },
  { a: 60, zen: 0x2d68ba, hor: 0xb3cde6, gnd: 0x5a5854, sun: 0xfff6e6, fog: 0xa9bdd2 },
];
const _ca = new THREE.Color(), _cb = new THREE.Color();
function keyColor(alt, field, out) {
  let i = 0;
  while (i < KEYS.length - 2 && alt > KEYS[i + 1].a) i++;
  const k0 = KEYS[i], k1 = KEYS[i + 1];
  const t = clamp((alt - k0.a) / (k1.a - k0.a), 0, 1);
  _ca.setHex(k0[field]); _cb.setHex(k1[field]);
  return out.copy(_ca).lerp(_cb, t); // les Color de three sont en linéaire
}

// ─── shaders ────────────────────────────────────────────────────────────────
const SKY_VS = /* glsl */`
varying vec3 vDir;
void main() {
	vDir = position;
	vec4 wp = vec4( cameraPosition + position * 500.0, 1.0 );
	gl_Position = projectionMatrix * viewMatrix * wp;
	gl_Position.z = gl_Position.w; // toujours au plan lointain : jamais coupé
}`;

const SKY_FS = /* glsl */`
uniform vec3 uSunDir; uniform vec3 uMoonDir;
uniform vec3 uZenith; uniform vec3 uHorizon; uniform vec3 uGround; uniform vec3 uSunColor;
uniform vec3 uCloudLit; uniform vec3 uCloudDark;
uniform float uSunDisc; uniform float uSunGlow; uniform float uNight; uniform float uDusk;
uniform float uCloud; uniform float uStars; uniform vec2 uWindT;
uniform float uTime;
uniform sampler2D uNoise;
varying vec3 vDir;
float h13( vec3 p ) { p = fract( p * 0.1031 ); p += dot( p, p.zyx + 31.32 ); return fract( ( p.x + p.y ) * p.z ); }
void main() {
	vec3 d = normalize( vDir );
	float up = d.y;
	float hz = 1.0 - clamp( up, 0.0, 1.0 );
	vec3 sky = mix( uZenith, uHorizon, pow( hz, 5.0 ) );
	sky = mix( sky, uGround, smoothstep( 0.0, 0.18, - up ) );
	float cs = dot( d, uSunDir ), csp = max( cs, 0.0 );
	sky += uSunColor * ( pow( csp, 8.0 ) * 0.3 + pow( csp, 90.0 ) * 0.9 ) * uSunGlow;
	sky += uSunColor * pow( csp, 2.5 ) * pow( hz, 6.0 ) * uDusk * 0.7;
	if ( uStars > 0.01 && up > 0.0 ) {
		vec3 sp = d * 170.0; vec3 cell = floor( sp ); vec3 f = fract( sp ) - 0.5;
		float hs = h13( cell );
		if ( hs > 0.982 ) {
			vec3 off = ( vec3( h13( cell + 1.3 ), h13( cell + 2.7 ), h13( cell + 4.1 ) ) - 0.5 ) * 0.6;
			float st = smoothstep( 0.13, 0.0, length( f - off ) );
			float tw = 0.65 + 0.35 * sin( uTime * ( 1.5 + hs * 6.0 ) + hs * 91.0 );
			sky += vec3( 0.85, 0.92, 1.0 ) * st * tw * uStars * smoothstep( 0.02, 0.3, up ) * ( hs - 0.982 ) * 90.0;
		}
	}
	float cm = dot( d, uMoonDir );
	float moonDisc = smoothstep( 0.99955, 0.99972, cm );
	float craters = texture2D( uNoise, d.xy * 9.0 + d.z * 3.0 ).r;
	sky += vec3( 0.85, 0.9, 1.0 ) * ( 0.7 + 0.5 * craters ) * moonDisc * 3.0 * uNight;
	sky += vec3( 0.35, 0.45, 0.7 ) * ( pow( max( cm, 0.0 ), 300.0 ) * 0.5 + pow( max( cm, 0.0 ), 12.0 ) * 0.06 ) * uNight;
	sky += uSunColor * smoothstep( 0.99988, 0.99995, cs ) * uSunDisc;
	if ( up > 0.0 && uCloud > 0.01 ) {
		vec2 cuv = d.xz / ( up + 0.1 ) * 0.22 + uWindT;
		float n = texture2D( uNoise, cuv * 0.5 ).r * 0.55 + texture2D( uNoise, cuv * 1.3 + 0.37 ).g * 0.3 + texture2D( uNoise, cuv * 3.7 + 0.71 ).b * 0.15;
		float dens = smoothstep( 1.0 - uCloud, 1.0 - uCloud + 0.28, n ) * smoothstep( 0.0, 0.18, up );
		vec3 cc = mix( uCloudDark, uCloudLit, smoothstep( 0.3, 0.9, n ) );
		cc += uSunColor * pow( csp, 5.0 ) * ( 1.0 - dens ) * 1.2 * uSunGlow;
		sky = mix( sky, cc, dens * 0.92 );
	}
	gl_FragColor = vec4( sky, 1.0 );
}`;

const PANO_VS = /* glsl */`
varying vec2 vUv;
void main() {
	vUv = uv;
	vec4 wp = vec4( cameraPosition + position * 500.0, 1.0 );
	gl_Position = projectionMatrix * viewMatrix * wp;
	gl_Position.z = gl_Position.w * 0.99999;
}`;
const PANO_FS = /* glsl */`
uniform sampler2D uPano; uniform vec3 uLight; uniform vec3 uHaze; uniform float uHazeAmt; uniform float uNight;
varying vec2 vUv;
float h12( vec2 p ) { vec3 p3 = fract( vec3( p.xyx ) * 0.1031 ); p3 += dot( p3, p3.yzx + 33.33 ); return fract( ( p3.x + p3.y ) * p3.z ); }
void main() {
	vec2 uv = vec2( vUv.x * 4.0, vUv.y );
	vec4 t = texture2D( uPano, uv );
	vec3 c = mix( t.rgb * uLight, uHaze, uHazeAmt );
	// Nuit : la ville s'allume (points chauds épars dans la moitié basse)
	vec2 cell = floor( uv * vec2( 900.0, 160.0 ) );
	float lit = step( 0.965, h12( cell ) ) * smoothstep( 0.65, 0.2, vUv.y ) * t.a;
	c += vec3( 1.0, 0.72, 0.4 ) * lit * uNight * 1.6;
	gl_FragColor = vec4( c, t.a );
}`;

// ─── objets ─────────────────────────────────────────────────────────────────
export const key = new THREE.DirectionalLight(0xffffff, 3); // soleil le jour, lune la nuit
key.name = 'keyLight';
const envScene = new THREE.Scene();
let sky, skyEnv, pano, panoEnv, pmrem, envRT = null;
let lastEnvDir = new THREE.Vector3(9, 9, 9), lastEnvNight = -1, envTimer = 0;

export function initAtmosphere() {
  const skyMat = new THREE.ShaderMaterial({
    vertexShader: SKY_VS, fragmentShader: SKY_FS,
    uniforms: {
      uSunDir: { value: ATMO.sunDir }, uMoonDir: { value: ATMO.moonDir },
      uZenith: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() }, uGround: { value: new THREE.Color() },
      uSunColor: { value: new THREE.Color() }, uCloudLit: { value: new THREE.Color() }, uCloudDark: { value: new THREE.Color() },
      uSunDisc: { value: 20 }, uSunGlow: { value: 1 }, uNight: { value: 0 }, uDusk: { value: 0 },
      uCloud: { value: ATMO.cloud }, uStars: { value: 0 }, uWindT: { value: new THREE.Vector2() },
      uNoise: { value: TEX.macro.map },
    },
    side: THREE.BackSide, depthWrite: false, depthFunc: THREE.LessEqualDepth,
  });
  const skyGeo = new THREE.SphereGeometry(1, 48, 24);
  sky = new THREE.Mesh(skyGeo, skyMat);
  sky.frustumCulled = false;
  sky.renderOrder = 1000; // après les opaques : seuls les pixels vides sont dessinés
  sky.name = 'sky';
  scene.add(sky);
  skyEnv = new THREE.Mesh(skyGeo, skyMat);
  skyEnv.frustumCulled = false;
  envScene.add(skyEnv);

  // Panorama : bandeau de -3° à +10° d'élévation, répété 4 fois (miroir).
  const tLo = Math.tan(THREE.MathUtils.degToRad(-3)), tHi = Math.tan(THREE.MathUtils.degToRad(10));
  const panoGeo = new THREE.CylinderGeometry(1, 1, tHi - tLo, 96, 1, true);
  panoGeo.translate(0, (tHi + tLo) / 2, 0);
  const panoTex = new THREE.TextureLoader().load(assetUrl('textures/lyon-skyline.webp'));
  panoTex.colorSpace = THREE.SRGBColorSpace;
  panoTex.wrapS = THREE.MirroredRepeatWrapping;
  panoTex.anisotropy = 4;
  const panoMat = new THREE.ShaderMaterial({
    vertexShader: PANO_VS, fragmentShader: PANO_FS,
    uniforms: { uPano: { value: panoTex }, uLight: { value: new THREE.Color(1, 1, 1) }, uHaze: { value: new THREE.Color() }, uHazeAmt: { value: 0.35 }, uNight: { value: 0 } },
    side: THREE.BackSide, transparent: true, depthWrite: false, depthFunc: THREE.LessEqualDepth,
  });
  pano = new THREE.Mesh(panoGeo, panoMat);
  pano.frustumCulled = false; pano.renderOrder = 1001; pano.name = 'skyline';
  scene.add(pano);
  panoEnv = new THREE.Mesh(panoGeo, panoMat);
  panoEnv.frustumCulled = false;
  envScene.add(panoEnv);
  // Sol vu dans les reflets : disque neutre sous l'horizon.
  const envGround = new THREE.Mesh(new THREE.CircleGeometry(400, 32), new THREE.MeshBasicMaterial({ color: 0x3a3836 }));
  envGround.rotation.x = -Math.PI / 2; envGround.position.y = -3;
  envGround.name = 'envGround';
  envScene.add(envGround);

  scene.fog = new THREE.FogExp2(0xaebfcf, 0.0048);
  scene.add(key, key.target);
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.035;
  key.shadow.camera.near = 1;
  key.shadow.camera.far = 400;
  pmrem = new THREE.PMREMGenerator(renderer);
  applyShadowQuality();
  update(0, new THREE.Vector3(WORLD.w / 2, 0, WORLD.h / 2));
  regenerateEnv(true);
}

export function applyShadowQuality() {
  const q = Q();
  key.castShadow = q.shadows;
  renderer.shadowMap.enabled = q.shadows;
  if (key.shadow.map && key.shadow.mapSize.x !== q.shadowSize) { key.shadow.map.dispose(); key.shadow.map = null; }
  key.shadow.mapSize.set(q.shadowSize, q.shadowSize);
  const r = q.shadowRange;
  Object.assign(key.shadow.camera, { left: -r, right: r, top: r, bottom: -r });
  key.shadow.camera.updateProjectionMatrix();
}

// ─── course du soleil ───────────────────────────────────────────────────────
const _axis = new THREE.Vector3(0, Math.sin(LAT), -Math.cos(LAT)).normalize(); // pôle céleste (nord = -z)
/** Direction d'un astre de déclinaison `decl` pour un angle horaire donné (0 = midi). */
function celestial(hourAngle, out, decl = DECL) {
  const a = Math.PI / 2 - LAT + decl; // hauteur au passage au méridien (plein sud, +z)
  return out.set(0, Math.sin(a), Math.cos(a)).applyAxisAngle(_axis, -hourAngle);
}

const _col = new THREE.Color(), _fog = new THREE.Color();
const _snap = new THREE.Vector3(), _lx = new THREE.Vector3(), _ly = new THREE.Vector3();

/**
 * Met à jour l'heure, le ciel, la lumière et le brouillard.
 * @param {number} dt secondes de jeu
 * @param {THREE.Vector3} focus point suivi par l'ombre (le joueur)
 */
export function update(dt, focus) {
  const mode = opt.tod || 'cycle';
  if (mode === 'cycle') ATMO.t = (ATMO.t + dt / DAY_LENGTH) % 1;
  else ATMO.t = lerp(ATMO.t, mode === 'night' ? 0.93 : mode === 'dusk' ? 0.755 : 0.43, clamp(dt * 0.8, 0, 1));
  const H = (ATMO.t - 0.5) * Math.PI * 2;
  celestial(H, ATMO.sunDir);
  celestial(H + Math.PI * 0.92, ATMO.moonDir, -0.18);
  const alt = THREE.MathUtils.radToDeg(Math.asin(ATMO.sunDir.y));
  ATMO.sunAlt = alt;
  ATMO.day = smooth((alt + 4) / 14);
  ATMO.night = 1 - smooth((alt + 12) / 10);
  ATMO.dusk = clamp(1 - Math.abs(alt - 1) / 9, 0, 1);

  const u = sky.material.uniforms;
  keyColor(alt, 'zen', u.uZenith.value);
  keyColor(alt, 'hor', u.uHorizon.value);
  keyColor(alt, 'gnd', u.uGround.value);
  keyColor(alt, 'sun', u.uSunColor.value);
  const cloudy = ATMO.cloud;
  u.uHorizon.value.lerp(_col.setRGB(0.42, 0.44, 0.47).multiplyScalar(ATMO.day * 0.9 + 0.1), cloudy * 0.25);
  u.uCloudLit.value.copy(u.uHorizon.value).lerp(u.uSunColor.value, 0.35).multiplyScalar(1.1);
  u.uCloudDark.value.copy(u.uZenith.value).lerp(u.uGround.value, 0.5).multiplyScalar(0.8);
  if (ATMO.night > 0.5) u.uCloudDark.value.lerp(_col.setRGB(0.07, 0.05, 0.05), ATMO.night * 0.6); // pollution lumineuse
  u.uNight.value = ATMO.night;
  u.uDusk.value = ATMO.dusk;
  u.uStars.value = ATMO.night * (1 - cloudy * 0.8);
  u.uSunDisc.value = alt > -1.5 ? 25 : 0;
  u.uSunGlow.value = clamp((alt + 6) / 6, 0, 1);
  u.uCloud.value = cloudy;
  u.uWindT.value.x += dt * 0.004; u.uWindT.value.y += dt * 0.0015;

  const pu = pano.material.uniforms;
  pu.uLight.value.copy(u.uHorizon.value).lerp(_col.setRGB(1, 1, 1), 0.35).multiplyScalar(0.25 + 0.95 * ATMO.day);
  pu.uHaze.value.copy(u.uHorizon.value);
  pu.uHazeAmt.value = 0.28 + cloudy * 0.2 + ATMO.night * 0.2;
  pu.uNight.value = ATMO.night;

  // Lumière principale : soleil, puis lune sous l'horizon.
  const useMoon = alt < -4;
  const dir = useMoon ? ATMO.moonDir : ATMO.sunDir;
  if (useMoon) {
    key.color.setRGB(0.55, 0.65, 1.0);
    key.intensity = 0.32 * ATMO.night * clamp(ATMO.moonDir.y * 4, 0, 1);
  } else {
    key.color.copy(u.uSunColor.value).multiplyScalar(1 / Math.max(0.001, Math.max(u.uSunColor.value.r, u.uSunColor.value.g, u.uSunColor.value.b)));
    key.intensity = 3.4 * smooth((alt + 1) / 10) * (1 - cloudy * 0.45);
  }
  key.shadow.intensity = useMoon ? 0.6 : clamp(0.35 + alt / 12, 0.35, 1) * (1 - cloudy * 0.35);
  // Ombre stabilisée : caméra d'ombre calée sur la grille de texels.
  const r = Q().shadowRange, texel = (2 * r) / key.shadow.mapSize.x;
  _lx.set(0, 1, 0).cross(dir).normalize(); if (_lx.lengthSq() < 0.01) _lx.set(1, 0, 0);
  _ly.copy(dir).cross(_lx).normalize();
  const px = Math.round(focus.dot(_lx) / texel) * texel, py = Math.round(focus.dot(_ly) / texel) * texel;
  const pz = focus.dot(dir);
  _snap.copy(_lx).multiplyScalar(px).addScaledVector(_ly, py).addScaledVector(dir, pz);
  key.target.position.copy(_snap);
  key.position.copy(_snap).addScaledVector(dir, 180);
  key.target.updateMatrixWorld();

  // Brouillard de hauteur + diffusion vers le soleil.
  keyColor(alt, 'fog', _fog);
  _fog.lerp(u.uHorizon.value, 0.35).lerp(_col.setRGB(0.5, 0.52, 0.55).multiplyScalar(0.2 + ATMO.day * 0.8), cloudy * 0.3);
  scene.fog.color.copy(_fog);
  scene.fog.density = (0.0024 + cloudy * 0.0012 + ATMO.dusk * 0.0008 + ATMO.night * 0.0006 + ATMO.wet * 0.003) * Q().fogDensity;
  GLOBAL.uFogSunDir.value.copy(ATMO.sunDir);
  GLOBAL.uFogSunColor.value.copy(u.uSunColor.value).multiplyScalar(0.55 * u.uSunGlow.value).add(_fog);
  GLOBAL.uNight.value = ATMO.night;
  envGroundColor();

  // Environnement (IBL), exposition et étalonnage.
  scene.environmentIntensity = lerp(1.0, 1.6, ATMO.night);
  ATMO.exposure = lerp(ATMO.exposure, lerp(1.0, 2.1, ATMO.night) + ATMO.dusk * 0.12, clamp(dt * 1.5, 0, 1));
  renderer.toneMappingExposure = ATMO.exposure;
  const g = ATMO.grade;
  g.saturation = 1.05 + ATMO.dusk * 0.12 - ATMO.night * 0.15 - cloudy * 0.1;
  g.contrast = 1.06 + ATMO.dusk * 0.04;
  g.temperature = ATMO.dusk * 0.12 - ATMO.night * 0.1;
  g.lift.setRGB(0.004, 0.006, 0.012).multiplyScalar(1 + ATMO.night * 2);
  g.gain.setRGB(1 + ATMO.dusk * 0.04, 1, 1 - ATMO.dusk * 0.05 + ATMO.night * 0.03);

  envTimer -= dt;
  if (envTimer <= 0) { regenerateEnv(false); envTimer = Q().dynamicEnv ? 1.2 : 6; }
}

function envGroundColor() {
  const g = envScene.getObjectByName('envGround');
  g.material.color.setRGB(0.07, 0.068, 0.065).multiplyScalar(0.15 + key.intensity * 0.35 + ATMO.day * 0.4);
}

/** Régénère la carte d'environnement si le ciel a sensiblement changé. */
export function regenerateEnv(force) {
  const moved = lastEnvDir.distanceTo(ATMO.sunDir) > (Q().dynamicEnv ? 0.012 : 0.05);
  const nightChanged = Math.abs(lastEnvNight - ATMO.night) > 0.04;
  if (!force && !moved && !nightChanged) return;
  lastEnvDir.copy(ATMO.sunDir); lastEnvNight = ATMO.night;
  const prevExposure = renderer.toneMappingExposure;
  const rt = pmrem.fromScene(envScene, 0, 0.5, 900, { size: Q().dynamicEnv ? 128 : 64 });
  renderer.toneMappingExposure = prevExposure;
  const old = envRT;
  envRT = rt;
  scene.environment = rt.texture;
  if (old) old.dispose();
}

/** Nombre d'heures affichable (hh:mm) pour l'interface. */
export function clockText() {
  const m = Math.floor(ATMO.t * 24 * 60);
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}
