/**
 * Rounded emissive light panel. A flat SDF-masked quad — no glow is painted
 * here; the brightness runs into HDR (>1) and bloom does the glow downstream.
 * Carries manual view-depth fog (capped at 50%) so the distant slots seat back
 * into aerial perspective without dying — a custom ShaderMaterial gets no scene
 * fog automatically.
 */
export const PANEL_VERT = /* glsl */ `
  varying vec2 vUv;
  varying float vFogDepth;
  void main() {
    vUv = uv;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    vFogDepth = -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

export const PANEL_FRAG = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  varying float vFogDepth;
  uniform vec3 uCore;    // hot near-white centerline
  uniform vec3 uEdge;    // cooler edge
  uniform float uIntensity;
  uniform vec2 uSize;    // world width/height, for a correct rounded-rect aspect
  uniform float uRadius; // corner radius, world units
  uniform vec3 uFogColor;
  uniform float uFogDensity;

  float sdRoundRect(vec2 p, vec2 b, float r) {
    vec2 q = abs(p) - b + r;
    return min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - r;
  }

  void main() {
    vec2 p = (vUv - 0.5) * uSize;
    float d = sdRoundRect(p, uSize * 0.5, uRadius);
    float aa = fwidth(d) * 1.25;
    float mask = 1.0 - smoothstep(-aa, aa, d);
    if (mask < 0.004) discard;

    // Turrell Ganzfeld column: a hot, desaturated near-white centerline that
    // falls off to a cooler tone at the vertical edges. cx: 0 at the spine, 1
    // at the left/right edge.
    float cx = abs(vUv.x - 0.5) * 2.0;
    vec3 tint = mix(uCore, uEdge, smoothstep(0.12, 1.0, cx));

    // Gentle vertical falloff so the ends read cooler/dimmer than the middle.
    float vgrad = 1.0 - 0.16 * abs(vUv.y - 0.5) * 2.0;
    // A tight hot spine down the centre that clears the bloom threshold.
    float hot = 1.0 + (1.0 - smoothstep(0.0, 0.34, cx)) * 0.55;

    vec3 rgb = tint * uIntensity * vgrad * hot;

    // View-depth fog, capped at 50% so the slots seat back but never die (the
    // short middle slot is the canary — it must stay bright).
    float fog = 1.0 - exp(-uFogDensity * uFogDensity * vFogDepth * vFogDepth);
    rgb = mix(rgb, uFogColor, fog * 0.5);

    gl_FragColor = vec4(rgb, mask);
  }
`;
