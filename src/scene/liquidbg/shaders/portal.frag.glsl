// ============================================================================
// EMBLEM — FRAGMENT SHADER (the HDR light source)
// ----------------------------------------------------------------------------
// The brand glyph: TWO VERTICAL BARS (pause-mark style), rendered at HDR
// intensity (≈6, far above 1.0). Two things downstream depend on that:
//
//   • the bloom pass thresholds at luminance 1.0, so ONLY the bars (and
//     their reflection in the water) bloom — that's the entire "soft glow";
//   • the water samples this via the mirrored camera; because the bars are
//     compact and HDR, their distorted reflection fragments into crisp
//     shards (a displaced lookup either hits a bright bar or black —
//     nothing in between).
// ============================================================================
precision highp float;

uniform float uTime;      // seconds
uniform float uMotion;    // [0..1] reduced-motion scale (freezes flicker at 0)
uniform float uIntensity; // [1..10] HDR core brightness
uniform vec3  uColor;     // PURE WHITE — the emissive core
uniform vec3  uGlowColor; // neon lime — the edge glow only

// ---- Live-adjustable bar geometry (driven by the on-screen slider panel) ---
uniform float uBarWidth;   // half-width of each bar
uniform float uBarHeight;  // half-height of the OUTER bars (middle = 70%)
uniform float uBarSpacing; // center-to-center horizontal distance
uniform vec2  uBarOffset;  // (x = left/right, y = up/down) whole-cluster shift
uniform float uBarRound;   // corner radius: 0 = sharp, larger = rounder

varying vec2 vUv;

// Cheap hash/value-noise pair (kept local so the shader is self-contained).
float hash21(vec2 p) {
  p = fract(p * vec2(234.34, 435.345));
  p += dot(p, p + 34.23);
  return fract(p.x * p.y);
}

float valueNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash21(i), hash21(i + vec2(1.0, 0.0)), u.x),
    mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

// sdBox: axis-aligned box, half-extents b, centered at c.
float sdBox(vec2 p, vec2 c, vec2 b) {
  vec2 q = abs(p - c) - b;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0);
}

// One bar: a rectangle with LIVE-adjustable corner rounding (uBarRound).
// Standard rounded-box form — shrink the half-extents by r, then subtract r —
// so the OUTER size stays constant while the corners round; r is clamped
// below the bar's own half-size so it can never invert. uBarRound = 0 gives
// perfectly sharp corners; larger values round toward a capsule.
float bar(vec2 p, vec2 c, vec2 b) {
  float r = min(uBarRound, min(b.x, b.y) * 0.98);
  return sdBox(p, c, b - r) - r;
}

void main() {
  float t = uTime * uMotion;

  // Map UV to a centered -1..1 space for the SDF.
  vec2 p = vUv * 2.0 - 1.0;

  // THE THREE PILLARS — perfectly sharp rectangles (no edge wobble),
  // all BOTTOM-ALIGNED at y = −0.62 (the waterline in world space, so
  // each pillar stands ON the water and its reflection connects directly
  // to its base). Exact spec:
  //   • outer two: identical height (uBarHeight)
  //   • middle:    exactly 70% of that
  //   • spacing, width, and cluster offset all live-driven by the sliders
  //   • bases stay pinned to the waterline (baseY) so reflections connect —
  //     each bar's centerY = baseY + halfHeight (bottom-alignment).
  float baseY  = -0.62 + uBarOffset.y;
  float hOuter = uBarHeight;
  float hMid   = uBarHeight * 0.70;
  float cx     = uBarOffset.x;
  vec2  wOuter = vec2(uBarWidth, hOuter);
  vec2  wMid   = vec2(uBarWidth, hMid);

  float d =    bar(p, vec2(cx - uBarSpacing, baseY + hOuter), wOuter);
  d = min(d,   bar(p, vec2(cx,               baseY + hMid),   wMid));
  d = min(d,   bar(p, vec2(cx + uBarSpacing, baseY + hOuter), wOuter));

  // ---------------------------------------------------------------------------
  // CORE + HALO
  // core: solid interior (soft antialiased rim).
  // halo: tight exponential falloff — the notch between the bars must stay
  //       dark; the wide atmospheric glow is bloom's job, not the surface's.
  // ---------------------------------------------------------------------------
  // core: razor-sharp white slab (very tight smoothstep — just enough
  //       width to antialias the edge, nothing more).
  // halo: ONE smooth exponential — physically-correct falloff, no noise.
  //       Colored lime (uGlowColor) while the core stays pure white.
  float core = smoothstep(0.008, -0.008, d);
  // Two-term halo = "volumetric scattering only around the bars" — kept
  // SMALL: the readable glow must come from HDR emission through bloom,
  // not from painted surface halo (which is what made the bars fuzzy).
  float halo = exp(-max(d, 0.0) * 5.0) * 0.14
             + exp(-max(d, 0.0) * 1.6) * 0.03;

  // Fade the halo to zero before the plane's edge — against a pure-black
  // world even a 0.005 additive step at the quad boundary reads as a faint
  // rectangle.
  float edgeFade = (1.0 - smoothstep(0.65, 0.98, abs(p.x)))
                 * (1.0 - smoothstep(0.65, 0.98, abs(p.y)));
  halo *= edgeFade;

  // Barely-there breathing (±2%) — alive, never flickery.
  float breathe = 1.0 + 0.02 * sin(t * 0.7) * valueNoise(vec2(t * 0.3, 0.0));

  // HDR output: white core far over 1.0; lime edge glow around it.
  vec3 color = uColor * (core * breathe * uIntensity)
             + uGlowColor * (halo * uIntensity * 0.25);

  // Additive-friendly alpha shaped like the glyph, so the plane's corners
  // are perfectly invisible against the dark room.
  float alpha = clamp(core + halo, 0.0, 1.0);

  gl_FragColor = vec4(color, alpha);
}
