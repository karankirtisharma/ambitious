import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Color, Mesh, ShaderMaterial } from 'three';
import glowVert from './shaders/glow.vert.glsl?raw';
import glowFrag from './shaders/glow.frag.glsl?raw';
import { enableReflectLayer } from './layers';

// Opaque back wall far behind the portal — the soft procedural radial glow.
// Sits at z = -24 (local); the host's fogExp2 dissolves it into the void.
const W = 56;
const H = 26;

export function BackgroundGlow({ motion = 1 }: { motion?: number }) {
  const ref = useRef<Mesh>(null!);

  const material = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: glowVert,
        fragmentShader: glowFrag,
        uniforms: {
          uTime: { value: 0 },
          uMotion: { value: motion },
          uHaze: { value: new Color('#9fce22') }, // neon lime glow
          uDark: { value: new Color('#040505') }, // matches host COLORS.bg
          uAspect: { value: W / H },
        },
        depthWrite: true,
      }),
    [motion]
  );

  useEffect(() => {
    if (ref.current) enableReflectLayer(ref.current);
  }, []);

  useEffect(() => () => material.dispose(), [material]);

  useFrame(({ clock }) => {
    material.uniforms.uTime.value = clock.elapsedTime * motion;
  });

  return (
    <mesh ref={ref} position={[0, 2.0, -24]} material={material}>
      <planeGeometry args={[W, H]} />
    </mesh>
  );
}
