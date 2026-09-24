// Uniformes globaux partagés par tous les shaders (temps, vent, humidité, brouillard)
// et remplacement des chunks de brouillard de three.js par un brouillard de hauteur
// avec diffusion vers le soleil (perspective atmosphérique).
import * as THREE from 'three';

export const GLOBAL = {
  uTime: { value: 0 },
  uWind: { value: new THREE.Vector2(0.8, 0.35) },
  uWet: { value: 0 },
  uNight: { value: 0 },
  uFogSunDir: { value: new THREE.Vector3(0, 1, 0) },
  uFogSunColor: { value: new THREE.Color(1, 0.9, 0.7) },
  uFogHeightFalloff: { value: 0.045 },
  uFogBaseY: { value: -2 },
  uFogMax: { value: 0.985 },
};

/** À appeler depuis tout onBeforeCompile personnalisé. */
export function injectGlobals(shader) {
  Object.assign(shader.uniforms, GLOBAL);
}

// Tous les matériaux reçoivent les uniformes globaux (références partagées : une seule
// mise à jour par image suffit).
THREE.Material.prototype.onBeforeCompile = function (shader) { injectGlobals(shader); };

const C = THREE.ShaderChunk;

C.fog_pars_vertex = /* glsl */`
#ifdef USE_FOG
	varying float vFogDepth;
	varying vec3 vFogWorldPos;
#endif
`;

// Position monde reconstruite depuis mvPosition (fonctionne aussi pour sprites et points).
C.fog_vertex = /* glsl */`
#ifdef USE_FOG
	vFogDepth = - mvPosition.z;
	vFogWorldPos = ( vec4( mvPosition.xyz - viewMatrix[ 3 ].xyz, 0.0 ) * viewMatrix ).xyz;
#endif
`;

C.fog_pars_fragment = /* glsl */`
#ifdef USE_FOG
	uniform vec3 fogColor;
	varying float vFogDepth;
	varying vec3 vFogWorldPos;
	uniform vec3 uFogSunDir;
	uniform vec3 uFogSunColor;
	uniform float uFogHeightFalloff;
	uniform float uFogBaseY;
	uniform float uFogMax;
	#ifdef FOG_EXP2
		uniform float fogDensity;
	#else
		uniform float fogNear;
		uniform float fogFar;
	#endif
#endif
`;

// Intégrale analytique d'un brouillard exponentiel en altitude le long du rayon caméra.
C.fog_fragment = /* glsl */`
#ifdef USE_FOG
	vec3 fogRay = vFogWorldPos - cameraPosition;
	float fogDist = length( fogRay );
	#ifdef FOG_EXP2
		float fogK = uFogHeightFalloff;
		float fogH0 = max( cameraPosition.y - uFogBaseY, 0.0 );
		float fogDy = fogRay.y;
		float fogInt = abs( fogDy ) > 0.01
			? ( exp( - fogK * fogH0 ) - exp( - fogK * ( fogH0 + fogDy ) ) ) / ( fogK * fogDy )
			: exp( - fogK * fogH0 );
		float fogFactor = 1.0 - exp( - fogDensity * fogDist * max( fogInt, 0.0 ) );
	#else
		float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
	#endif
	fogFactor = min( fogFactor, uFogMax );
	float fogSun = pow( max( dot( fogRay / max( fogDist, 1e-3 ), uFogSunDir ), 0.0 ), 6.0 );
	gl_FragColor.rgb = mix( gl_FragColor.rgb, mix( fogColor, uFogSunColor, fogSun ), fogFactor );
#endif
`;
