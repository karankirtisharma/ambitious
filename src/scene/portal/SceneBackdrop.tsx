import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { BackSide, Color, ShaderMaterial } from 'three';

/**
 * Cinematic backdrop — the infinite architectural dark. A single inverted
 * sphere far out: a near-black void with an almost-invisible dark-green lift
 * low-center (the portal's ambient bleed) and a gentle animated fbm haze held
 * under 5% so it never competes with the foreground. One draw call, cheap
 * 4-octave value noise, tone-mapped with the frame.
 */
const BACKDROP_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const BACKDROP_FRAG = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform float uTime;
  uniform vec3 uBaseColor;
  uniform vec3 uAccentColor;

  float hash(vec2 p){
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 34.345);
    return fract(p.x * p.y);
  }
  float vnoise(vec2 p){
    vec2 i = floor(p), f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    float a = hash(i), b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0)), d = hash(i + vec2(1.0, 1.0));
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
  }
  float fbm(vec2 p){
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 4; i++){ v += a * vnoise(p); p = p * 2.02 + 11.7; a *= 0.5; }
    return v;
  }

  void main(){
    vec2 uv = vUv;
    vec3 col = uBaseColor;
    // top a touch darker than the floor
    col *= mix(0.55, 1.0, smoothstep(1.0, 0.0, uv.y));
    // subliminal dark-green lift, anchored low-center — kept truly subliminal
    // so the green stays an ACCENT, never an ambient wash on the backdrop.
    vec2 gp = uv - vec2(0.5, 0.16);
    gp.x *= 1.6;
    float glow = exp(-dot(gp, gp) * 6.5);
    col += uAccentColor * glow * 0.13;
    // animated haze, held tiny, strongest where the glow is
    float haze = fbm(uv * 3.0 + vec2(uTime * 0.015, uTime * 0.008)) - 0.5;
    col += uAccentColor * haze * 0.03 * (glow * 0.6 + 0.4);
    gl_FragColor = vec4(max(col, 0.0), 1.0);
  }
`;

export function SceneBackdrop() {
  const mat = useRef<ShaderMaterial>(null!);
  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uBaseColor: { value: new Color('#050607') },
      // Monochrome: a cool neutral lift, NOT green. Green is added later as an
      // accent only — the void reads architectural, not cyberpunk.
      uAccentColor: { value: new Color('#171c25') },
    }),
    []
  );

  useFrame(({ clock }) => {
    if (mat.current) mat.current.uniforms.uTime.value = clock.elapsedTime;
  });

  return (
    <mesh scale={[40, 40, 40]} renderOrder={-10}>
      <sphereGeometry args={[1, 32, 24]} />
      <shaderMaterial
        ref={mat}
        vertexShader={BACKDROP_VERT}
        fragmentShader={BACKDROP_FRAG}
        uniforms={uniforms}
        side={BackSide}
        depthWrite={false}
        fog={false}
      />
    </mesh>
  );
}
