import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { AdditiveBlending, Color, Mesh, ShaderMaterial, Vector2 } from 'three';
import portalVert from './shaders/portal.vert.glsl?raw';
import portalFrag from './shaders/portal.frag.glsl?raw';
import { enableReflectLayer } from './layers';

/**
 * The three glowing bars — the HDR light source.
 *
 * Bar geometry values are the final tuned defaults (the standalone build's
 * live slider panel is intentionally dropped for the port). The material is
 * `toneMapped = false` and the core is pushed well past 1.0 so the HOST's
 * bloom (threshold ≈ 0.9) picks it up — this replaces the standalone PostFX
 * bloom. Additive blend + no depth-write, like the original.
 */
export interface PortalProps {
  motion?: number;
  /** Core HDR intensity — must stay > ~1 to feed host bloom. */
  intensity?: number;
  /** Emissive core colour (kept near-white). */
  color?: string;
  /** Lime edge-glow colour — match host COLORS.green. */
  glowColor?: string;
}

export function Portal({
  motion = 1,
  intensity = 5.5,
  color = '#ffffff',
  glowColor = '#b8ff2a', // neon lime — matches the standalone liquid scene exactly
}: PortalProps) {
  const ref = useRef<Mesh>(null!);

  const material = useMemo(() => {
    const m = new ShaderMaterial({
      vertexShader: portalVert,
      fragmentShader: portalFrag,
      uniforms: {
        uTime: { value: 0 },
        uMotion: { value: motion },
        uIntensity: { value: intensity },
        uColor: { value: new Color(color) },
        uGlowColor: { value: new Color(glowColor) },
        // Baked final bar geometry (was the slider panel's defaults).
        uBarWidth: { value: 0.1 },
        uBarHeight: { value: 0.7 },
        uBarSpacing: { value: 0.4 },
        uBarOffset: { value: new Vector2(0, 0) },
        uBarRound: { value: 0.015 },
      },
      transparent: true,
      blending: AdditiveBlending,
      depthWrite: false,
    });
    // Do NOT let the renderer tone-map this — the host composer owns tone
    // mapping (AgX) and reads a linear-HDR buffer; keeping values > 1 here is
    // what makes the host bloom bloom.
    m.toneMapped = false;
    return m;
  }, [motion, intensity, color, glowColor]);

  useEffect(() => {
    if (ref.current) enableReflectLayer(ref.current);
  }, []);

  useEffect(() => () => material.dispose(), [material]);

  useFrame(({ clock }) => {
    material.uniforms.uTime.value = clock.elapsedTime * motion;
  });

  return (
    <mesh ref={ref} position={[0, 1.98, -14]} material={material}>
      <planeGeometry args={[6.4, 6.4]} />
    </mesh>
  );
}
