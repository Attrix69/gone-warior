// Bibliothèque de matériaux PBR partagés.
// - surfaces procédurales cuites sur le GPU (texgen.js)
// - matériau triplanaire : échelle de texture constante (en mètres) sur n'importe quelle forme
// - cache de matériaux unis (couleur + finition), partagés par tous les objets
import * as THREE from 'three';
import { bakeSurface, bakeSurfaceArray, SURFACE_DEFS } from './texgen.js';
import { patchMaterial } from './shaderPatch.js';

export const TEX = {};
export const MAT = {};
let normalsLoaded = null;

const shared = (m) => { m.userData.shared = true; return m; };

// ─── matériau triplanaire ───────────────────────────────────────────────────
const TRI_VERTEX_PARS = /* glsl */`varying vec3 vTriPos; varying vec3 vTriNrm;
#ifndef TRI_WORLD
	varying vec3 vTriBX; varying vec3 vTriBY; varying vec3 vTriBZ;
#endif
`;
// Fondu d'occultation tramé : attribut aHide (0 = visible, 1 = masqué). Un maillage sans
// cet attribut lit 0 et reste donc visible.
const FADE_VERTEX_PARS = /* glsl */`
attribute float aHide; varying float vHide;
`;
const FADE_FRAGMENT_PARS = /* glsl */`
varying float vHide;
float bayer2( vec2 a ) { a = floor( a ); return fract( dot( a, vec2( 0.5, a.y * 0.75 ) ) ); }
float bayer4( vec2 a ) { return bayer2( 0.5 * a ) * 0.25 + bayer2( a ); }
`;
export const FADE_DISCARD = /* glsl */`if ( vHide > 0.001 && bayer4( gl_FragCoord.xy ) < vHide ) discard;`;
const TRI_VERTEX_MAIN = /* glsl */`
	{
		vec4 tp = vec4( transformed, 1.0 );
		vec3 tn = objectNormal;
		#ifdef TRI_WORLD
			#ifdef USE_BATCHING
				tp = batchingMatrix * tp; tn = mat3( batchingMatrix ) * tn;
			#endif
			#ifdef USE_INSTANCING
				tp = instanceMatrix * tp; tn = mat3( instanceMatrix ) * tn;
			#endif
			tp = modelMatrix * tp; tn = mat3( modelMatrix ) * tn;
		#endif
		vTriPos = tp.xyz; vTriNrm = tn;
		#ifndef TRI_WORLD
			// base objet → vue (rotation d'instance comprise) pour la normale perturbée
			mat3 toView = normalMatrix;
			#ifdef USE_INSTANCING
				toView = normalMatrix * mat3( instanceMatrix );
			#endif
			vTriBX = normalize( toView * vec3( 1.0, 0.0, 0.0 ) );
			vTriBY = normalize( toView * vec3( 0.0, 1.0, 0.0 ) );
			vTriBZ = normalize( toView * vec3( 0.0, 0.0, 1.0 ) );
		#endif
	}`;
