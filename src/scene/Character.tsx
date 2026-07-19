import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import { Color, Group, Mesh, MeshStandardMaterial } from 'three';
import type { Side } from '../state/transitions';
import { send } from '../state/store';
import { lightProxy } from '../motion/proxies';
import { CHAR_X, STAND_Y } from '../config/cameraPoses';
import { useProceduralIdle } from '../hooks/useProceduralIdle';
import { hoverEnter, hoverLeave } from './hoverIntent';

// BASE_URL-aware: the site may be served from a subpath (GitHub Pages).
const MODEL_URL: Record<Side, string> = {
  cypherpunk: `${import.meta.env.BASE_URL}models/cypherpunk.glb`,
  astronaut: `${import.meta.env.BASE_URL}models/astronaut.glb`,
};

useGLTF.preload(MODEL_URL.cypherpunk);
useGLTF.preload(MODEL_URL.astronaut);

/** Breath pivots from the pelvis so feet stay planted. */
const PIVOT_Y = 0.95;

interface MaterialRecord {
  material: MeshStandardMaterial;
  original: Color;
  dimmed: Color;
}

export function Character({ side }: { side: Side }) {
  const isLeft = side === 'cypherpunk';
  const { scene } = useGLTF(MODEL_URL[side]);

  const root = useRef<Group>(null);
  const breath = useRef<Group>(null);
  const sway = useRef<Group>(null);
  const applied = useRef(-1);

  const records = useMemo<MaterialRecord[]>(() => {
    const recs: MaterialRecord[] = [];
    scene.traverse((obj) => {
      if (!(obj as Mesh).isMesh) return;
      const mesh = obj as Mesh;
      // Never raycast 260k-triangle geometry; the capsule hitbox owns events.
      mesh.raycast = () => {};
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const mat of mats) {
        const std = mat as MeshStandardMaterial;
        if (!std.color) continue;
        // Tripo occasionally leaves transparency flags on; force opaque.
        std.transparent = false;
        std.depthWrite = true;
        const original = std.color.clone();
        // De-emphasis target: the color pulled toward its own darkened
        // luminance — reads as an exposure/saturation drop.
        const lum = original.r * 0.299 + original.g * 0.587 + original.b * 0.114;
        const dimmed = new Color(lum, lum, lum).lerp(new Color('#0a0c0a'), 0.55);
        recs.push({ material: std, original, dimmed });
      }
    });
    return recs;
  }, [scene]);

  useProceduralIdle(
    { root, breath, sway },
    { side: isLeft ? 'left' : 'right', phase: isLeft ? 0 : 2.7, baseY: STAND_Y[side] }
  );

  // Apply the conductor-tweened dim value — only while it is actually moving.
  useFrame(() => {
    const dim = isLeft ? lightProxy.dimL : lightProxy.dimR;
    if (Math.abs(dim - applied.current) < 0.002) return;
    applied.current = dim;
    for (const rec of records) {
      rec.material.color.lerpColors(rec.original, rec.dimmed, dim);
    }
  });

  return (
    <group ref={root} position={[isLeft ? -CHAR_X : CHAR_X, STAND_Y[side], 0]}>
      <group ref={breath} position-y={PIVOT_Y}>
        <group position-y={-PIVOT_Y}>
          <group ref={sway}>
            <primitive object={scene} />
          </group>
        </group>
      </group>

      {/* Invisible hitbox on raycast layer 1 — the only thing the pointer sees. */}
      <mesh
        visible={false}
        layers={1}
        position={[0, 0.92, 0]}
        onPointerOver={(e) => {
          e.stopPropagation();
          hoverEnter(side);
        }}
        onPointerOut={() => hoverLeave()}
        onClick={(e) => {
          e.stopPropagation();
          document.body.style.cursor = '';
          send({ type: 'CLICK_CHAR', side });
        }}
      >
        <capsuleGeometry args={[0.42, 1.05, 4, 12]} />
      </mesh>
    </group>
  );
}
