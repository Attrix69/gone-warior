// Shader de façades procédurales (immeubles instanciés).
// Chaque face d'une boîte reçoit des coordonnées métriques (u le long de la façade,
// v depuis le pied) ; le style d'immeuble (aBld.y) décide de la trame des fenêtres,
// des encadrements, persiennes, balcons, vitrines, bandes de verre…

export const FACADE_VERTEX_PARS = /* glsl */`
attribute vec4 aBld;   // x = graine, y = style, z = rez-de-chaussée commercial (0/1), w = dégâts
attribute float aHide;
varying vec2 vFac; varying vec3 vFacInfo; varying vec4 vBld; varying float vHide; varying vec3 vFacN;
`;

export const FACADE_VERTEX = /* glsl */`
	{
		vec3 sc = vec3( length( instanceMatrix[ 0 ].xyz ), length( instanceMatrix[ 1 ].xyz ), length( instanceMatrix[ 2 ].xyz ) );
		bool sideX = abs( normal.x ) > 0.5;
		float fw = sideX ? sc.z : sc.x;
		float fu = ( sideX ? position.z * sign( normal.x ) : - position.x * sign( normal.z ) ) + 0.5;
		vFac = vec2( fu * fw, ( position.y + 0.5 ) * sc.y );
		vFacInfo = vec3( fw, sc.y, step( 0.5, normal.y ) );
		vBld = aBld; vHide = aHide; vFacN = normal;
	}
`;

export const FACADE_FRAGMENT_PARS = /* glsl */`
uniform sampler2D tPlaster; uniform sampler2D tPlasterN; uniform sampler2D tPlasterO;
uniform sampler2D tStone; uniform sampler2D tStoneN; uniform sampler2D tStoneO;
uniform sampler2D tMacro;
uniform float uNight;
varying vec2 vFac; varying vec3 vFacInfo; varying vec4 vBld; varying float vHide; varying vec3 vFacN;
float fHash( vec3 p ) { p = fract( p * 0.1031 ); p += dot( p, p.zyx + 31.32 ); return fract( ( p.x + p.y ) * p.z ); }
float bayer2( vec2 a ) { a = floor( a ); return fract( dot( a, vec2( 0.5, a.y * 0.75 ) ) ); }
float bayer4( vec2 a ) { return bayer2( 0.5 * a ) * 0.25 + bayer2( a ); }
vec3 fPalette( float h ) {
	// couleurs de menuiseries / persiennes lyonnaises
	vec3 a = vec3( 0.36, 0.42, 0.33 ), b = vec3( 0.45, 0.47, 0.48 ), c = vec3( 0.52, 0.36, 0.24 ), d = vec3( 0.30, 0.37, 0.45 ), e = vec3( 0.80, 0.78, 0.72 );
	return h < 0.22 ? a : h < 0.44 ? b : h < 0.62 ? c : h < 0.8 ? d : e;
}
`;