const TRI_FRAGMENT_PARS = /* glsl */`
uniform sampler2D triMap; uniform sampler2D triNormal; uniform sampler2D triOrm;
uniform float triTile; uniform float triNormalScale; uniform float triAo;
varying vec3 vTriPos; varying vec3 vTriNrm;
#ifndef TRI_WORLD
	varying vec3 vTriBX; varying vec3 vTriBY; varying vec3 vTriBZ;
#endif
`;
const TRI_MAP = /* glsl */`
	vec3 triN = normalize( vTriNrm );
	vec3 triW = pow( abs( triN ), vec3( 4.0 ) ); triW /= dot( triW, vec3( 1.0 ) );
	vec3 triP = vTriPos / triTile;
	vec2 tuvX = triP.zy, tuvY = triP.xz, tuvZ = triP.xy;
	vec4 triCol = texture2D( triMap, tuvX ) * triW.x + texture2D( triMap, tuvY ) * triW.y + texture2D( triMap, tuvZ ) * triW.z;
	vec4 triOrmS = texture2D( triOrm, tuvX ) * triW.x + texture2D( triOrm, tuvY ) * triW.y + texture2D( triOrm, tuvZ ) * triW.z;
	diffuseColor.rgb *= triCol.rgb;
`;
const TRI_NORMAL = /* glsl */`
	{
		vec3 tnX = texture2D( triNormal, tuvX ).xyz * 2.0 - 1.0;
		vec3 tnY = texture2D( triNormal, tuvY ).xyz * 2.0 - 1.0;
		vec3 tnZ = texture2D( triNormal, tuvZ ).xyz * 2.0 - 1.0;
		tnX.xy *= triNormalScale; tnY.xy *= triNormalScale; tnZ.xy *= triNormalScale;
		vec3 nX = vec3( tnX.xy + triN.zy, triN.x );
		vec3 nY = vec3( tnY.xy + triN.xz, triN.y );
		vec3 nZ = vec3( tnZ.xy + triN.xy, triN.z );
		vec3 wN = normalize( nX.zyx * triW.x + nY.xzy * triW.y + nZ.xyz * triW.z );
		#ifdef TRI_WORLD
			normal = normalize( ( viewMatrix * vec4( wN, 0.0 ) ).xyz );
		#else
			normal = normalize( vTriBX * wN.x + vTriBY * wN.y + vTriBZ * wN.z );
		#endif
	}
`;
const TRI_AO = /* glsl */`
	float ambientOcclusion = mix( 1.0, triOrmS.r, triAo );
	reflectedLight.indirectDiffuse *= ambientOcclusion;
	#if defined( USE_ENVMAP ) && defined( STANDARD )
		float dotNV = saturate( dot( geometryNormal, geometryViewDir ) );
		reflectedLight.indirectSpecular *= computeSpecularOcclusion( dotNV, ambientOcclusion, material.roughness );
	#endif
`;

/**
 * Matériau PBR triplanaire.
 * @param {string} surface  nom de surface (texgen)
 * @param {object} o  color, roughness, metalness, tile (m), normalScale, ao, space ('world'|'object'),
 *                    useMetal (lire la métallicité de la texture), physical (MeshPhysicalMaterial),
 *                    fade (fondu d'occultation via l'attribut aHide)
 */
export function triMat(surface, o = {}) {
  const set = TEX[surface];
  const Ctor = o.physical ? THREE.MeshPhysicalMaterial : THREE.MeshStandardMaterial;
  const m = new Ctor({
    color: o.color ?? 0xffffff, roughness: o.roughness ?? 1, metalness: o.metalness ?? 0,
    envMapIntensity: o.envMapIntensity ?? 1, side: o.side ?? THREE.FrontSide,
  });
  if (o.physical) Object.assign(m, o.physical);
  m.defines = { ...(o.space === 'object' ? {} : { TRI_WORLD: '' }) };
  const space = o.space === 'object' ? 'o' : 'w';
  const fade = o.fade ?? true;
  patchMaterial(m, {
    key: `tri:${space}:${o.useMetal ? 1 : 0}:${fade ? 1 : 0}`,
    uniforms: {
      triMap: { value: set.map }, triNormal: { value: set.normalMap }, triOrm: { value: set.ormMap },
      triTile: { value: o.tile ?? SURFACE_DEFS[surface].tile }, triNormalScale: { value: o.normalScale ?? 1 },
      triAo: { value: o.ao ?? 1 },
    },
    vertexPars: TRI_VERTEX_PARS + (fade ? FADE_VERTEX_PARS : ''),
    vertexMain: TRI_VERTEX_MAIN + (fade ? 'vHide = aHide;' : ''),
    fragmentPars: TRI_FRAGMENT_PARS + (fade ? FADE_FRAGMENT_PARS : ''),
    fragment: {
      map_fragment: (fade ? FADE_DISCARD : '') + TRI_MAP,
      roughnessmap_fragment: 'float roughnessFactor = roughness * triOrmS.g;',
      metalnessmap_fragment: o.useMetal ? 'float metalnessFactor = metalness * triOrmS.b;' : 'float metalnessFactor = metalness;',
      normal_fragment_maps: TRI_NORMAL,
      aomap_fragment: TRI_AO,
    },
  });
  return shared(m);
}

