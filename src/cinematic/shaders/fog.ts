import { NOISE_GLSL } from './noise';

/**
 * Volumetric-looking floor fog. Not a true raymarch (too costly for a
 * background) — a horizontal card of animated fbm that only lifts where the
 * panels are, additive and cyan, so it reads as mist catching their light at
 * the waterline. Height/distance falloff keeps it hugging the floor.
 */
export const FOG_VERT = /* glsl */ `
  varying vec3 vWorldPos;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorldPos = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

export const FOG_FRAG = /* glsl */ `
  precision highp float;
  ${NOISE_GLSL}

  uniform float uTime;
  uniform vec3 uColor;
  uniform float uDensity;
  uniform vec3 uCameraPos;

  varying vec3 vWorldPos;
  varying vec2 vUv;

  void main() {
    vec2 wp = vWorldPos.xz;
    float t = uTime * 0.06;

    // Layered drifting fbm → soft billowing mist.
    float n = fbm(wp * 0.5 + vec2(t, -t * 0.7)) * 0.6
            + fbm(wp * 1.3 - vec2(t * 0.5, t)) * 0.4;
    n = smoothstep(-0.1, 0.7, n);

    // Concentrate near the centre band where the panels stand; thin out wide.
    float band = 1.0 - smoothstep(0.0, 4.5, abs(wp.x));
    band *= 1.0 - smoothstep(1.5, 6.0, abs(wp.y - 0.0));

    // Fade at the very front/back edges of the card so it has no hard border.
    float edge = smoothstep(0.0, 0.18, vUv.y) * (1.0 - smoothstep(0.82, 1.0, vUv.y));

    float a = n * band * edge * uDensity;
    if (a < 0.003) discard;
    gl_FragColor = vec4(uColor, a);
  }
`;