// Calcul complet de la façade : produit fAlb, fRough, fMetal, fAo, fEmis, fBump (hauteur
// pour le relief), fN (normale tangente de l'enduit ou de la pierre).
export const FACADE_MAP = /* glsl */`
	if ( vHide > 0.001 && bayer4( gl_FragCoord.xy ) < vHide ) discard;
	vec2 fc = vFac;
	float fw = vFacInfo.x, fhgt = vFacInfo.y;
	int style = int( vBld.y + 0.5 );
	float seed = vBld.x, dmg = vBld.w;
	float floorH = style == 1 ? 3.0 : style == 2 ? 3.9 : style == 3 ? 3.4 : style == 4 ? 3.8 : 3.2;
	float gfH = style == 1 ? 3.6 : style == 2 ? 4.0 : style == 3 ? 4.6 : style == 4 ? 5.2 : 4.2;
	float bayW = style == 4 ? 1.6 : style == 3 ? 3.4 : style == 1 ? 2.7 : style == 2 ? 3.2 : 3.0;
	float nb = max( 1.0, floor( fw / bayW + 0.5 ) ), bw = fw / nb;
	float bayI = floor( fc.x / bw ), bx = fract( fc.x / bw );
	float above = fc.y - gfH;
	float fl = floor( above / floorH ), fy = fract( above / floorH );
	float corniceY = fhgt - 0.7;
	bool upper = above > 0.0 && fc.y < corniceY - 0.25;
	bool ground = fc.y < gfH;
	float cell = fHash( vec3( seed * 97.0, bayI, fl ) );

	// matières de base
	vec2 puv = fc / 3.0 + seed * 7.0;
	vec3 plA = texture2D( tPlaster, puv ).rgb;
	vec3 plO = texture2D( tPlasterO, puv ).rgb;
	vec3 fN = texture2D( tPlasterN, puv ).xyz * 2.0 - 1.0;
	vec3 wallC = plA * vColor.rgb;
	vec2 suv = fc / 3.0 + seed * 3.0;
	vec3 stA = texture2D( tStone, suv ).rgb * vec3( 0.95, 0.9, 0.82 );
	vec3 stO = texture2D( tStoneO, suv ).rgb;
	vec3 stN = texture2D( tStoneN, suv ).xyz * 2.0 - 1.0;
	float fRough = plO.g, fMetal = 0.0, fAo = plO.r, fBump = 0.0;
	vec3 fAlb = wallC; vec3 fEmis = vec3( 0.0 ); float fGlass = 0.0;
	bool stoneWall = style == 0 || style == 5;
	if ( style == 3 ) { fAlb = mix( vec3( 0.78 ), vColor.rgb, step( 0.72, fHash( vec3( seed, bayI, 3.0 ) ) ) ) * ( 0.9 + 0.1 * plA.r ); fRough = 0.6; }
	if ( style == 4 ) { fAlb = vec3( 0.42, 0.44, 0.46 ) * ( 0.8 + 0.3 * plA.r ); fRough = 0.45; fMetal = 0.5; }

	// ── étages : fenêtres ──
	float wHalfX = ( style == 2 ? 0.25 : style == 3 ? 0.33 : style == 4 ? 0.47 : 0.21 ) * bw;
	float wy0 = style == 4 ? 0.16 : 0.24, wy1 = style == 2 ? 0.92 : style == 4 ? 0.96 : 0.86;
	float xShift = style == 1 ? ( fHash( vec3( seed, bayI, 11.0 ) ) - 0.5 ) * 0.25 * bw : 0.0;
	vec2 wl = vec2( ( bx - 0.5 ) * bw - xShift, ( fy - ( wy0 + wy1 ) * 0.5 ) * floorH );
	vec2 whs = vec2( wHalfX, ( wy1 - wy0 ) * floorH * 0.5 );
	vec2 dq = abs( wl ) - whs;
	float dEdge = max( dq.x, dq.y );
	bool missing = style == 1 && cell < 0.12;
	float inWin = ( upper && ! missing && dEdge < 0.0 ) ? 1.0 : 0.0;
	float frameW = style == 4 ? 0.05 : 0.07;
	float frame = inWin * ( 1.0 - step( frameW, - dEdge ) );
	float mull = inWin * ( style == 4 ? step( abs( wl.x ), 0.03 ) : max( step( abs( wl.x ), 0.03 ), step( abs( wl.y - whs.y * 0.45 ), 0.03 ) ) );
	float glass = inWin * ( 1.0 - max( frame, mull ) );
	float surround = ( stoneWall && upper && ! missing && dEdge >= 0.0 && dEdge < 0.16 ) ? 1.0 : 0.0;
	float sill = ( upper && ! missing && style != 4 && abs( wl.y + whs.y + 0.07 ) < 0.07 && abs( wl.x ) < whs.x + 0.14 ) ? 1.0 : 0.0;
	// persiennes (Vieux Lyon, pentes) : ouvertes de part et d'autre ou fermées
	float shutter = 0.0;
	vec3 shutC = fPalette( fHash( vec3( seed, 5.0, 1.0 ) ) );
	if ( ( style == 1 || style == 2 ) && upper && ! missing ) {
		bool closed = cell > 0.82;
		if ( closed && inWin > 0.5 ) shutter = 1.0;
		if ( ! closed && abs( wl.y ) < whs.y && abs( wl.x ) > whs.x + 0.02 && abs( wl.x ) < whs.x * 2.0 + 0.02 ) shutter = 1.0;
	}
	// balcons filants en fer forgé (haussmannien : 2e et 5e étages)
	float balc = 0.0;
	if ( ( style == 0 || style == 5 ) && above > 0.0 && ( fl == 1.0 || fl == 4.0 ) && fc.y < corniceY ) {
		float by = fy * floorH - wy0 * floorH;
		if ( by > - 0.12 && by < 0.95 ) {
			float bars = step( 0.5, fract( fc.x * 7.0 ) );
			float rail = step( abs( by - 0.9 ), 0.05 ) + step( abs( by + 0.06 ), 0.06 );
			balc = clamp( rail + bars * step( 0.0, by ) * step( by, 0.9 ) * 0.85, 0.0, 1.0 );
		}
	}
	// tours : allèges entre les bandes vitrées
	if ( style == 4 && above > 0.0 && fc.y < corniceY ) {
		float band = step( fy, 0.16 );
		glass = ( 1.0 - band ) * ( 1.0 - step( 0.5 * bw - 0.04, abs( ( bx - 0.5 ) * bw ) ) );
		frame = 1.0 - glass - band;
		inWin = 1.0 - band;
	}

	// ── rez-de-chaussée : vitrines, portes, enseignes ──
	float shop = 0.0, signBand = 0.0, door = 0.0;
	vec3 signC = vec3( 0.0 );
	if ( ground && vBld.z > 0.5 ) {
		float gy = fc.y;
		float sx = abs( ( bx - 0.5 ) * bw );
		float isDoor = step( 0.78, fHash( vec3( seed, bayI, 7.0 ) ) );
		if ( gy > 0.5 && gy < gfH - 1.0 && sx < bw * 0.42 ) { shop = 1.0; door = isDoor; }
		if ( gy > gfH - 0.9 && gy < gfH - 0.35 && sx < bw * 0.46 ) {
			signBand = 1.0;
			signC = fPalette( fHash( vec3( seed, bayI, 9.0 ) ) ) * 0.7 + 0.05;
		}
	} else if ( ground ) {
		// rez-de-chaussée d'habitation : fenêtres barreaudées + porte cochère
		float sx = abs( ( bx - 0.5 ) * bw ), gy = fc.y;
		if ( gy > 1.0 && gy < gfH - 0.8 && sx < bw * 0.2 ) { glass = 1.0; inWin = 1.0; }
		if ( gy > 1.0 && gy < gfH - 0.8 && sx < bw * 0.2 && fract( ( bx - 0.5 ) * bw * 6.0 ) < 0.18 ) { balc = 1.0; glass = 0.0; }
	}
	bool corniceZone = fc.y > corniceY;
	float base = step( fc.y, 0.5 );

	// ── composition ──
	if ( stoneWall && ground ) { fAlb = stA * mix( vec3( 1.0 ), vColor.rgb, 0.3 ); fRough = stO.g; fAo = stO.r; fN = stN; }
	if ( surround > 0.5 || sill > 0.5 || corniceZone ) { fAlb = stA; fRough = stO.g; fAo = stO.r; fN = stN; fBump = 0.03; }
	vec3 frameC = style == 4 ? vec3( 0.12 ) : style == 3 ? vec3( 0.18, 0.19, 0.2 ) : mix( vec3( 0.86, 0.84, 0.78 ), shutC, step( 0.6, fHash( vec3( seed, 2.0, 2.0 ) ) ) );
	if ( frame > 0.5 || mull > 0.5 ) { fAlb = frameC; fRough = 0.45; fMetal = style == 4 ? 0.8 : 0.0; fN = vec3( 0.0, 0.0, 1.0 ); fBump = - 0.05; }
	float lit = step( 0.7 - uNight * 0.12, fHash( vec3( seed * 13.0, bayI, fl + 50.0 ) ) );
	if ( glass > 0.5 ) {
		float curtain = fHash( vec3( seed, bayI, fl + 20.0 ) );
		fAlb = style == 4 ? vec3( 0.05, 0.07, 0.08 ) : vec3( 0.015 ) + vec3( 0.02, 0.018, 0.015 ) * curtain;
		fRough = style == 4 ? 0.06 : 0.04 + curtain * 0.05;
		fMetal = style == 4 ? 0.55 : 0.0;
		fN = vec3( 0.0, 0.0, 1.0 ); fBump = - 0.12; fAo = 1.0; fGlass = 1.0;
		vec3 room = mix( vec3( 1.0, 0.62, 0.3 ), vec3( 0.55, 0.7, 1.0 ), step( 0.88, curtain ) ) * ( 0.55 + 0.45 * curtain );
		if ( style == 4 ) room = vec3( 0.7, 0.82, 1.0 );
		float interior = smoothstep( whs.y, whs.y * 0.2, abs( wl.y ) ) * 0.5 + 0.5;
		fEmis = room * lit * uNight * interior * ( style == 4 ? 0.9 : 1.1 );
		if ( dmg > 0.35 && fHash( vec3( seed, bayI, fl + 70.0 ) ) < dmg ) { fAlb = vec3( 0.01 ); fRough = 0.9; fEmis = vec3( 0.0 ); }
	}
	if ( shutter > 0.5 ) {
		float sw = fwidth( fc.y * 12.0 );
		float slat = mix( smoothstep( 0.35 - sw, 0.35 + sw, fract( fc.y * 12.0 ) ), 0.65, smoothstep( 0.15, 0.5, sw ) );
		fAlb = shutC * ( 0.75 + 0.25 * slat ); fRough = 0.6; fN = vec3( 0.0, ( slat - 0.5 ) * 0.4 * ( 1.0 - smoothstep( 0.15, 0.5, sw ) ), 1.0 ); fBump = 0.02;
	}
	if ( balc > 0.5 ) { fAlb = vec3( 0.03 ); fRough = 0.5; fMetal = 0.6; fN = vec3( 0.0, 0.0, 1.0 ); fBump = 0.06; }
	if ( shop > 0.5 ) {
		float sx = abs( ( bx - 0.5 ) * bw );
		float fr = step( bw * 0.42 - 0.08, sx ) + step( fc.y, 0.58 ) + step( gfH - 1.08, fc.y );
		if ( fr > 0.5 ) { fAlb = vec3( 0.08, 0.085, 0.09 ); fRough = 0.4; fMetal = 0.7; }
		else {
			fAlb = vec3( 0.02 ); fRough = 0.05; fMetal = 0.0; fBump = - 0.08; fGlass = 0.6;
			float open = step( 0.3, fHash( vec3( seed, bayI, 8.0 ) ) );
			fEmis = vec3( 1.0, 0.82, 0.6 ) * open * ( 0.25 + uNight * 2.4 ) * ( 1.0 - door * 0.7 );
		}
		fN = vec3( 0.0, 0.0, 1.0 ); fAo = 1.0;
	}
	if ( signBand > 0.5 ) { fAlb = signC; fRough = 0.5; fEmis = signC * uNight * 2.0; fN = vec3( 0.0, 0.0, 1.0 ); fBump = 0.04; }
	if ( base > 0.5 && shop < 0.5 ) { fAlb = stA * 0.6; fRough = 0.9; }

	// ── vieillissement : coulures sous les appuis, crasse au pied, suie ──
	float streakCol = step( abs( wl.x ), whs.x + 0.1 ) * ( upper ? 1.0 : 0.0 ) * step( dEdge, 1.2 ) * step( wl.y, - whs.y );
	vec4 mac = texture2D( tMacro, vec2( fc.x * 0.05 + seed, fc.y * 0.012 ) );
	float streak = streakCol * smoothstep( 0.45, 0.8, texture2D( tMacro, vec2( fc.x * 0.9 + seed, fc.y * 0.06 ) ).g ) * 0.35;
	float footDirt = 1.0 - smoothstep( 0.0, 2.6, fc.y );
	float soot = smoothstep( fhgt - 4.0, fhgt, fc.y ) * 0.25 + smoothstep( 0.6, 0.85, mac.r ) * 0.2;
	float grime = clamp( streak + footDirt * 0.3 + soot, 0.0, 0.7 ) * ( glass > 0.5 ? 0.3 : 1.0 );
	fAlb *= 1.0 - grime * 0.55;
	fRough = min( 1.0, fRough + grime * 0.1 );
	// dégâts : suie et fissures
	if ( dmg > 0.01 ) {
		float burn = smoothstep( 1.0 - dmg, 1.05 - dmg * 0.6, mac.b );
		fAlb = mix( fAlb, vec3( 0.03, 0.028, 0.025 ), burn * 0.85 );
		fRough = mix( fRough, 0.95, burn );
		fEmis *= 1.0 - burn;
	}
	// occlusion : embrasures, angles, pied de façade
	float reveal = ( inWin > 0.5 && glass > 0.5 ) ? smoothstep( 0.0, 0.25, - dEdge ) * 0.45 + 0.55 : 1.0;
	float corner = smoothstep( 0.0, 0.5, min( fc.x, fw - fc.x ) ) * 0.25 + 0.75;
	fAo *= reveal * corner * mix( 0.7, 1.0, smoothstep( 0.0, 1.2, fc.y ) );
	if ( vFacInfo.z > 0.5 ) { fAlb = vec3( 0.18, 0.17, 0.16 ); fRough = 0.9; fMetal = 0.0; fEmis = vec3( 0.0 ); fBump = 0.0; fN = vec3( 0.0, 0.0, 1.0 ); }
	diffuseColor.rgb = fAlb;
`;