// ─── matériaux unis mis en cache ────────────────────────────────────────────
const flatCache = new Map();
/**
 * Matériau uni partagé (clé = couleur + finition). La finition ajoute une micro-normale
 * de peinture pour éviter l'aspect « plastique parfait ».
 * finish : 'matte' | 'paint' | 'metal' | 'plastic' | 'rubber' | 'glass' | 'emissive' | 'fabric' | 'skin'
 */
export function flat(hex, finish = 'matte', extra = {}) {
  const key = `${hex}|${finish}|${JSON.stringify(extra)}`;
  let m = flatCache.get(key);
  if (m) return m;
  const F = {
    matte: { roughness: 0.85, metalness: 0 },
    paint: { roughness: 0.45, metalness: 0.1 },
    plastic: { roughness: 0.4, metalness: 0 },
    metal: { roughness: 0.32, metalness: 0.95 },
    rubber: { roughness: 0.92, metalness: 0 },
    glass: { roughness: 0.04, metalness: 0.0 },
    emissive: { roughness: 0.6, metalness: 0 },
    fabric: { roughness: 0.92, metalness: 0 },
    skin: { roughness: 0.55, metalness: 0 },
  }[finish];
  if (finish === 'glass') {
    m = new THREE.MeshPhysicalMaterial({ color: hex, ...F, ior: 1.5, specularIntensity: 1, envMapIntensity: 1.6, ...extra });
  } else if (finish === 'fabric') {
    // tissu : reflet rasant (sheen) et trame
    m = new THREE.MeshPhysicalMaterial({ color: hex, ...F, sheen: 0.6, sheenRoughness: 0.7, sheenColor: new THREE.Color(hex).lerp(new THREE.Color(1, 1, 1), 0.4), ...extra });
    if (TEX.fabricNormal) { m.normalMap = TEX.fabricNormal; m.normalScale = new THREE.Vector2(0.5, 0.5); }
  } else if (finish === 'skin') {
    m = new THREE.MeshPhysicalMaterial({ color: hex, ...F, sheen: 0.25, sheenRoughness: 0.5, sheenColor: new THREE.Color(0.9, 0.6, 0.5), ...extra });
    if (TEX.skinNormal) { m.normalMap = TEX.skinNormal; m.normalScale = new THREE.Vector2(0.15, 0.15); }
  } else {
    m = new THREE.MeshStandardMaterial({ color: hex, ...F, ...extra });
    if (finish === 'emissive') { m.emissive = new THREE.Color(hex); m.emissiveIntensity = extra.emissiveIntensity ?? 3; }
    if (TEX.paint && (finish === 'paint' || finish === 'metal' || finish === 'plastic')) {
      m.normalMap = TEX.paint.normalMap; m.normalScale = new THREE.Vector2(0.6, 0.6);
      m.roughnessMap = TEX.paint.ormMap;
    }
  }
  flatCache.set(key, shared(m));
  return m;
}

/** Peinture carrosserie (vernis) partagée par couleur. */
const carCache = new Map();
export function carPaint(hex) {
  let m = carCache.get(hex);
  if (!m) {
    m = shared(new THREE.MeshPhysicalMaterial({
      color: hex, roughness: 0.38, metalness: 0.55, clearcoat: 1, clearcoatRoughness: 0.08, envMapIntensity: 1.2,
    }));
    if (TEX.paint) { m.normalMap = TEX.paint.normalMap; m.normalScale = new THREE.Vector2(0.3, 0.3); }
    carCache.set(hex, m);
  }
  return m;
}

function loadTexture(url, srgb = false) {
  return new Promise((resolve) => {
    new THREE.TextureLoader().load(url, (t) => {
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      t.anisotropy = 8;
      t.userData.shared = true;
      resolve(t);
    }, undefined, () => resolve(null));
  });
}

