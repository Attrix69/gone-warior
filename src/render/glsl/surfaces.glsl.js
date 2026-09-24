// Définitions procédurales des surfaces PBR (une tuile répétable par matériau).
// Chaque fonction produit, pour un uv de la tuile : couleur linéaire, hauteur [0,1],
// rugosité, occlusion ambiante et métallicité. Les couleurs sont écrites en sRGB puis
// converties (srgb()) pour rester lisibles.
export const SURF_COMMON = /* glsl */`
vec3 srgb( vec3 c ) { return pow( c, vec3( 2.2 ) ); }
`;

export const SURFACES = {
  asphalt: /* glsl */`
void surf( vec2 uv, out vec3 col, out float h, out float r, out float ao, out float m ) {
	vec3 v = voronoiP( uv, 150.0, 0.95 );
	float stone = smoothstep( 0.03, 0.11, v.y );
	float fine = fbmP( uv, 64.0, 4, 0.55 );
	float macro = fbmP( uv, 3.0, 5, 0.5 );
	vec3 binder = srgb( vec3( 0.15, 0.15, 0.16 ) );
	vec3 agg = srgb( mix( vec3( 0.30, 0.29, 0.28 ), vec3( 0.50, 0.48, 0.45 ), v.z ) );
	col = mix( binder, agg, stone * 0.5 );
	col *= 0.78 + 0.4 * macro;
	float patchMask = 0.0; // rapiéçages : gérés à l'échelle du monde (shader du sol)
	float cr = ridgeP( uv + 0.11, 3.0, 5 );
	float crack = smoothstep( 0.87, 0.95, cr ) * smoothstep( 0.45, 0.62, fbmP( uv + 0.7, 2.0, 3, 0.5 ) ) * ( 1.0 - patchMask );
	col *= 1.0 - crack * 0.65;
	float oil = smoothstep( 0.7, 0.78, fbmP( uv + 0.23, 7.0, 5, 0.6 ) ) * smoothstep( 0.4, 0.6, fbmP( uv + 0.9, 2.0, 3, 0.5 ) );
	col *= 1.0 - oil * 0.3;
	float seal = smoothstep( 0.84, 0.9, cr ) * smoothstep( 0.62, 0.66, fbmP( uv + 0.7, 2.0, 3, 0.5 ) );
	col = mix( col, srgb( vec3( 0.06, 0.06, 0.065 ) ), seal * 0.9 );
	h = 0.45 + stone * 0.25 * ( 0.5 + v.z ) + fine * 0.15 - crack * 0.55 - patchMask * 0.04 + seal * 0.1;
	r = clamp( 0.93 - stone * 0.1 - oil * 0.4 - patchMask * 0.12 - seal * 0.45 + fine * 0.05, 0.3, 1.0 );
	ao = 1.0 - ( 1.0 - stone ) * 0.22 - crack * 0.55;
	m = 0.0;
}`,

  slabs: /* glsl */`
void surf( vec2 uv, out vec3 col, out float h, out float r, out float ao, out float m ) {
	vec4 b = bondP( uv, vec2( 5.0, 7.0 ), 0.5 );
	float joint = 1.0 - smoothstep( 0.008, 0.022, b.z );
	float bevel = smoothstep( 0.0, 0.06, b.z );
	float grain = fbmP( uv, 96.0, 4, 0.6 );
	float macro = fbmP( uv, 4.0, 4, 0.5 );
	vec3 stoneC = srgb( mix( vec3( 0.60, 0.57, 0.52 ), vec3( 0.68, 0.64, 0.58 ), b.w ) ) * ( 0.86 + 0.22 * grain );
	float speck = step( 0.82, hash12( floor( uv * 700.0 ) ) );
	stoneC *= 1.0 - speck * 0.25;
	vec3 dirt = srgb( vec3( 0.24, 0.22, 0.19 ) );
	col = mix( stoneC, dirt, joint * 0.7 );
	col = mix( col, col * 0.68, smoothstep( 0.55, 0.8, macro ) * 0.6 );
	vec3 g = voronoiP( uv, 40.0, 1.0 );
	float gum = ( 1.0 - smoothstep( 0.03, 0.06, g.x ) ) * step( 0.93, g.z );
	col = mix( col, srgb( vec3( 0.22, 0.22, 0.22 ) ), gum * 0.7 );
	float tilt = ( b.x - 0.5 ) * ( hash12( vec2( b.w, 3.0 ) ) - 0.5 ) * 0.25 + ( b.y - 0.5 ) * ( hash12( vec2( b.w, 7.0 ) ) - 0.5 ) * 0.25;
	h = 0.55 * bevel + grain * 0.08 + tilt - joint * 0.12;
	r = clamp( 0.8 + grain * 0.1 - gum * 0.3 + joint * 0.12, 0.3, 1.0 );
	ao = mix( 0.55, 1.0, bevel );
	m = 0.0;
}`,

  cobble: /* glsl */`
void surf( vec2 uv, out vec3 col, out float h, out float r, out float ao, out float m ) {
	// Pavés « Vieux Lyon » : rangées ondulées, largeurs irrégulières, dessus bombé et usé.
	vec2 warp = ( vec2( fbmP( uv, 4.0, 3, 0.5 ), fbmP( uv + 0.5, 4.0, 3, 0.5 ) ) - 0.5 ) * 0.03;
	vec2 p = ( uv + warp ) * vec2( 10.0, 16.0 );
	float row = floor( p.y );
	p.x += hash12( vec2( mod( row, 16.0 ), 5.0 ) ) * 3.0;
	vec2 cell = floor( p ), f = fract( p );
	float id = hash12( vec2( mod( cell.x, 10.0 ), mod( cell.y, 16.0 ) ) );
	vec2 size = vec2( 1.6, 1.0 );
	vec2 q = ( f - 0.5 ) * size + ( hash22( vec2( id * 37.0, 1.0 ) ) - 0.5 ) * 0.1;
	float rc = 0.22 + id * 0.12;
	vec2 hs = size * 0.5 - 0.07 - rc;
	float inside = rc - length( max( abs( q ) - hs, 0.0 ) );
	float e = clamp( inside / 0.3, 0.0, 1.0 );
	float dome = sqrt( e ) * ( 0.85 + 0.15 * hash12( vec2( id, 9.0 ) ) );
	float joint = 1.0 - smoothstep( 0.0, 0.05, inside );
	float grain = fbmP( uv, 64.0, 4, 0.6 );
	vec3 stoneC = srgb( mix( vec3( 0.34, 0.32, 0.30 ), vec3( 0.56, 0.52, 0.47 ), id ) );
	stoneC = mix( stoneC, srgb( vec3( 0.50, 0.41, 0.32 ) ), step( 0.75, hash12( vec2( id * 91.0, 1.0 ) ) ) * 0.6 );
	stoneC *= 0.8 + 0.3 * grain;
	float polish = smoothstep( 0.6, 1.0, dome );
	float moss = smoothstep( 0.5, 0.75, fbmP( uv + 0.3, 6.0, 4, 0.55 ) );
	vec3 jointC = mix( srgb( vec3( 0.16, 0.14, 0.11 ) ), srgb( vec3( 0.17, 0.21, 0.08 ) ), moss * 0.85 );
	col = mix( stoneC * ( 0.88 + 0.18 * polish ), jointC, joint );
	h = dome * 0.85 + grain * 0.06 - joint * 0.12;
	r = mix( mix( 0.9, 0.5, polish ) + grain * 0.08, 0.97, joint );
	ao = mix( 0.3, 1.0, smoothstep( 0.0, 0.35, e ) );
	m = 0.0;
}`,

  plaster: /* glsl */`
void surf( vec2 uv, out vec3 col, out float h, out float r, out float ao, out float m ) {
	float f1 = fbmP( uv, 24.0, 5, 0.55 );
	float f2 = fbmP( uv + 0.3, 5.0, 4, 0.5 );
	float fine = gnoiseP( uv * 300.0, vec2( 300.0 ) );
	col = vec3( 0.8 + 0.2 * ( f1 - 0.5 ) + 0.06 * ( fine - 0.5 ) );
	float patchm = smoothstep( 0.6, 0.62, f2 );
	col *= mix( 1.0, 0.92, patchm );
	float flake = smoothstep( 0.73, 0.75, fbmP( uv + 0.61, 8.0, 5, 0.6 ) );
	col = mix( col, srgb( vec3( 0.62, 0.56, 0.48 ) ), flake * 0.85 );
	float streak = gnoiseP( vec2( uv.x * 60.0, uv.y * 2.0 ), vec2( 60.0, 2.0 ) );
	col *= 1.0 - smoothstep( 0.6, 0.9, streak ) * 0.14;
	h = f1 * 0.5 + fine * 0.12 - flake * 0.35 + patchm * 0.05;
	r = 0.88 + fine * 0.08;
	ao = 1.0 - flake * 0.35;
	m = 0.0;
}`,

  ashlar: /* glsl */`
void surf( vec2 uv, out vec3 col, out float h, out float r, out float ao, out float m ) {
	vec4 b = bondP( uv, vec2( 3.0, 6.0 ), 0.5 );
	float joint = 1.0 - smoothstep( 0.006, 0.02, b.z );
	float bevel = smoothstep( 0.0, 0.05, b.z );
	float grain = fbmP( uv, 48.0, 5, 0.6 );
	float pits = smoothstep( 0.7, 0.76, gnoiseP( uv * 220.0, vec2( 220.0 ) ) );
	vec3 base = srgb( mix( vec3( 0.72, 0.66, 0.55 ), vec3( 0.81, 0.75, 0.63 ), b.w ) );
	base *= 0.85 + 0.25 * grain;
	float soot = smoothstep( 0.5, 0.8, fbmP( uv + 0.2, 3.0, 4, 0.5 ) );
	base = mix( base, base * 0.55, soot * 0.55 );
	col = mix( base, srgb( vec3( 0.45, 0.42, 0.38 ) ), joint );
	h = bevel * 0.6 + grain * 0.15 - pits * 0.12;
	r = 0.82 + grain * 0.1;
	ao = mix( 0.6, 1.0, bevel ) * ( 1.0 - pits * 0.3 );
	m = 0.0;
}`,

  tiles: /* glsl */`
void surf( vec2 uv, out vec3 col, out float h, out float r, out float ao, out float m ) {
	vec2 p = uv * vec2( 12.0, 10.0 );
	float row = floor( p.y );
	p.x += mod( row, 2.0 ) * 0.5;
	vec2 c = floor( p ), f = fract( p );
	float id = hash12( vec2( mod( c.x, 12.0 ), mod( c.y, 10.0 ) ) );
	float curve = sin( f.x * 3.14159 );
	float lap = smoothstep( 0.0, 0.22, f.y );
	vec3 terra = srgb( mix( vec3( 0.60, 0.29, 0.19 ), vec3( 0.74, 0.43, 0.29 ), id ) );
	terra *= 0.8 + 0.3 * fbmP( uv, 32.0, 4, 0.6 );
	float lichen = smoothstep( 0.58, 0.8, fbmP( uv + 0.4, 6.0, 4, 0.55 ) );
	terra = mix( terra, srgb( vec3( 0.46, 0.46, 0.33 ) ), lichen * 0.55 );
	col = terra * ( 0.55 + 0.45 * lap ) * ( 0.75 + 0.25 * curve );
	h = curve * 0.7 * lap + ( 1.0 - f.y ) * 0.25;
	r = 0.76 + lichen * 0.12 + ( 1.0 - curve ) * 0.1;
	ao = mix( 0.4, 1.0, lap ) * mix( 0.65, 1.0, curve );
	m = 0.0;
}`,

  zinc: /* glsl */`
void surf( vec2 uv, out vec3 col, out float h, out float r, out float ao, out float m ) {
	float x = fract( uv.x * 8.0 );
	float seam = 1.0 - smoothstep( 0.0, 0.035, abs( x - 0.5 ) );
	float streak = fbmP( vec2( uv.x * 8.0, uv.y * 1.5 ), 6.0, 4, 0.55 );
	float oxid = smoothstep( 0.45, 0.8, fbmP( uv + 0.2, 4.0, 5, 0.55 ) );
	col = srgb( mix( vec3( 0.55, 0.58, 0.60 ), vec3( 0.40, 0.43, 0.45 ), oxid ) ) * ( 0.9 + 0.2 * streak );
	h = 0.4 + seam * 0.6 + streak * 0.05;
	r = mix( 0.42, 0.7, oxid ) + streak * 0.08;
	ao = 1.0 - ( 1.0 - smoothstep( 0.0, 0.08, abs( x - 0.5 ) ) ) * 0.2;
	m = mix( 0.85, 0.5, oxid );
}`,

  slate: /* glsl */`
void surf( vec2 uv, out vec3 col, out float h, out float r, out float ao, out float m ) {
	vec4 b = bondP( uv, vec2( 10.0, 14.0 ), 0.5 );
	float lap = smoothstep( 0.0, 0.3, b.y );
	float edge = smoothstep( 0.0, 0.03, min( b.x, 1.0 - b.x ) * 14.0 / 10.0 );
	float grain = fbmP( uv, 80.0, 4, 0.6 );
	col = srgb( mix( vec3( 0.20, 0.22, 0.26 ), vec3( 0.29, 0.31, 0.35 ), b.w ) ) * ( 0.85 + 0.3 * grain ) * ( 0.6 + 0.4 * lap );
	h = lap * 0.6 * edge + ( 1.0 - b.y ) * 0.2 + grain * 0.06;
	r = 0.58 + grain * 0.15;
	ao = mix( 0.45, 1.0, lap ) * mix( 0.6, 1.0, edge );
	m = 0.0;
}`,

  concrete: /* glsl */`
void surf( vec2 uv, out vec3 col, out float h, out float r, out float ao, out float m ) {
	float f1 = fbmP( uv, 12.0, 5, 0.55 );
	vec3 pv = voronoiP( uv, 90.0, 1.0 );
	float pore = ( 1.0 - smoothstep( 0.05, 0.12, pv.x ) ) * step( 0.7, pv.z );
	float form = 1.0 - smoothstep( 0.0, 0.004, abs( fract( uv.y * 6.0 ) - 0.5 ) - 0.496 );
	float stain = smoothstep( 0.55, 0.85, fbmP( vec2( uv.x * 3.0, uv.y * 0.8 ), 3.0, 4, 0.55 ) );
	col = srgb( vec3( 0.55, 0.54, 0.52 ) ) * ( 0.85 + 0.3 * f1 ) * ( 1.0 - stain * 0.3 ) * ( 1.0 - pore * 0.5 );
	h = f1 * 0.3 - pore * 0.4 - form * 0.2 + 0.5;
	r = 0.86 + f1 * 0.08;
	ao = 1.0 - pore * 0.5;
	m = 0.0;
}`,

  grass: /* glsl */`
void surf( vec2 uv, out vec3 col, out float h, out float r, out float ao, out float m ) {
	float blades = gnoiseP( vec2( uv.x * 420.0, uv.y * 140.0 ), vec2( 420.0, 140.0 ) );
	float blades2 = gnoiseP( vec2( uv.x * 160.0 + 3.0, uv.y * 520.0 ), vec2( 160.0, 520.0 ) );
	float clump = fbmP( uv, 10.0, 5, 0.55 );
	float dry = smoothstep( 0.5, 0.8, fbmP( uv + 0.5, 4.0, 4, 0.55 ) );
	float bare = smoothstep( 0.66, 0.74, fbmP( uv + 0.17, 3.0, 5, 0.55 ) );
	vec3 g = mix( srgb( vec3( 0.22, 0.36, 0.12 ) ), srgb( vec3( 0.36, 0.46, 0.18 ) ), clump );
	g = mix( g, srgb( vec3( 0.50, 0.47, 0.26 ) ), dry * 0.6 );
	float bl = max( blades, blades2 );
	g *= 0.65 + 0.55 * bl;
	vec3 soil = srgb( vec3( 0.30, 0.24, 0.17 ) ) * ( 0.8 + 0.4 * clump );
	col = mix( g, soil, bare );
	h = bl * 0.6 * ( 1.0 - bare ) + clump * 0.3;
	r = mix( 0.88, 0.95, bare );
	ao = mix( 0.6, 1.0, bl );
	m = 0.0;
}`,

  gravel: /* glsl */`
void surf( vec2 uv, out vec3 col, out float h, out float r, out float ao, out float m ) {
	vec3 v = voronoiP( uv, 110.0, 1.0 );
	vec3 v2 = voronoiP( uv + 0.31, 55.0, 1.0 );
	float peb = smoothstep( 0.02, 0.12, v.y );
	float peb2 = smoothstep( 0.02, 0.15, v2.y );
	float macro = fbmP( uv, 4.0, 4, 0.5 );
	vec3 red = srgb( mix( vec3( 0.55, 0.30, 0.20 ), vec3( 0.68, 0.40, 0.27 ), v.z ) );
	vec3 fines = srgb( vec3( 0.46, 0.27, 0.19 ) );
	col = mix( fines, red, max( peb, peb2 * 0.8 ) ) * ( 0.85 + 0.3 * macro );
	float track = smoothstep( 0.6, 0.8, fbmP( vec2( uv.x * 2.0, uv.y * 6.0 ), 3.0, 4, 0.5 ) );
	col *= 1.0 - track * 0.12;
	h = max( peb * ( 0.5 + v.z * 0.5 ), peb2 * 0.6 ) * 0.8;
	r = 0.9;
	ao = mix( 0.55, 1.0, max( peb, peb2 ) );
	m = 0.0;
}`,

  wood: /* glsl */`
void surf( vec2 uv, out vec3 col, out float h, out float r, out float ao, out float m ) {
	vec4 b = bondP( uv, vec2( 2.0, 8.0 ), 0.37 );
	float joint = 1.0 - smoothstep( 0.0, 0.04, b.z );
	float grain = gnoiseP( vec2( uv.x * 6.0 + b.w * 13.0, uv.y * 180.0 ), vec2( 6.0, 180.0 ) );
	float rings = fract( grain * 7.0 + b.w * 3.0 );
	vec3 w = srgb( mix( vec3( 0.36, 0.23, 0.13 ), vec3( 0.50, 0.34, 0.20 ), b.w ) );
	w *= 0.8 + 0.25 * smoothstep( 0.2, 0.8, rings );
	float weather = smoothstep( 0.4, 0.8, fbmP( uv + 0.4, 5.0, 4, 0.55 ) );
	w = mix( w, srgb( vec3( 0.42, 0.40, 0.36 ) ), weather * 0.5 );
	col = mix( w, w * 0.3, joint );
	h = 0.6 - joint * 0.5 + rings * 0.08;
	r = 0.72 + weather * 0.18;
	ao = mix( 0.5, 1.0, 1.0 - joint );
	m = 0.0;
}`,

  paint: /* glsl */`
void surf( vec2 uv, out vec3 col, out float h, out float r, out float ao, out float m ) {
	float f = fbmP( uv, 16.0, 5, 0.55 );
	float scratch = smoothstep( 0.93, 0.97, ridgeP( vec2( uv.x * 3.0, uv.y * 0.7 ), 4.0, 3 ) );
	float chip = smoothstep( 0.75, 0.77, fbmP( uv + 0.45, 10.0, 5, 0.6 ) );
	col = vec3( 0.92 + 0.08 * f ) * ( 1.0 - chip * 0.45 );
	h = 0.5 - chip * 0.2 - scratch * 0.1 + f * 0.05;
	r = 0.5 + f * 0.15 + chip * 0.3 + scratch * 0.2;
	ao = 1.0 - chip * 0.2;
	m = chip * 0.6;
}`,

  rust: /* glsl */`
void surf( vec2 uv, out vec3 col, out float h, out float r, out float ao, out float m ) {
	float f = fbmP( uv, 8.0, 6, 0.6 );
	float rust = smoothstep( 0.42, 0.6, f );
	float pit = smoothstep( 0.7, 0.76, gnoiseP( uv * 160.0, vec2( 160.0 ) ) );
	vec3 steel = srgb( vec3( 0.45, 0.46, 0.47 ) );
	vec3 rc = srgb( mix( vec3( 0.45, 0.20, 0.08 ), vec3( 0.62, 0.34, 0.14 ), fbmP( uv + 0.3, 30.0, 4, 0.6 ) ) );
	col = mix( steel, rc, rust );
	h = 0.5 + rust * 0.2 - pit * 0.25;
	r = mix( 0.45, 0.92, rust );
	ao = 1.0 - pit * 0.3;
	m = mix( 0.9, 0.1, rust );
}`,

  fabric: /* glsl */`
void surf( vec2 uv, out vec3 col, out float h, out float r, out float ao, out float m ) {
	vec2 p = uv * 96.0;
	float wx = sin( p.x * 3.14159 ) * 0.5 + 0.5, wy = sin( p.y * 3.14159 ) * 0.5 + 0.5;
	float checker = mod( floor( p.x ) + floor( p.y ), 2.0 );
	float weave = mix( wx, wy, checker );
	float fuzz = fbmP( uv, 40.0, 4, 0.6 );
	float wear = smoothstep( 0.55, 0.85, fbmP( uv + 0.2, 4.0, 4, 0.55 ) );
	col = vec3( 0.85 + 0.15 * weave ) * ( 0.9 + 0.2 * fuzz ) * ( 1.0 + wear * 0.12 );
	h = weave * 0.6 + fuzz * 0.2;
	r = 0.9;
	ao = mix( 0.75, 1.0, weave );
	m = 0.0;
}`,

  // Bruits de variation à grande échelle (canal R,G,B,A indépendants), pour casser la
  // répétition des textures et moduler saleté / humidité / teinte dans les shaders.
  macro: /* glsl */`
void surf( vec2 uv, out vec3 col, out float h, out float r, out float ao, out float m ) {
	col = vec3( fbmP( uv, 4.0, 6, 0.55 ), fbmP( uv + 0.37, 8.0, 5, 0.55 ), fbmP( uv + 0.71, 2.0, 5, 0.5 ) );
	h = 0.5; r = ridgeP( uv + 0.13, 3.0, 5 ); ao = gnoiseP( uv * 64.0, vec2( 64.0 ) ); m = 0.0;
}`,
};
