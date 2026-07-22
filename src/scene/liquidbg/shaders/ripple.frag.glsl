// ============================================================================
// RIPPLE SIMULATION — UPDATE PASS (ping-pong framebuffers)
// ----------------------------------------------------------------------------
// The original site runs a full Navier–Stokes GPU fluid (splat → advect →
// divergence → curl → vorticity → pressure Jacobi → gradient-subtract, eight
// shaders ping-ponging between framebuffers) and uses the dye texture to
// distort the screen under the cursor.
//
// For a *water surface*, the physically-appropriate and much cheaper model is
// the discrete 2D WAVE EQUATION on a height field, which is what this pass
// implements. It keeps the same architecture (ping-pong FBOs, splat on mouse
// move) but needs ONE shader instead of eight:
//
//   h_next(x) = damping · ( mean4(h_curr neighbors) · 2 − h_prev(x) )
//
// This is the classic "water ripples" finite-difference scheme: the value 2×
// average − previous makes disturbances propagate outward as circular waves,
// and `damping` < 1 makes them die out (viscosity).
//
// THREE render targets rotate roles each frame:  prev ← curr ← next ← prev
//
// The mouse splat is folded into the same pass (a Gaussian bump added at the
// cursor position, exactly like the site's `splat` shader adds
// `exp(-dot(p,p)/radius) * color` to its dye/velocity fields).
// ============================================================================
precision highp float;

// tCurr / tPrev: the two most recent height fields (R channel = height).
uniform sampler2D tCurr;
uniform sampler2D tPrev;

// uTexel: 1 / resolution — one simulation cell in UV units.
uniform vec2 uTexel;

// uDamping: [0.90..0.995] energy retained per step. Higher = waves travel
// farther (less viscous). 0.976 reads as "heavy dark water".
uniform float uDamping;

// uMouse: splat center in sim UV space. Negative when the pointer is off
// the water (disables the splat without a branch on the CPU side).
uniform vec2 uMouse;

// uSplatStrength: [0..1] height added this frame. Driven by pointer *speed*
// on the CPU so slow moves barely dent the surface and fast flicks slosh it.
uniform float uSplatStrength;

// uSplatRadius: [0.001..0.01] Gaussian variance in UV² units (site uses the
// same exp(-d²/r) falloff for its fluid splats).
uniform float uSplatRadius;

varying vec2 vUv;

void main() {
  // Four-neighbor average of the current field (the Laplacian stencil).
  float l = texture2D(tCurr, vUv - vec2(uTexel.x, 0.0)).r;
  float r = texture2D(tCurr, vUv + vec2(uTexel.x, 0.0)).r;
  float b = texture2D(tCurr, vUv - vec2(0.0, uTexel.y)).r;
  float t = texture2D(tCurr, vUv + vec2(0.0, uTexel.y)).r;

  // Verlet-style integration: neighbors push the surface, the previous
  // frame's height provides the restoring "velocity" term.
  float next = (l + r + b + t) * 0.5 - texture2D(tPrev, vUv).r;

  // Viscous damping — without this the pool rings forever.
  next *= uDamping;

  // Mouse splat: a Gaussian bump at the cursor (same falloff as the site's
  // fluid splat shader). uMouse < 0 ⇒ exp of a huge negative ⇒ adds ~0.
  vec2 d = vUv - uMouse;
  next += exp(-dot(d, d) / uSplatRadius) * uSplatStrength;

  // Height can go slightly negative (troughs) — that's correct and gives the
  // wave its leading/trailing edge. Clamp only to a sane range so a stuck
  // pointer can't blow up the field.
  next = clamp(next, -2.0, 2.0);

  gl_FragColor = vec4(next, 0.0, 0.0, 1.0);
}
