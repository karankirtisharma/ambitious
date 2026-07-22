// ============================================================================
// BACKGROUND GLOW — VERTEX SHADER
// ----------------------------------------------------------------------------
// The glow is a large plane standing behind the portal (the "back wall" of
// the dark room). Plain projection; the radial gradient is fully procedural
// in the fragment shader (requirement: no bitmap backgrounds).
// ============================================================================
precision highp float;

varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
