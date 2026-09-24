// Génération de textures PBR sur le GPU (une fois au chargement).
// Chaque surface de glsl/surfaces.glsl.js est « cuite » en trois cartes répétables :
//   map (couleur, sRGB) · normalMap (tangente) · ormMap (R = AO, G = rugosité, B = métal)
import * as THREE from 'three';
import NOISE from './glsl/noise.glsl.js';
import { SURF_COMMON, SURFACES } from './glsl/surfaces.glsl.js';

/**
 * tile : taille d'une tuile en mètres (répétition dans le monde)
 * relief : amplitude du relief en mètres (force de la normal map)
 * data : la couleur est une donnée brute (pas de conversion sRGB)
 */
export const SURFACE_DEFS = {
  asphalt: { tile: 4, relief: 0.01 },
  slabs: { tile: 3, relief: 0.016 },
  cobble: { tile: 2, relief: 0.03 },
  plaster: { tile: 3, relief: 0.004 },
  ashlar: { tile: 3, relief: 0.012 },
  tiles: { tile: 3, relief: 0.05 },
  zinc: { tile: 3, relief: 0.01 },
  slate: { tile: 3, relief: 0.012 },
  concrete: { tile: 4, relief: 0.004 },
  grass: { tile: 4, relief: 0.02 },
  gravel: { tile: 2, relief: 0.012 },
  wood: { tile: 2, relief: 0.006 },
  paint: { tile: 2, relief: 0.002 },
  rust: { tile: 2, relief: 0.004 },
  fabric: { tile: 0.5, relief: 0.0015 },
  macro: { tile: 96, relief: 0, data: true },
};

const VS = /* glsl */`varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4( position.xy, 0.0, 1.0 ); }`;

function fragment(name) {
  return /* glsl */`
precision highp float;
uniform int uMode;
uniform float uTexel;
uniform float uStrength;
varying vec2 vUv;
${NOISE}
${SURF_COMMON}
${SURFACES[name]}
void main() {
	vec3 c; float h, r, ao, m;
	surf( vUv, c, h, r, ao, m );
	if ( uMode == 0 ) {
		gl_FragColor = vec4( c, 1.0 );
	} else if ( uMode == 1 ) {
		vec3 t; float hx0, hx1, hy0, hy1, q1, q2, q3;
		surf( fract( vUv + vec2( uTexel, 0.0 ) ), t, hx1, q1, q2, q3 );
		surf( fract( vUv - vec2( uTexel, 0.0 ) ), t, hx0, q1, q2, q3 );
		surf( fract( vUv + vec2( 0.0, uTexel ) ), t, hy1, q1, q2, q3 );
		surf( fract( vUv - vec2( 0.0, uTexel ) ), t, hy0, q1, q2, q3 );
		vec3 n = normalize( vec3( ( hx0 - hx1 ) * uStrength, ( hy0 - hy1 ) * uStrength, 1.0 ) );
		gl_FragColor = vec4( n * 0.5 + 0.5, 1.0 );
	} else {
		gl_FragColor = vec4( ao, r, m, 1.0 );
	}
}`;
}

let quad = null, orthoCam = null, quadScene = null;
function ensureQuad() {
  if (quad) return;
  quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
  quad.frustumCulled = false;
  quadScene = new THREE.Scene();
  quadScene.add(quad);
  orthoCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
}

const RT_OPTS = (srgb, aniso) => ({
  type: THREE.UnsignedByteType, format: THREE.RGBAFormat,
  colorSpace: srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace,
  generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter,
  wrapS: THREE.RepeatWrapping, wrapT: THREE.RepeatWrapping, depthBuffer: false, anisotropy: aniso,
});
const MODES = { map: 0, normalMap: 1, ormMap: 2 };

function bakeMaterial(name, size) {
  const def = SURFACE_DEFS[name];
  const texel = 1 / size;
  const mat = new THREE.ShaderMaterial({
    vertexShader: VS, fragmentShader: fragment(name),
    uniforms: {
      uMode: { value: 0 }, uTexel: { value: texel },
      uStrength: { value: def.relief > 0 ? def.relief / (2 * texel * def.tile) : 0 },
    },
    depthTest: false, depthWrite: false,
  });
  mat.onBeforeCompile = () => {}; // aucun uniforme global nécessaire ici
  return mat;
}

function draw(renderer, mat, mode, rt, layer) {
  ensureQuad();
  quad.material = mat;
  mat.uniforms.uMode.value = MODES[mode];
  renderer.setRenderTarget(rt, layer);
  renderer.render(quadScene, orthoCam);
}

/**
 * Cuit une surface. Renvoie { map, normalMap, ormMap, tile } (textures des render targets).
 * `maps` limite les cartes produites (ex. ['map'] pour les données de variation).
 */
export function bakeSurface(renderer, name, size, { maps = ['map', 'normalMap', 'ormMap'], aniso = 8 } = {}) {
  const def = SURFACE_DEFS[name];
  const mat = bakeMaterial(name, size);
  const out = { tile: def.tile };
  const prev = renderer.getRenderTarget();
  for (const key of maps) {
    const rt = new THREE.WebGLRenderTarget(size, size, RT_OPTS(key === 'map' && !def.data, aniso));
    draw(renderer, mat, key, rt, 0);
    rt.texture.name = `${name}.${key}`;
    rt.texture.userData.shared = true;
    out[key] = rt.texture;
  }
  renderer.setRenderTarget(prev);
  mat.dispose();
  return out;
}

/**
 * Cuit plusieurs surfaces dans des tableaux de textures (sampler2DArray) : une couche
 * par surface. Permet de mélanger de nombreux matériaux dans un seul shader.
 */
export function bakeSurfaceArray(renderer, names, size, { aniso = 8 } = {}) {
  const out = { names, tiles: names.map((n) => SURFACE_DEFS[n].tile) };
  const prev = renderer.getRenderTarget();
  const targets = {};
  for (const key of Object.keys(MODES)) {
    targets[key] = new THREE.WebGLArrayRenderTarget(size, size, names.length, RT_OPTS(key === 'map', aniso));
  }
  names.forEach((name, layer) => {
    const mat = bakeMaterial(name, size);
    for (const key of Object.keys(MODES)) draw(renderer, mat, key, targets[key], layer);
    mat.dispose();
  });
  for (const key of Object.keys(MODES)) {
    targets[key].texture.userData.shared = true;
    out[key] = targets[key].texture;
  }
  renderer.setRenderTarget(prev);
  return out;
}
