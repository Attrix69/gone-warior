// Bibliothèque de bruit GLSL. Toutes les fonctions suffixées « P » sont périodiques
// (période exprimée en cellules) afin de produire des textures répétables sans raccord.
export default /* glsl */`
float hash12( vec2 p ) {
	vec3 p3 = fract( vec3( p.xyx ) * 0.1031 );
	p3 += dot( p3, p3.yzx + 33.33 );
	return fract( ( p3.x + p3.y ) * p3.z );
}
vec2 hash22( vec2 p ) {
	vec3 p3 = fract( vec3( p.xyx ) * vec3( 0.1031, 0.1030, 0.0973 ) );
	p3 += dot( p3, p3.yzx + 33.33 );
	return fract( ( p3.xx + p3.yz ) * p3.zy );
}
vec3 hash32( vec2 p ) {
	vec3 p3 = fract( vec3( p.xyx ) * vec3( 0.1031, 0.1030, 0.0973 ) );
	p3 += dot( p3, p3.yxz + 33.33 );
	return fract( ( p3.xxy + p3.yzz ) * p3.zyx );
}

// Bruit de gradient périodique, résultat dans [0,1].
float gnoiseP( vec2 p, vec2 per ) {
	vec2 i = floor( p ), f = fract( p );
	vec2 u = f * f * f * ( f * ( f * 6.0 - 15.0 ) + 10.0 );
	vec2 ga = hash22( mod( i, per ) ) * 2.0 - 1.0;
	vec2 gb = hash22( mod( i + vec2( 1.0, 0.0 ), per ) ) * 2.0 - 1.0;
	vec2 gc = hash22( mod( i + vec2( 0.0, 1.0 ), per ) ) * 2.0 - 1.0;
	vec2 gd = hash22( mod( i + vec2( 1.0, 1.0 ), per ) ) * 2.0 - 1.0;
	float va = dot( ga, f ), vb = dot( gb, f - vec2( 1.0, 0.0 ) );
	float vc = dot( gc, f - vec2( 0.0, 1.0 ) ), vd = dot( gd, f - vec2( 1.0, 1.0 ) );
	return 0.5 + 0.7 * mix( mix( va, vb, u.x ), mix( vc, vd, u.x ), u.y );
}

// Somme fractale périodique : uv dans [0,1), freq = nombre de cellules par tuile.
float fbmP( vec2 uv, float freq, int oct, float gain ) {
	float s = 0.0, a = 0.5, n = 0.0;
	vec2 per = vec2( freq );
	for ( int i = 0; i < 8; i ++ ) {
		if ( i >= oct ) break;
		s += a * gnoiseP( uv * per, per );
		n += a; a *= gain; per *= 2.0;
	}
	return s / n;
}

// Bruit « crêtes » (fissures, veines).
float ridgeP( vec2 uv, float freq, int oct ) {
	float s = 0.0, a = 0.5, n = 0.0;
	vec2 per = vec2( freq );
	for ( int i = 0; i < 6; i ++ ) {
		if ( i >= oct ) break;
		float v = 1.0 - abs( gnoiseP( uv * per, per ) * 2.0 - 1.0 );
		s += a * v * v; n += a; a *= 0.5; per *= 2.0;
	}
	return s / n;
}

// Voronoï périodique : x = distance au centre, y = distance à la bordure, z = identifiant.
vec3 voronoiP( vec2 uv, float freq, float jitter ) {
	vec2 p = uv * freq, n = floor( p ), f = fract( p ), per = vec2( freq );
	vec2 mg, mr; float md = 8.0;
	for ( int j = - 1; j <= 1; j ++ ) for ( int i = - 1; i <= 1; i ++ ) {
		vec2 g = vec2( float( i ), float( j ) );
		vec2 o = 0.5 + ( hash22( mod( n + g, per ) ) - 0.5 ) * jitter;
		vec2 r = g + o - f; float d = dot( r, r );
		if ( d < md ) { md = d; mr = r; mg = g; }
	}
	float ed = 8.0;
	for ( int j = - 2; j <= 2; j ++ ) for ( int i = - 2; i <= 2; i ++ ) {
		vec2 g = mg + vec2( float( i ), float( j ) );
		vec2 o = 0.5 + ( hash22( mod( n + g, per ) ) - 0.5 ) * jitter;
		vec2 r = g + o - f;
		if ( dot( mr - r, mr - r ) > 0.00001 ) ed = min( ed, dot( 0.5 * ( mr + r ), normalize( r - mr ) ) );
	}
	return vec3( sqrt( md ), ed, hash12( mod( n + mg, per ) ) );
}

// Pavage rectangulaire décalé (briques, dalles, pierres de taille).
// Renvoie xy = position locale dans la pièce [0,1], z = distance au bord exprimée en
// hauteur de pièce, w = identifiant aléatoire de la pièce.
vec4 bondP( vec2 uv, vec2 count, float offset ) {
	vec2 p = uv * count;
	float row = floor( p.y );
	p.x += mod( row, 2.0 ) * offset;
	vec2 cell = floor( p ), f = fract( p );
	vec2 idc = vec2( mod( cell.x, count.x ), mod( cell.y, count.y ) );
	float edge = min( min( f.x, 1.0 - f.x ) * count.y / count.x, min( f.y, 1.0 - f.y ) );
	return vec4( f, edge, hash12( idc + 17.0 ) );
}
`;
