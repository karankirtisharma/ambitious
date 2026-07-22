/**
 * All GLSL lives here as template literals — no build plugin required.
 * Everything emissive pushes luminance past the bloom threshold (0.68) so the
 * threshold pass does selective bloom for free.
 */

export const PLANE_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

/**
 * Soft radial contact shadow — grounds a platform onto the backplate's
 * painted floor. Without it, objects composited over a matte painting read
 * as stickers.
 */
export const CONTACT_FRAG = /* glsl */ `
  varying vec2 vUv;
  uniform float uStrength;
  void main() {
    float d = length(vUv - 0.5) * 2.0;
    float a = (1.0 - smoothstep(0.15, 1.0, d)) * uStrength;
    if (a < 0.004) discard;
    gl_FragColor = vec4(0.0, 0.0, 0.0, a);
  }
`;

/** Floor shockwave — a single expanding pulse on protocol initiation. */
export const SHOCK_FRAG = /* glsl */ `
  varying vec2 vUv;
  uniform float uPulse;   // 0 → 1 one-shot
  void main() {
    if (uPulse <= 0.001 || uPulse >= 0.999) discard;
    vec2 c = vUv - 0.5;
    float r = length(c) * 2.0;
    float radius = uPulse * 1.05;
    float band = smoothstep(radius - 0.12, radius, r) * (1.0 - smoothstep(radius, radius + 0.04, r));
    float fade = 1.0 - uPulse;
    vec3 green = vec3(0.69, 0.96, 0.27);
    gl_FragColor = vec4(green * 2.0, band * fade * 0.8);
  }
`;

/** Core glow — camera-facing radial gradient behind the DOM "+" button. */
export const CORE_FRAG = /* glsl */ `
  varying vec2 vUv;
  uniform float uTime;
  uniform float uIntensity;  // lightProxy.core-driven
  uniform float uEnergy;
  void main() {
    vec2 c = vUv - 0.5;
    float r = length(c) * 2.0;
    float breathe = 1.0 + 0.06 * sin(uTime * 1.3);
    float disc = 1.0 - smoothstep(0.0, 0.55 * breathe, r);
    float rim = smoothstep(0.42, 0.5, r) * (1.0 - smoothstep(0.5, 0.62, r));
    vec3 green = vec3(0.69, 0.96, 0.27);
    vec3 col = green * (disc * disc * 0.7 + rim * 1.6) * (0.25 + uIntensity * 0.5 + uEnergy);
    float a = clamp((disc * 0.55 + rim) * (0.15 + uIntensity * 0.35 + uEnergy * 0.6), 0.0, 1.0);
    gl_FragColor = vec4(col, a);
  }
`;

/** Energy bridge — particles flowing along an in-shader cubic Bézier. */
export const BRIDGE_VERT = /* glsl */ `
  attribute float aProgress;
  attribute float aSpeed;     // sign = direction of travel
  attribute float aSeed;
  uniform float uTime;
  uniform float uIntensity;
  uniform float uFlow;
  uniform float uTurbulence;
  uniform float uPixelRatio;
  uniform vec3 uP0;
  uniform vec3 uP1;
  uniform vec3 uP2;
  uniform vec3 uP3;
  varying float vSeed;
  varying float vEnvelope;
  varying float vIntensity;

  vec3 bez(float t) {
    float u = 1.0 - t;
    return u*u*u*uP0 + 3.0*u*u*t*uP1 + 3.0*u*t*t*uP2 + t*t*t*uP3;
  }

  void main() {
    float raw = fract(aProgress + uTime * abs(aSpeed) * uFlow);
    float t = aSpeed > 0.0 ? raw : 1.0 - raw;
    vec3 p = bez(t);

    // Pinched at the characters, bulging mid-span — the stream visibly
    // emanates from and enters the bodies.
    float env = sin(3.14159265 * t);

    float k = aSeed * 43.7;
    vec3 disp = vec3(
      sin(t * 21.0 + k + uTime * 2.1) + 0.5 * sin(t * 47.0 + k * 1.7 + uTime * 3.3),
      sin(t * 17.0 + k * 2.3 + uTime * 1.7) + 0.5 * sin(t * 39.0 + k + uTime * 2.9),
      sin(t * 25.0 + k * 3.1 + uTime * 2.5)
    );
    p += disp * (0.03 + 0.24 * uTurbulence) * env;

    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;

    float size = (1.6 + aSeed * 2.8) * (0.35 + 0.65 * uIntensity) * env;
    gl_PointSize = size * uPixelRatio * (300.0 / -mv.z);

    vSeed = aSeed;
    vEnvelope = env;
    vIntensity = uIntensity;
  }
`;

