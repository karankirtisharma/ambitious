// ============================================================================
// FULLSCREEN — VERTEX SHADER (shared by every simulation pass)
// ----------------------------------------------------------------------------
// The ripple simulation renders a single "fullscreen" quad into an offscreen
// framebuffer. The quad's positions are already in clip space (-1..1), so no
// camera matrices are involved — the same pattern the original site uses for
// its Navier–Stokes fluid passes (their vertex shader also emits
// `gl_Position = vec4(position, 0, 1)` untouched).
// ============================================================================
precision highp float;

varying vec2 vUv;

void main() {
  vUv = uv;
  // position is a unit quad in clip space; write it straight through.
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
