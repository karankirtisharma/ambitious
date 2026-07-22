import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import { Mesh, MeshStandardMaterial } from 'three';
import { PLANE_VERT, CONTACT_FRAG } from './shaders';
import { HaloRings } from './HaloRings';
import { CHAR_X } from '../config/cameraPoses';
import { beginDrag, createSpin, stepSpin } from './dragSpin';
import type { Group } from 'three';

const PLATFORM_URL = `${import.meta.env.BASE_URL}models/platform.glb`;
useGLTF.preload(PLATFORM_URL);

/**
 * The pedestal: a real platform model, plus the emissive floor halo whose
 * color carries the state story — cool white at rest, protocol green when its
 * character is recognized or the sequence runs.
 */
export function Pedestal({ side }: { side: 'left' | 'right' }) {
  const rotor = useRef<Group>(null);
  // The platform's OWN spin layer — independent of its character's.
  const spin = useRef(createSpin()).current;
  const x = side === 'left' ? -CHAR_X : CHAR_X;
  const { scene } = useGLTF(PLATFORM_URL);

  // Two pedestals share one GLB — each side renders its own clone.
  const platform = useMemo(() => {
    const clone = scene.clone(true);
    clone.traverse((obj) => {
      if (!(obj as Mesh).isMesh) return;
      const mesh = obj as Mesh;
      mesh.raycast = () => {};
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const mat of mats) {
        const std = mat as MeshStandardMaterial;
        if (!std.color) continue;
        // Both pedestals share ONE cached GLB (scene.clone shares material
        // refs), so guard the tuning to run exactly once per material —
        // otherwise the non-idempotent `roughness *= 0.82` compounds across the
        // two sides and every HMR, leaving the deck glossier than authored.
        if (std.userData.pedestalTuned) continue;
        std.userData.pedestalTuned = true;
        std.transparent = false;
        std.depthWrite = true;
        // Same specular treatment as the characters — the platform reflects
        // the void it stands in.
        std.envMapIntensity = 2.4;
        std.roughness = Math.min(Math.max(std.roughness * 0.82, 0.12), 0.7);
        std.metalness = Math.min(std.metalness, 0.85);
        // The GLB ships hot green emissive on the deck — it blew the platform
        // top out to lime. Capped so the glow reads as ring LEDs, not a pool.
        if (std.emissive && std.emissiveIntensity > 0.45) {
          std.emissiveIntensity = 0.45;
        }
      }
    });
    return clone;
  }, [scene]);

  const shadowUniforms = useMemo(() => ({ uStrength: { value: 0.72 } }), []);

  useFrame(() => {
    stepSpin(spin);
    if (rotor.current) rotor.current.rotation.y = spin.userYaw;
  });

  return (
    <group position={[x, 0, 0]}>
      {/* Occlusion pooling under the platform — without it the composite
          reads as a sticker on the backplate rather than a thing standing
          on its floor. Drawn first so the halo glows over it. */}
      <mesh rotation-x={-Math.PI / 2} position-y={0.004} renderOrder={-2}>
        <planeGeometry args={[4.2, 4.2]} />
        <shaderMaterial
          vertexShader={PLANE_VERT}
          fragmentShader={CONTACT_FRAG}
          uniforms={shadowUniforms}
          transparent
          depthWrite={false}
        />
      </mesh>
      <group ref={rotor}>
        <primitive object={platform} />
      </group>
      {/* The platform's own pick target — dragging it never touches the
          character's spin, and vice versa. */}
      <mesh
        visible={false}
        layers={1}
        position={[0, 0.22, 0]}
        onPointerDown={(e) => {
          e.stopPropagation();
          beginDrag(spin, e.clientX);
        }}
      >
        <cylinderGeometry args={[1.2, 1.35, 0.5, 16]} />
      </mesh>
      {/* Halo rings + glow pool — sized off the platform width. */}
      <HaloRings side={side} />
    </group>
  );
}
