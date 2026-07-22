// ============================================================================
// WATER — FRAGMENT SHADER
// ----------------------------------------------------------------------------
// Recreates the look of drei's MeshReflectorMaterial as configured on
// weareuprising.com:
//
//   ORIGINAL SITE                        THIS SHADER (clean-room)
//   ---------------------------------    -------------------------------------
//   512px planar reflection target    →  uReflection (rendered by Water.jsx)
//   normal-map.jpg tiled 8×8,         →  procedural 2-octave value-noise
//   normalScale 0.08                     gradient field (no bitmap needed)
//   map offset drifting:              →  identical drift equation:
//     x = 0.2·cos(t·0.1)                   uv += vec2(0.2·cos(0.1t),
//     y = 0.1·sin(t·0.2)                              0.1·sin(0.2t))
//   mirror 0.92 / metalness 0.98      →  uMirror (reflection dominance)
//   scene fog (teal→black)            →  distance fade to uFogColor
//   (mouse fluid sim on cursor)       →  ping-pong ripple sim (uRipple)
//
// Precision: highp is required — the projective UV math and the noise
// derivatives visibly band at mediump on mobile GPUs.
// ============================================================================
precision highp float;

// ---- Reflection ------------------------------------------------------------
// uReflection: the planar-reflection render target. HALF-FLOAT — the portal
// is rendered at HDR intensities (> 1.0), and keeping those values linear in
// the reflection is what lets bloom later "re-glow" the reflected streak.
uniform sampler2D uReflection;

// ---- Interactive ripples ---------------------------------------------------
// uRipple:      height field produced by the ping-pong wave-equation sim
//               (see ripple.frag.glsl). R channel = surface height.
// uRippleTexel: 1.0 / simResolution — step for the finite-difference gradient.
uniform sampler2D uRipple;
uniform vec2 uRippleTexel;

// ---- Water normal map ------------------------------------------------------
// uNormalMap: the site's actual fine-grain water normal texture (extracted
// during the reverse-engineering pass; used here at the user's direction for
// this local educational study). Tiled uNormalRepeat× across the plane with
// a drifting offset — exactly how the original animates it.
uniform sampler2D uNormalMap;
uniform float uNormalRepeat;  // [2..16] tiling. Site: 8
uniform float uNormalScale;   // [0.1..1] slope amplitude from the map

// ---- Studio environment cubemap --------------------------------------------
// uEnvMap: the site's own cube160 studio-lightbox cubemap (glowing wall
// panels + ceiling grids on black). Sampled by the reflected view vector so
// the water picks up STRUCTURED white studio reflections at grazing angles —
// the luxury-automotive trick. Greyscale, so it never breaks the palette.
uniform samplerCube uEnvMap;
uniform float uEnvIntensity;  // [0..0.3] how strongly the studio env shows

// uReflOffset: manual shift of the reflection lookup in screen-UV space —
// (x = left/right, y = up/down). Lets the reflection be nudged to sit exactly
// under the bars regardless of camera/geometry tweaks.
uniform vec2 uReflOffset;

// ---- Extra micro-normal detail ---------------------------------------------
// uDetailMap: the site's tech-pattern, repurposed as a high-frequency bump
// layer — adds fine facet variation that the smooth normal map alone lacks,
// which is what makes the reflection fragment into MANY tiny pieces.
uniform sampler2D uDetailMap;

// ---- Look controls (safe ranges in [brackets]) -----------------------------
uniform float uTime;          // seconds, monotonic
uniform float uMotion;        // [0..1] global motion scale (0 = reduced motion)
uniform float uDistortion;    // [0.00..0.15] reflection UV push. Site ≈ 0.05
uniform float uRippleStrength;// [0..3] how hard mouse ripples bend the surface
uniform float uMirror;        // [0..1] reflection dominance. Site: 0.92
uniform float uGrainScale;    // [4..64] frequency of the procedural swell
uniform vec3  uDeepColor;     // water body color where reflection is weak
uniform vec3  uFogColor;      // color faded to in the distance (scene fog)
uniform vec3  uFogGlow;       // haze tint added to fog near the portal axis —
                              // matches the back wall's shaft/floor haze so
                              // the water⇄wall seam is invisible
uniform float uFogNear;       // world-space distance where fog starts
uniform float uFogFar;        // world-space distance where fog is total
uniform vec3  uCameraPos;     // world-space camera position (for fresnel)

varying vec4 vProjUv;
varying vec3 vWorldPos;
varying vec2 vUv;