const BASE = import.meta.env.BASE_URL;
export function assetUrl(p) { return `${BASE}assets/${p}`; }

/** Cuisson des surfaces + création des matériaux de base. */
export async function initMaterials(renderer, texSize, onStep = () => {}) {
  const aniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const names = ['asphalt', 'slabs', 'cobble', 'plaster', 'ashlar', 'tiles', 'zinc', 'slate', 'concrete', 'grass', 'gravel', 'wood', 'paint', 'rust', 'fabric'];
  const ground = ['asphalt', 'slabs', 'cobble', 'grass', 'gravel'];
  const groundOnly = ['asphalt', 'slabs', 'cobble', 'gravel'];
  for (const n of names) {
    if (groundOnly.includes(n)) continue;
    TEX[n] = bakeSurface(renderer, n, n === 'fabric' || n === 'paint' || n === 'rust' ? Math.min(texSize, 512) : texSize, { aniso });
    onStep(`Matière : ${n}`);
    await nextFrame();
  }
  TEX.ground = bakeSurfaceArray(renderer, ground, texSize, { aniso });
  onStep('Matières du sol');
  await nextFrame();
  TEX.macro = bakeSurface(renderer, 'macro', 256, { maps: ['map', 'ormMap'], aniso: 1 });

  normalsLoaded ??= Promise.all([
    loadTexture(assetUrl('textures/normals/water-waves.webp')),
    loadTexture(assetUrl('textures/normals/fabric-weave.webp')),
    loadTexture(assetUrl('textures/normals/skin-pores.webp')),
  ]).then(([water, fabric, skin]) => { TEX.waterNormal = water; TEX.fabricNormal = fabric; TEX.skinNormal = skin; });
  await normalsLoaded;

  // Matériaux d'architecture partagés.
  MAT.stone = triMat('ashlar', { roughness: 1 });
  MAT.stoneWarm = triMat('ashlar', { color: 0xf2dcc0, roughness: 1 });
  MAT.stoneGrey = triMat('ashlar', { color: 0xc9c6c0, roughness: 1 });
  MAT.plaster = triMat('plaster', { color: 0xe8dcc4, roughness: 1, tile: 4 });
  MAT.concrete = triMat('concrete', { roughness: 1 });
  MAT.concreteDark = triMat('concrete', { color: 0x8a8a8c, roughness: 1 });
  MAT.slate = triMat('slate', { roughness: 1, tile: 2.5 });
  MAT.tiles = triMat('tiles', { roughness: 1, tile: 2.5 });
  MAT.zinc = triMat('zinc', { roughness: 1, metalness: 1, useMetal: true, tile: 2.5 });
  MAT.wood = triMat('wood', { roughness: 1, tile: 1.6 });
  MAT.woodObj = triMat('wood', { roughness: 1, tile: 1.2, space: 'object' });
  MAT.rust = triMat('rust', { roughness: 1, metalness: 1, useMetal: true });
  MAT.metalDark = flat(0x2a2d33, 'metal', { roughness: 0.45 });
  MAT.iron = flat(0x1f2124, 'paint', { roughness: 0.55, metalness: 0.6 });
  MAT.steel = flat(0x9aa1ad, 'metal', { roughness: 0.3 });
  MAT.gold = flat(0xd9b24a, 'metal', { roughness: 0.28 });
  MAT.bronze = flat(0x4f5a48, 'metal', { roughness: 0.5, metalness: 0.85 });
  MAT.glass = flat(0x0e1418, 'glass');
  MAT.glassBlue = flat(0x5a7f9f, 'glass', { roughness: 0.08 });
  MAT.rubber = flat(0x151619, 'rubber');
  MAT.lampGlow = flat(0xffd9a0, 'emissive', { emissiveIntensity: 0 });
  MAT.redLight = flat(0xff3020, 'emissive', { emissiveIntensity: 1.5 });
  MAT.headLight = flat(0xfff2d8, 'emissive', { emissiveIntensity: 0.4 });
}

export const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));