export const FACADE_NORMAL = /* glsl */`
	{
		vec3 N = normalize( vFacN );
		vec3 T = abs( N.y ) > 0.5 ? vec3( 1.0, 0.0, 0.0 ) : normalize( cross( vec3( 0.0, 1.0, 0.0 ), N ) );
		vec3 B = abs( N.y ) > 0.5 ? vec3( 0.0, 0.0, 1.0 ) : vec3( 0.0, 1.0, 0.0 );
		vec3 wN = normalize( T * fN.x + B * fN.y + N * max( fN.z, 0.2 ) );
		normal = normalize( ( viewMatrix * vec4( wN, 0.0 ) ).xyz );
		// relief des embrasures : dérivées écran de la hauteur analytique
		vec2 dH = vec2( dFdx( fBump ), dFdy( fBump ) );
		vec3 vSigmaX = dFdx( - vViewPosition ), vSigmaY = dFdy( - vViewPosition );
		vec3 R1 = cross( vSigmaY, normal ), R2 = cross( normal, vSigmaX );
		float fDet = dot( vSigmaX, R1 );
		vec3 vGrad = sign( fDet ) * ( dH.x * R1 + dH.y * R2 );
		normal = normalize( abs( fDet ) * normal - vGrad * 1.0 );
	}
`;

export const FACADE_AO = /* glsl */`
	float ambientOcclusion = fAo;
	reflectedLight.indirectDiffuse *= ambientOcclusion;
	#if defined( USE_ENVMAP ) && defined( STANDARD )
		float dotNV = saturate( dot( geometryNormal, geometryViewDir ) );
		reflectedLight.indirectSpecular *= computeSpecularOcclusion( dotNV, ambientOcclusion, material.roughness );
	#endif
`;
