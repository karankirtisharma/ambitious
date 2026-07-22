import { NOISE_GLSL } from './noise';

/**
 * Reflective water floor. A real planar reflection (rendered from a mirrored
 * camera into an FBO by ReflectiveWater.tsx) sampled through procedurally
 * rippled UVs, blended by Fresnel over a near-black base, faded to black at
 * the horizon so the floor reads as infinite.
 */
export const WATER_VERT = /* glsl */ `
  uniform mat4 uTextureMatrix;
  varying vec4 vReflCoord;
  varying vec3 vWorldPos;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorldPos = wp.xyz;
    vReflCoord = uTextureMatrix * wp;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

export const WATER_FRAG = /* glsl */ `
  precision highp float;
  ${NOISE_GLSL}

  uniform sampler2D uReflection;
  uniform float uTime;
  uniform vec3 uCameraPos;
  uniform vec3 uBaseColor;
  uniform vec3 uTint;        // faint colour lifted into the reflection
  uniform float uRipple;     // ripple amplitude (kept tiny)
  uniform float uFadeNear;
  uniform float uFadeFar;

  varying vec4 vReflCoord;
  varying vec3 vWorldPos;

  void main() {
    vec2 wp = vWorldPos.xz;

    // STATIC wet marble — ZERO animation. A single animated term reinstates the
    // "liquid" pool read at any amplitude, so there are no uTime terms here. A
    // vertical-dominant static vein distorts the reflection just enough to read
    // as wet stone; horizontal is 12% of vertical so column reflections streak
    // straight DOWN and stay glued to their base instead of wobbling sideways.
    float vein = fbm(wp * 0.6) * 0.6 + fbm(wp * 2.3) * 0.25;
    vec2 ripple = vec2(vein * 0.12, vein) * uRipple;

    vec2 uv = vReflCoord.xy / max(vReflCoord.w, 1e-4);

    // Wet marble: vertical smear + a short roughness blur that grows with
    // distance so highlights streak and soften. 4 taps.
    vec3 viewDir = normalize(uCameraPos - vWorldPos);
    float fres = pow(1.0 - clamp(viewDir.y, 0.0, 1.0), 3.0);
    float dist = length(wp - uCameraPos.xz);
    float blur = (0.0016 + dist * 0.00012) * (0.6 + fres);
    vec2 dv = vec2(0.0, blur);
    vec3 refl = (
        texture2D(uReflection, uv + ripple).rgb * 0.4
      + texture2D(uReflection, uv + ripple + dv).rgb * 0.25
      + texture2D(uReflection, uv + ripple - dv).rgb * 0.2
      + texture2D(uReflection, uv + ripple + dv * 2.2).rgb * 0.15) * 1.35;

    // Distance roughness. Far reflections shed energy/colour toward the tinted
    // base so the floor gains aerial depth instead of mirroring to the horizon.
    float far = smoothstep(uFadeNear * 0.35, uFadeFar, dist);
    refl = mix(refl, uBaseColor + uTint * 0.5, far * 0.55);

    // Wet BLACK marble, not a grey pond: crush dim reflections toward black so
    // only genuinely bright sources (portal columns, hot rims, pedestal rings)
    // streak across the floor. The mid-grey scene stops muddying it.
    float rlum = dot(refl, vec3(0.2126, 0.7152, 0.0722));
    refl *= smoothstep(0.03, 0.32, rlum);

    // obsidian, not a mirror. 40-60% of source so the real portal stays the
    // single brightest object and the reflection never out-blooms it.
    float reflStrength = mix(0.30, 0.62, fres);
    vec3 col = mix(uBaseColor, refl + uTint * refl.b, reflStrength);

    // Specular kick where a bright source lands, broken by the STATIC vein (not
    // animated phase) so it glints on the wet stone without shimmering.
    float lum = dot(refl, vec3(0.2126, 0.7152, 0.0722));
    float spark = smoothstep(0.55, 0.95, lum);
    col += refl * (spark * fres * (0.5 + 0.5 * vein) * 0.35);

    // Infinite-floor fade to black (dist reused from above).
    col *= 1.0 - smoothstep(uFadeNear, uFadeFar, dist);

    gl_FragColor = vec4(col, 1.0);
  }
`;
