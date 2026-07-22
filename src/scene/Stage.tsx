import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { AdditiveBlending, BufferGeometry, Float32BufferAttribute, ShaderMaterial } from 'three';
import { DUST_VERT, DUST_FRAG } from './shaders';

/**
 * The clean stage: just drifting dust now. The floor was removed by request —
 * the characters and pedestals read against the background/void directly, which
 * the art direction prefers over a reflective plane.
 *
 * Deliberately NO live planar reflection: a reflection pass re-renders the
 * characters into a secondary framebuffer, and the x-ray lens (which reads
 * gl_FragCoord in MAIN-framebuffer space) would evaluate in the wrong space
 * there and glitch the anatomy reveal. A single main pass keeps the hover clean.
 */
export function Stage() {
  return <Dust />;
}

const DUST_COUNT = 300;

function Dust() {
  const material = useRef<ShaderMaterial>(null!);

  const geometry = useMemo(() => {
    const geo = new BufferGeometry();
    const pos = new Float32Array(DUST_COUNT * 3);
    const seed = new Float32Array(DUST_COUNT);
    for (let i = 0; i < DUST_COUNT; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 16;
      pos[i * 3 + 1] = Math.random() * 5;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 10;
      seed[i] = Math.random();
    }
    geo.setAttribute('position', new Float32BufferAttribute(pos, 3));
    geo.setAttribute('aSeed', new Float32BufferAttribute(seed, 1));
    return geo;
  }, []);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
    }),
    []
  );

  useFrame(({ clock, gl }) => {
    material.current.uniforms.uTime.value = clock.elapsedTime;
    material.current.uniforms.uPixelRatio.value = gl.getPixelRatio();
  });

  return (
    <points geometry={geometry} frustumCulled={false}>
      <shaderMaterial
        ref={material}
        vertexShader={DUST_VERT}
        fragmentShader={DUST_FRAG}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        blending={AdditiveBlending}
      />
    </points>
  );
}
