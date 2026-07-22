// ============================================================================
// PORTAL — VERTEX SHADER
// ----------------------------------------------------------------------------
// The portal is a simple upright plane; all the glow shaping is done in the
// fragment shader from the UV, so this is a plain passthrough projection.
// ============================================================================
precision highp float;

varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
