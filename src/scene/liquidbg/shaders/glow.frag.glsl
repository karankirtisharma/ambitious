// ============================================================================
// BACKGROUND — FRAGMENT SHADER (pure black + clean neon glow, NO texture)
// ----------------------------------------------------------------------------
// Minimal, premium: the wall is near-pure black with exactly two light
// features, both analytically smooth (no noise, no smoke, no visible
// texture — Gaussians only, which is also the physically correct
// single-scatter falloff for a light in thin haze):
//
//   1. a soft radial glow centered behind the pillars,
//   2. a thin, wide band of light hugging the horizon — the pillars' light
//      grazing along the water surface at distance. This is also what
//      keeps the wall↔water seam invisible: the seam sits INSIDE the
//      band's smooth gradient.
//
// The plane is OPAQUE and doubles as the scene's back wall, so the water's
// mirrored camera reflects this exact image.
// ============================================================================
precision highp float;

uniform float uTime;    // seconds (kept for API stability; unused)
uniform float uMotion;  // [0..1] reduced-motion scale (unused — static wall)
uniform vec3 uHaze;     // neon lime glow color
uniform vec3 uDark;     // near-pure black base
uniform float uAspect;  // plane width / height — keeps the glow circular

varying vec2 vUv;

// Minimal noise pair — used ONLY for the near-invisible depth in the black
// (2–4% luminance). Black is a material: a mathematically flat #000 reads
// as "empty"; a whisper of structure reads as air and distance.
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

float fbm3(vec2 p) {
  return valueNoise(p) * 0.55
       + valueNoise(p * 2.1 + 13.7) * 0.30
       + valueNoise(p * 4.3 + 7.1) * 0.15;
}

void main() {
  // Centered coordinates, isotropic (x scaled by plane aspect).
  vec2 p = vUv * 2.0 - 1.0;
  p.x *= uAspect;
  p.y -= 0.03; // center the glow on the pillars' sightline through the wall

  // --- 1. Radial glow --------------------------------------------------------
  // One smooth Gaussian, slightly taller than wide (the source is a column
  // cluster, not a point). TIGHT: the reference is black again well before
  // mid-frame — the glow hugs the pillars, it does not flood the wall.
  // Backdrop cut to a whisper: NO large radial circle — just a small halo
  // immediately around the pillars' position, fading smoothly into pure
  // black. Every other green photon in the frame must come from the bars
  // themselves (emission, bloom, reflection).
  float r = length((p - vec2(0.0, 0.10)) * vec2(1.0, 0.9));
  float glow = exp(-r * r * 6.0) * 0.10;

  // --- 2. Horizon light band -------------------------------------------------
  // Thin across y (hugging the waterline at p.y ≈ −0.18), brightest under
  // the pillars, gone by ~40% toward the frame edges — the sides of the
  // horizon stay pure black-on-black (no visible seam).
  // Thin horizon light line — the target's signature: tight across y, WIDE
  // across x (a soft Gaussian never shows an "end" — the earlier visible
  // wedge came from too-low amplitude meeting the black floor mid-fade,
  // not from the width itself).
  float band = exp(-abs(p.y + 0.18) * 20.0) * exp(-p.x * p.x * 0.7) * 0.09;

  // DEPTH IN THE BLACK — barely-perceptible structure in the air around
  // the light (the viewer should feel depth, never notice fog). Peak
  // contribution ≈ 3% luminance, masked to the glow's own region so the
  // frame edges remain true black. Drift is glacial (t·0.008).
  float t = uTime * uMotion;
  float air = fbm3(p * 1.1 + vec2(t * 0.008, -t * 0.005));
  float airMask = exp(-r * r * 2.2) * smoothstep(-0.25, 0.2, p.y);
  float breath = (air - 0.5) * 0.06 * airMask;

  // Compose over near-black. uDark keeps a whisper of green so the vignette
  // doesn't crush to dead #000.
  vec3 color = uDark + uHaze * max(glow + band + breath, 0.0);

  gl_FragColor = vec4(color, 1.0);
}
