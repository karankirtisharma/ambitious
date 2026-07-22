// ============================================================================
// WATER — VERTEX SHADER
// ----------------------------------------------------------------------------
// The water is a single flat plane lying on y = 0. All of the "liquid" look
// happens in the FRAGMENT shader (normal perturbation + planar reflection).
// The vertex shader's only jobs are:
//
//   1. Project the vertex normally (gl_Position).
//   2. Produce vProjUv — the *projective* texture coordinate used to sample
//      the planar-reflection render target. This is the same trick used by
//      three.js' Reflector / drei's MeshReflectorMaterial (which is what the
//      original site uses): the reflection texture was rendered from a
//      mirrored camera, so sampling it with the vertex's clip-space position
//      makes the reflection "stick" to the surface like a mirror.
//   3. Pass the world position (for fog / distance falloff) and the mesh UV
//      (for the interactive ripple simulation lookup).
// ============================================================================

// uTextureMatrix: (world → reflection-UV) matrix, computed on the CPU each
// frame as:  bias(0.5) * mirrorCamera.projection * mirrorCamera.viewInverse
// The bias matrix remaps clip space [-1,1] to UV space [0,1].
uniform mat4 uTextureMatrix;

// vProjUv — 4D! Perspective division (.xyz / .w) must happen per-fragment,
// not per-vertex, otherwise the reflection warps on large triangles.
varying vec4 vProjUv;

// vWorldPos — world-space position of the fragment, used for the camera
// distance fade (fog) and to build the view vector for fresnel.
varying vec3 vWorldPos;

// vUv — plain 0..1 UV across the plane, used to sample the ripple sim
// texture (the sim covers the whole plane exactly once).
varying vec2 vUv;

void main() {
  vUv = uv;

  // Standard model → world transform. The plane is static, but keeping
  // modelMatrix here means you can move/rotate the water freely.
  vec4 worldPos = modelMatrix * vec4(position, 1.0);
  vWorldPos = worldPos.xyz;

  // Projective coordinate into the reflection render target.
  vProjUv = uTextureMatrix * worldPos;

  // Normal camera projection.
  gl_Position = projectionMatrix * viewMatrix * worldPos;
}