// ============================================================================
// PROCEDURAL NOISE (used for the large ridged swell + sparkle only — the
// fine grain now comes from the site's real normal map, sampled above).
// ============================================================================

// hash21: 2D → 1D pseudo-random. Standard fract-sin hash; good enough for
// visual noise, deterministic across GPUs for our purposes.
float hash21(vec2 p) {
  p = fract(p * vec2(234.34, 435.345));
  p += dot(p, p + 34.23);
  return fract(p.x * p.y);
}

// valueNoise: bilinear interpolation of hashed lattice corners with a
// smoothstep (Hermite) fade — the classic "value noise".
float valueNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);   // Hermite fade curve

  float a = hash21(i);
  float b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0));
  float d = hash21(i + vec2(1.0, 1.0));

  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

// ridgedSwell: slow large-scale undulation. RIDGED (folded) noise puts
// sharp creases at zero crossings — each crease kinks the normal and splits
// the reflection into runnels at swell scale.
float ridgedSwell(vec2 p, float t) {
  vec2 swellDrift = vec2(t * 0.02, t * -0.013);
  return abs(valueNoise(p * 5.0 + swellDrift) * 2.0 - 1.0);
}

void main() {
  // 0.65× time: everything moves slower than expected — the drift reads
  // as mass and weight, not animation. (Luxury moves slowly.)
  float t = uTime * uMotion * 0.65;

  // --------------------------------------------------------------------------
  // 1. BUILD THE PERTURBED NORMAL
  // Three slope sources are summed into one surface gradient:
  //   a) the site's real fine-grain normal map, tiled uNormalRepeat× and
  //      drifting with the ORIGINAL's exact offset animation,
  //   b) a second, coarser sample of the same map, counter-drifting —
  //      breaks tiling repetition and adds mid-frequency wobble,
  //   c) a procedural ridged swell for the largest-scale runnel splits.
  // --------------------------------------------------------------------------

  // --- WAVE SPECTRUM --------------------------------------------------------
  // Real wind waves are ELONGATED perpendicular to their travel direction:
  // in the reference every undulation is a wide, short band parallel to the
  // horizon. Squeezing the v axis (ELONG) stretches all sampled features
  // horizontally, which is also what stacks the reflection into horizontal
  // slivers.
  const float ELONG = 2.6;
  vec2 wuv = vUv * vec2(1.0, ELONG);

  // (a) SWELL — big smooth rollers, the DOMINANT layer. It TRANSLATES
  // steadily toward the camera (+v) so the pool visibly travels instead of
  // morphing in place. LOW tiling (1.0) ⇒ wide smooth wave-bands — these are
  // the broad rolling crests whose tilted facets carry the reflection all
  // the way down to the viewer (the reference's signature).
  vec2 s1 = texture2D(uNormalMap, wuv * 1.0 + vec2(0.0, t * 0.012)).rg * 2.0 - 1.0;

  // (b) CHOP — mid-frequency waves crossing at a slight angle (real seas
  // are never a single wave train).
  vec2 s2 = texture2D(uNormalMap, wuv * 4.5 + vec2(0.37) + vec2(t * 0.013, -t * 0.007)).rg * 2.0 - 1.0;

  // (c) GRAIN — the site's fine shimmer, with its original drift equation,
  // demoted to an edge-breaker.
  vec2 drift = vec2(0.2 * cos(t * 0.1), 0.1 * sin(t * 0.2));
  vec2 s3 = texture2D(uNormalMap, vUv * uNormalRepeat + drift).rg * 2.0 - 1.0;

  // (c2) MICRO-WAVES — very high-frequency capillary shimmer (22× tiling,
  // fast counter-drift). Small weight, but it is what makes the surface
  // read as *water* instead of a smooth material: the reflection shimmers
  // and the specular glints dance on these facets.
  vec2 s4 = texture2D(uNormalMap, vUv * 22.0 - drift * 1.5).rg * 2.0 - 1.0;

  // (c3) DETAIL — the site's tech-pattern as a very-high-frequency bump.
  // It carries hard geometric edges the smooth water map lacks, so it chops
  // the reflection into many more distinct fragments. Tiny weight (below).
  vec2 s5 = texture2D(uDetailMap, vUv * 34.0 + drift * 0.8).rg * 2.0 - 1.0;

  // (d) ridged-swell gradient via finite differences — sharp crease lines
  // that split the streak into runnels (elongated like everything else).
  float eps = 0.002;
  float sw  = ridgedSwell(wuv, t);
  vec2 swellGrad = vec2(
    ridgedSwell(wuv + vec2(eps, 0.0), t) - sw,
    ridgedSwell(wuv + vec2(0.0, eps), t) - sw
  ) / eps;

  // Micro-detail forward: the high-frequency layers carry more weight so
  // the reflection FRAGMENTS on small ripples (heavy-liquid shimmer)
  // instead of stretching into long smooth copies.
  // Balance found by iteration: pushing the micro layer above ~0.20
  // atomizes the streak into invisible sub-pixel scatter — this mix keeps
  // hundreds of small fragments while the trail stays readable.
  // Macro swell suppressed to a trace — realism lives in the micro detail,
  // and large waves read as "ocean", not premium still liquid.
  // Low-frequency forward: the broad swell dominates so the reflection reads
  // as large sweeping wave-bands that reach the viewer, with micro-detail
  // only seasoning on top. (The earlier micro-forward mix made tight ripples
  // that couldn't tilt enough to carry the streak past the horizon.)
  vec2 slope = (s1 * 0.48 + s2 * 0.22 + s3 * 0.11 + s4 * 0.13 + s5 * 0.06) * uNormalScale
             + swellGrad * 0.020;

  // Interactive ripple gradient — central differences over the sim texture.
  // The sim stores height in R; its gradient bends the surface exactly like
  // the procedural layer does, so both integrate into one normal.
  float rl = texture2D(uRipple, vUv - vec2(uRippleTexel.x, 0.0)).r;
  float rr = texture2D(uRipple, vUv + vec2(uRippleTexel.x, 0.0)).r;
  float rb = texture2D(uRipple, vUv - vec2(0.0, uRippleTexel.y)).r;
  float rt = texture2D(uRipple, vUv + vec2(0.0, uRippleTexel.y)).r;
  vec2 rippleSlope = vec2(rr - rl, rt - rb) * uRippleStrength;

  slope += rippleSlope;

  // The plane is horizontal (normal = +Y), so the perturbed world normal is
  // simply (slope.x, 1, slope.y) normalized.
  vec3 normal = normalize(vec3(-slope.x, 1.0, -slope.y));

  // --------------------------------------------------------------------------
  // 2. SAMPLE THE PLANAR REFLECTION
  // Perspective divide happens here (per-fragment). The normal's XZ tilt
  // offsets the lookup — this is what turns a perfect mirror into liquid:
  // every slope bump smears the reflected portal into wobbly streaks.
  // --------------------------------------------------------------------------
  vec2 projUv = vProjUv.xy / vProjUv.w;

  // View distance — used for the dispersion gradient here and the fog below.
  float dist = length(uCameraPos - vWorldPos);

  // DISPERSION GRADIENT: in the reference the streak is coherent and
  // compressed near the horizon and breaks into scattered isolated patches
  // toward the viewer. Scaling distortion UP as distance drops reproduces
  // that: far water ≈ 0.8×, near water ≈ 1.8×.
  // NEARNESS — 0 at the horizon, 1 toward the viewer. This drives the
  // reflection's vertical distortion so it is ~0 right at the waterline
  // (the reflection connects cleanly to the pillar base — no floating gap)
  // and grows toward the camera (long, wavy, broken streaks).
  float nearF = smoothstep(19.0, 3.0, dist);

  // Horizontal wander stays small everywhere (streaks fall straight).
  float spread = clamp(14.0 / max(dist, 0.001), 0.8, 3.0);

  // ANISOTROPIC smear: ripple crests act as horizontal mirror bands, so a
  // light's reflection smears far more along screen-vertical than
  // horizontal. The x weight is kept SMALL (0.15): any horizontal smear
  // inherits the drifting wave layers' slowly-wandering mean slope, which
  // shears the whole streak sideways — the streaks must fall vertically,
  // directly beneath the bars.
  // Vertical smear ramps from tiny at the waterline (0.5 — reflection glued
  // to the pillar base) to large toward the viewer (5.5 — long wavy streaks
  // reaching down the pool). Horizontal wander tiny so the streaks stay
  // under their pillars.
  float vSmear = mix(0.5, 5.5, nearF);
  vec2 distortedUv = projUv + normal.xz * uDistortion * vec2(0.14 * spread, vSmear)
                   + uReflOffset; // manual L/R + U/D nudge

  // CHROMATIC ABERRATION on the reflection only: the site runs an RGB-split
  // post pass; the visible result on the water is thin red/blue fringes on
  // the bright shards. Sampling R and B a hair apart vertically reproduces
  // it for two extra taps.
  float ca = 0.0016;
  vec3 rawRefl;
  rawRefl.r = texture2D(uReflection, distortedUv + vec2(0.0,  ca)).r;
  rawRefl.g = texture2D(uReflection, distortedUv).g;
  rawRefl.b = texture2D(uReflection, distortedUv - vec2(0.0,  ca)).b;

  // NO blur on the reflection (spec): the break-up comes entirely from the
  // surface normals distorting the lookup — sharp fragments, low roughness.
  rawRefl = max(rawRefl, 0.0);

  // TWO-COMPONENT REFLECTION — the key to "lit by the whole scene":
  //
  // bright — contrast-curved emblem shards. Power 1.5 (not higher) keeps
  //          smooth interior gradients inside each patch; the ceiling keeps
  //          them just barely HDR so bloom glows without blobbing.
  // Streak stays strong well toward the viewer so it reads as a long
  // reflection (floor 0.72), tapering only in the last stretch.
  float atten = clamp((dist - 1.0) / 12.0, 0.72, 1.0);

  // FACET VISIBILITY — the physical source of the horizontal slivers:
  // a water facet reflects the pillar into the eye only while its normal
  // tips toward the camera, so the local toward-viewer slope directly
  // modulates intensity. Crucially this works where the projective lookup
  // CANNOT miss (near the horizon the mirror image is huge on screen),
  // which is exactly where the streak previously fused into a solid slab.
  // pow(·,2) sharpens band edges; the 0.25 floor keeps troughs from
  // strobing to black.
  float facet = pow(clamp(0.5 + slope.y * 4.5, 0.0, 1.0), 2.0);

  // SOFT-KNEE COMPRESSION instead of a hard ceiling: x/(1+a·x) preserves
  // the ORDER and RATIO of HDR values (a hard min() collapsed everything
  // near the base to one flat white). Peak ≈ 2.1/0.45 ≈ intensity that
  // still feeds bloom; mids keep their variation for the sliver texture.
  // Peak kept BELOW the pillars' own luminance so the waterline junction
  // stays readable (pillar bright → reflection a step dimmer → textured).
  vec3 bright = pow(rawRefl, vec3(1.4));
  bright = bright / (1.0 + 0.45 * bright);
  // Gate ramps with nearness: near-SOLID mirror at the waterline (0.80 base
  // + light facet) so the reflection joins the pillar base seamlessly, then
  // breaks into facet bands toward the viewer.
  float reflGate = mix(0.80, 0.15, nearF) + mix(0.20, 0.85, nearF) * facet;
  bright *= 1.6 * atten * reflGate;

  // ambient — a DIM, uncrushed mirror of everything else (the smoke and
  //           halo on the back wall). This is what makes wave relief
  //           visible across the whole pool: crest facets catch the teal
  //           glow far from the streak. Clamped first so the HDR emblem
  //           doesn't double-count into it.
  vec3 ambient = min(rawRefl, vec3(0.6)) * 0.10;

  vec3 reflection = bright + ambient;

  // Color cast: neon lime — blue reduced (not crushed: over-crushing turns
  // clipped streaks mustard). Reflection only; the pillars' core stays white.
  reflection *= vec3(0.92, 1.04, 0.62);

  // --------------------------------------------------------------------------
  // 3. FRESNEL
  // Water reflects more at grazing angles. Schlick's approximation with a
  // high base reflectance because the site runs metalness 0.98 / mirror 0.92
  // (their water is almost a full mirror even at steep angles).
  // --------------------------------------------------------------------------
  vec3 viewDir = normalize(uCameraPos - vWorldPos);
  float cosTheta = clamp(dot(viewDir, normal), 0.0, 1.0);
  // Stronger fresnel: near-mirror at grazing (the far pool), dimmer when
  // looking steeply down (the near pool) — this is what gives the water
  // its depth gradient toward the horizon.
  float fresnel = 0.55 + 0.45 * pow(1.0 - cosTheta, 3.0);

  // --------------------------------------------------------------------------
  // 4. COMPOSE
  // Deep water color shows where reflection is dim; reflection (still HDR)
  // dominates where the portal streak lands. uMirror scales overall
  // reflectivity like drei's `mirror` prop.
  // --------------------------------------------------------------------------
  vec3 color = uDeepColor + reflection * (fresnel * uMirror);

  // STUDIO ENVIRONMENT REFLECTION — sample the cube160 lightbox with the
  // reflected view vector. The plane is horizontal (normal ≈ +Y perturbed by
  // slope), so we reflect the incoming view direction about it and look up
  // the cubemap. Modulated by fresnel (grazing angles show more) and gated
  // low: this adds faint STRUCTURED white glints from the studio walls,
  // scattered by the ripples — the premium micro-richness that a single
  // point light can't give. Greyscale env ⇒ palette stays intact.
  vec3 refl3 = reflect(-viewDir, normal);
  vec3 env = textureCube(uEnvMap, refl3).rgb;
  color += env * fresnel * uEnvIntensity;

  // SPECULAR GLINTS — true Blinn-Phong highlights from the pillar light:
  // micro-wave facets whose half-vector aligns with the light flash small,
  // sharp, HDR-bright points that dance as the surface drifts. Exponent
  // 240 ≈ roughness ~0.06 (the spec'd 0.05–0.12 band); the glints are the
  // "small specular highlights" that sell the water as physical.
  vec3 lightPos = vec3(0.0, 1.6, -14.0); // the pillars' luminous center
  vec3 lightDir = normalize(lightPos - vWorldPos);
  vec3 halfVec = normalize(lightDir + viewDir);
  // Tighter lobe (420) ⇒ smaller, sharper, RARER glints — occasional
  // pinpricks, not gloss. Not plastic, not wet asphalt.
  float spec = pow(max(dot(normal, halfVec), 0.0), 420.0);
  color += vec3(0.9, 1.05, 0.45) * spec * atten;

  // GLITTER PATH — the physical wash of a bright light reflected on water
  // toward the viewer. It is NOT a radial pool: it is a COLUMN under the
  // light (small |x|) that runs from the horizon all the way to the near
  // water, broken into shimmering bands by the facet term. This is what the
  // planar reflection alone cannot reach (the mirror image of distant
  // pillars only projects to a band near the horizon); the glitter path
  // carries the light down to the bottom of the frame — the reference's
  // signature wash.
  //
  //   colX   — Gaussian across x, ~1.4-unit half-width (the pillar cluster).
  //   colZ   — full brightness from the horizon (z=−14) to just shy of the
  //            camera, fading only in the last stretch so the wash reaches
  //            the frame bottom.
  //   facet  — breaks the column into the horizontal bands.
  // GLITTER — a WHISPER only. The earlier version was a wide, bright, smooth
  // analytic cone that read as a fake green spotlight flooding the
  // foreground. The real reflection is the three broken PLANAR streaks
  // (above); this term just fills the gaps between their fragments with a
  // dim, TIGHT, band-broken shimmer so the streaks feel connected — never a
  // solid fill. Narrow (coeff 2.4), band-gated hard (no smooth floor), and
  // dim (0.5).
  float band = facet * facet;
  float colX = exp(-vWorldPos.x * vWorldPos.x * 2.4);
  float colZ = smoothstep(6.0, -3.0, vWorldPos.z);
  float glitter = colX * colZ * band * band; // band² ⇒ only bright crests show
  color += vec3(0.34, 0.42, 0.12) * glitter * atten * 0.5;

  // WATERLINE FAN — kept as only a faint hint. A bright full-width band here
  // reads as a lit SHELF the pillars stand on (they look in front of the
  // water instead of receding behind it). Narrowed toward the pillar column
  // and dimmed hard so the waterline stays dark and the pillars recede.
  float fanZ = smoothstep(14.0, 18.5, dist);
  float fanX = exp(-vWorldPos.x * vWorldPos.x * 0.16);
  float fan = fanZ * fanX * band;
  color += vec3(0.30, 0.38, 0.11) * fan * 0.3;

  // --------------------------------------------------------------------------
  // 5. DISTANCE FOG (directional)
  // The original attaches THREE.Fog to the scene. We reproduce it manually,
  // with one refinement: the fog color brightens toward the portal's x-axis
  // (uFogGlow), mirroring the back wall's light shaft. Result: where the
  // fogged water meets the wall, both converge to the same color and the
  // horizon seam disappears.
  // --------------------------------------------------------------------------
  float axis = exp(-vWorldPos.x * vWorldPos.x * 0.30);
  vec3 fogColor = uFogColor + uFogGlow * axis;
  float fogAmount = smoothstep(uFogNear, uFogFar, dist); // dist computed in §2
  color = mix(color, fogColor, fogAmount);

  // NOTE: output is intentionally NOT clamped — HDR values > 1.0 in the
  // reflected streak feed the bloom pass, which produces the soft glow
  // bleeding off the water. Tone mapping happens at the end of the
  // post-processing chain.
  gl_FragColor = vec4(color, 1.0);
}
