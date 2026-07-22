/**
 * Column light-shaft. A soft additive vertical quad sitting just behind each
 * portal column — a horizontal gaussian (the column of light) fading upward as
 * it disperses into the fog, broken up by slow noise so it reads volumetric,
 * not like a flat gel. This is the RESTRAINED replacement for the old
 * room-flooding green card: localised to the columns, very low opacity, so it
 * adds atmosphere and depth without turning the room green.
 */
export const SHAFT_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const SHAFT_FRAG = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform vec3 uColor;
  uniform float uOpacity;
  uniform float uTime;

  float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 34.345); return fract(p.x * p.y); }
  float vnoise(vec2 p){
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    float a = hash(i), b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0)), d = hash(i + vec2(1.0, 1.0));
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
  }

  void main() {
    // Soft column of light — TIGHT horizontal gaussian so each shaft hugs its
    // own column instead of merging into one broad upper-centre glow.
    float cx = (vUv.x - 0.5) * 2.0;
    float h = exp(-cx * cx * 9.0);
    // Rises from a soft foot and disperses toward the top.
    float foot = smoothstep(0.0, 0.14, vUv.y);
    float rise = smoothstep(1.0, 0.18, vUv.y);
    // Gentle volumetric breakup drifting upward.
    float n = vnoise(vec2(vUv.x * 3.0, vUv.y * 2.2 - uTime * 0.05));
    float a = h * foot * rise * (0.65 + 0.55 * n) * uOpacity;
    if (a < 0.002) discard;
    gl_FragColor = vec4(uColor, a);
  }
`;