export const BRIDGE_FRAG = /* glsl */ `
  varying float vSeed;
  varying float vEnvelope;
  varying float vIntensity;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float glow = smoothstep(0.5, 0.05, d);
    glow *= glow;
    vec3 deep = vec3(0.06, 0.42, 0.2);
    vec3 hot = vec3(0.72, 1.0, 0.55);
    vec3 col = mix(deep, hot, glow * vIntensity);
    float a = glow * vIntensity * vEnvelope;
    if (a < 0.01) discard;
    gl_FragColor = vec4(col * (1.0 + vIntensity), a);
  }
`;

/** Orbit particles around the protocol core (hover anticipation). */
export const ORBIT_VERT = /* glsl */ `
  attribute float aSeed;
  uniform float uTime;
  uniform float uOrbit;
  uniform float uPixelRatio;
  uniform vec3 uCenter;
  varying float vAlpha;
  void main() {
    float ang = aSeed * 6.28318 + uTime * (0.35 + aSeed * 0.5);
    float rad = 0.3 + aSeed * 0.26 + 0.03 * sin(uTime * 2.0 + aSeed * 20.0);
    float tilt = (aSeed - 0.5) * 0.5;
    vec3 p = uCenter + vec3(cos(ang) * rad, sin(ang * 1.7 + aSeed * 9.0) * 0.09 + tilt * 0.12, sin(ang) * rad * 0.55);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = (1.2 + aSeed * 1.8) * uOrbit * uPixelRatio * (300.0 / -mv.z);
    vAlpha = uOrbit * (0.35 + 0.65 * fract(aSeed * 7.31));
  }
`;

export const ORBIT_FRAG = /* glsl */ `
  varying float vAlpha;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float glow = smoothstep(0.5, 0.1, d);
    if (glow * vAlpha < 0.01) discard;
    gl_FragColor = vec4(vec3(0.69, 0.96, 0.27) * 1.4, glow * vAlpha);
  }
`;

/** Ambient dust — sells volumetric air for near-zero cost. */
export const DUST_VERT = /* glsl */ `
  attribute float aSeed;
  uniform float uTime;
  uniform float uPixelRatio;
  varying float vAlpha;
  void main() {
    vec3 p = position;
    p.y = mod(p.y + uTime * (0.018 + aSeed * 0.03), 5.0);
    p.x += sin(uTime * 0.12 + aSeed * 40.0) * 0.12;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = min((0.5 + aSeed * 0.9) * uPixelRatio * (22.0 / -mv.z), 26.0 * uPixelRatio);
    // Fade motes that drift too close to the dolly — no blobs across lenses.
    float nearFade = smoothstep(0.4, 1.6, -mv.z);
    vAlpha = (0.05 + 0.08 * sin(uTime * 0.6 + aSeed * 31.0)) * nearFade;
  }
`;

export const DUST_FRAG = /* glsl */ `
  varying float vAlpha;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float glow = smoothstep(0.5, 0.15, d);
    if (glow * vAlpha < 0.01) discard;
    gl_FragColor = vec4(vec3(0.75, 0.8, 0.76), glow * vAlpha);
  }
`;
