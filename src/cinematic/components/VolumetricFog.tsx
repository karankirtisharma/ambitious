import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { AdditiveBlending, Color, ShaderMaterial, Vector3 } from 'three';
import { FOG_VERT, FOG_FRAG } from '../shaders/fog';

/**
 * Ground mist at the waterline. A single horizontal card of animated fbm,
 * additive and cyan, concentrated in the centre band where the panels stand.
 * One draw call, no overdraw stack.
 */
export function VolumetricFog() {
  const mat = useRef<ShaderMaterial>(null!);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uColor: { value: new Color('#31688a') },
      uDensity: { value: 0.4 },
      uCameraPos: { value: new Vector3() },
    }),
    []
  );

  useFrame(({ clock }) => {
    if (mat.current) mat.current.uniforms.uTime.value = clock.elapsedTime;
  });

  return (
    <mesh rotation-x={-Math.PI / 2} position-y={0.06}>
      <planeGeometry args={[24, 14]} />
      <shaderMaterial
        ref={mat}
        vertexShader={FOG_VERT}
        fragmentShader={FOG_FRAG}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        blending={AdditiveBlending}
      />
    </mesh>
  );
}
