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
import { Anatomy } from './xray/Anatomy';
import { beginDrag, createSpin, wasDrag } from './dragSpin';
import { patchXrayMaterial } from './xray/patchXrayMaterial';
import { XrayDriver } from './xray/useXrayDriver';
import { setLensHover } from './xray/lensUniforms';
import { DEBUG_FLAGS } from '../debugFlags';

// The X-ray lens lives on the cypherpunk figure (its anatomy underlay exists).
const XRAY_ENABLED = DEBUG_FLAGS.xray !== 'off';

// BASE_URL-aware: the site may be served from a subpath (GitHub Pages).
const MODEL_URL: Record<Side, string> = {
  cypherpunk: `${import.meta.env.BASE_URL}models/cypherpunk.glb`,
  astronaut: `${import.meta.env.BASE_URL}models/astronaut.glb`,
};

useGLTF.preload(MODEL_URL.cypherpunk);
useGLTF.preload(MODEL_URL.astronaut);

/** Breath pivots from the pelvis so feet stay planted. */
const PIVOT_Y = 0.95;

/** Authoring correction so each GLB faces the camera by default. The
 *  astronaut asset is modelled facing +X (side-on); rotate it to front. */
const BASE_YAW: Record<Side, number> = { cypherpunk: 0, astronaut: Math.PI / 2 };

interface MaterialRecord {
  material: MeshStandardMaterial;
  original: Color;
  dimmed: Color;
}

export function Character({ side }: { side: Side }) {
  const isLeft = side === 'cypherpunk';
  const xray = isLeft && XRAY_ENABLED;
  const { scene } = useGLTF(MODEL_URL[side]);

  const root = useRef<Group>(null);
  const breath = useRef<Group>(null);
  const sway = useRef<Group>(null);
  const applied = useRef(-1);
  // Per-model drag layer — this character's spin never touches the other's,
  // nor the platform's.
  const spin = useRef(createSpin()).current;

  const records = useMemo<MaterialRecord[]>(() => {
    const recs: MaterialRecord[] = [];
    scene.traverse((obj) => {
      if (!(obj as Mesh).isMesh) return;
      const mesh = obj as Mesh;
      // Never raycast 260k-triangle geometry; the capsule hitbox owns events.
      mesh.raycast = () => {};
      // The key is the single shadow caster — a real contact shadow grounds
      // the figure. Self-receive stays off (normalBias covers acne anyway,
      // but the monochrome look wants clean planes, not self-shadow noise).
      mesh.castShadow = true;
      mesh.receiveShadow = false;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const mat of mats) {
        const std = mat as MeshStandardMaterial;
        if (!std.color) continue;
        // Tripo occasionally leaves transparency flags on; force opaque.
        std.transparent = false;
        std.depthWrite = true;
        // Specular gets somewhere to form against the dark env: push the
        // env response hard, pull roughness down into the clamp band, keep
        // metalness physical.
        std.envMapIntensity = 2.4;
        std.roughness = Math.min(Math.max(std.roughness * 0.82, 0.12), 0.7);
        std.metalness = Math.min(std.metalness, 0.85);
        // The lens needs a per-fragment hole, so the body's shell fades to
        // transparent INSIDE the window. Patch overrides the opaque flags
        // above (transparent=true, depthWrite kept for scene sorting).
        if (xray) patchXrayMaterial(std, 'body');
        const original = std.color.clone();
        // De-emphasis: ~65% toward greyscale, then darkened — attention
        // moved away, not "this thing broke".
        const lum = original.r * 0.299 + original.g * 0.587 + original.b * 0.114;
        const dimmed = original
          .clone()
          .lerp(new Color(lum, lum, lum), 0.65)
          .multiplyScalar(0.6);
        recs.push({ material: std, original, dimmed });
      }
    });
    return recs;
  }, [scene, xray]);

  useProceduralIdle(
    { root, breath, sway },
    {
      side: isLeft ? 'left' : 'right',
      phase: isLeft ? 0 : 2.7,
      baseY: STAND_Y[side],
      baseYaw: BASE_YAW[side],
      spin,
    }
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
      {xray && <XrayDriver />}
      <group ref={breath} position-y={PIVOT_Y}>
        <group position-y={-PIVOT_Y}>
          <group ref={sway}>
            {/* Anatomy shares this exact transform, so breath/sway/lean move
                both as one — the lens can never slide off what it scans. */}
            {xray && <Anatomy />}
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
          if (xray) setLensHover(true);
        }}
        onPointerOut={() => {
          hoverLeave();
          if (xray) setLensHover(false);
        }}
        onPointerDown={(e) => {
          e.stopPropagation();
          beginDrag(spin, e.clientX);
        }}
        onClick={(e) => {
          e.stopPropagation();
          // A drag that ended on the capsule is not a click.
          if (wasDrag(spin)) return;
          document.body.style.cursor = '';
          send({ type: 'CLICK_CHAR', side });
        }}
      >
        <capsuleGeometry args={[0.42, 1.05, 4, 12]} />
      </mesh>
    </group>
  );
}
