import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import { Color, Group, Mesh, MeshStandardMaterial } from 'three';
import { easing } from 'maath';
import type { Side } from '../state/transitions';
import { send, useStore } from '../state/store';
import { lightProxy } from '../motion/proxies';
import { CHAR_X, STAND_Y } from '../config/cameraPoses';
import { useProceduralIdle } from '../hooks/useProceduralIdle';
import { hoverEnter, hoverLeave } from './hoverIntent';
import { scanProxy, SCAN_RADIUS_RATIO } from './scanProxy';
import { createScanUniforms, patchScanMaterial } from './scanMaterial';

// BASE_URL-aware: the site may be served from a subpath (GitHub Pages).
const MODEL_URL: Record<Side, string> = {
  cypherpunk: `${import.meta.env.BASE_URL}models/cypherpunk.glb`,
  astronaut: `${import.meta.env.BASE_URL}models/astronaut.glb`,
};

useGLTF.preload(MODEL_URL.cypherpunk);
useGLTF.preload(MODEL_URL.astronaut);

/**
 * Each Tripo export has its own baked "forward" — a static correction so
 * both models face the camera at rest, independent of any animated rotation.
 */
const MODEL_YAW: Record<Side, number> = { cypherpunk: 0, astronaut: Math.PI / 2 };

/** Only the cypherpunk carries an anatomy layer beneath his skin. */
const ANATOMY_URL = `${import.meta.env.BASE_URL}models/anatomy.glb`;
useGLTF.preload(ANATOMY_URL);

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
  const scannable = isLeft;

  const root = useRef<Group>(null);
  const breath = useRef<Group>(null);
  const sway = useRef<Group>(null);
  const applied = useRef(-1);

  // One uniform object shared by the body's cutaway and the anatomy's
  // reveal, so the two halves of the lens can never disagree.
  const scanUniforms = useMemo(() => createScanUniforms(), []);

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
        if (scannable) patchScanMaterial(std, 'cutaway', scanUniforms);
        recs.push({ material: std, original, dimmed });
      }
    });
    return recs;
  }, [scene, scannable, scanUniforms]);

  useProceduralIdle(
    { root, breath, sway },
    { side: isLeft ? 'left' : 'right', phase: isLeft ? 0 : 2.7, baseY: STAND_Y[side] }
  );

  const anatomy = useAnatomy(scannable, scanUniforms);
  useScanLens(scannable, scanUniforms, anatomy);

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
            <group rotation-y={MODEL_YAW[side]}>
              {/* Anatomy sits inside the same transform stack as the body,
                  so it breathes, sways and turns with him — the lens can
                  never slide off the thing it is scanning. */}
              {anatomy && <primitive object={anatomy} />}
              <primitive object={scene} />
            </group>
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

/**
 * Tripo decomposes generated hands into a cluster of tiny sub-meshes, and on
 * this asset they're malformed — blobby, fingerless. Identified once via a
 * bounding-box sweep (extreme lateral offset, narrow waist-height band) and
 * hidden by name, which survives the GLTF loader intact.
 */
const HAND_MESH_NAMES = new Set([
  'tripo_part_14', 'tripo_part_17', 'tripo_part_20', 'tripo_part_25', 'tripo_part_27',
  'tripo_part_29', 'tripo_part_33', 'tripo_part_36', 'tripo_part_37', 'tripo_part_40',
]);

/**
 * The anatomy beneath the skin. Cloned so the cached GLTF is never mutated,
 * and patched to exist only inside the lens.
 */
function useAnatomy(enabled: boolean, uniforms: ReturnType<typeof createScanUniforms>) {
  const { scene: raw } = useGLTF(ANATOMY_URL);

  return useMemo(() => {
    if (!enabled) return null;
    const clone = raw.clone(true);
    clone.traverse((obj) => {
      if (!(obj as Mesh).isMesh) return;
      const mesh = obj as Mesh;
      if (HAND_MESH_NAMES.has(mesh.name)) {
        mesh.visible = false;
        return;
      }
      mesh.raycast = () => {};
      // Draw before the body so the body's cutaway reads as a hole rather
      // than the anatomy being painted on top of him.
      mesh.renderOrder = -1;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      mesh.material = mats.map((m) => {
        const cloned = (m as MeshStandardMaterial).clone();
        patchScanMaterial(cloned, 'reveal', uniforms);
        return cloned;
      }) as unknown as MeshStandardMaterial;
      if (!Array.isArray(mats) || mats.length === 1) {
        mesh.material = (mesh.material as unknown as MeshStandardMaterial[])[0];
      }
    });
    clone.visible = false;
    return clone;
  }, [raw, enabled, uniforms]);
}

/**
 * Drives the lens: the circle eases open while this character holds focus
 * and closes the moment he loses it, and its centre damps toward the cursor
 * so the scan trails the hand rather than snapping to it.
 */
function useScanLens(
  enabled: boolean,
  uniforms: ReturnType<typeof createScanUniforms>,
  anatomy: Group | null
) {
  const gl = useThree((s) => s.gl);

  // The DOM ring lives in CSS pixels; publish the same centre for it.
  useEffect(() => {
    if (!enabled) return;
    return () => {
      const root = document.documentElement.style;
      root.setProperty('--scan-r', '0px');
    };
  }, [enabled]);

  useFrame(({ pointer, size }, dt) => {
    if (!enabled) return;

    const scene = useStore.getState().scene;
    const open = scene === 'hoverCypherpunk' && !useStore.getState().reducedMotion;
    const dpr = gl.getPixelRatio();

    // Pointer is normalised (-1..1, y up). gl_FragCoord is in drawing-buffer
    // pixels with y up from the bottom — so this maps directly.
    const targetX = (pointer.x * 0.5 + 0.5) * size.width * dpr;
    const targetY = (pointer.y * 0.5 + 0.5) * size.height * dpr;

    if (!scanProxy.primed) {
      scanProxy.x = targetX;
      scanProxy.y = targetY;
      scanProxy.primed = true;
    }

    // Trail the cursor rather than tracking it rigidly — the lens has mass.
    easing.damp(scanProxy, 'x', targetX, 0.055, dt);
    easing.damp(scanProxy, 'y', targetY, 0.055, dt);

    const fullRadius = Math.min(size.width, size.height) * dpr * SCAN_RADIUS_RATIO;
    easing.damp(scanProxy, 'radius', open ? fullRadius : 0, open ? 0.16 : 0.12, dt);

    uniforms.uScanCenter.value.set(scanProxy.x, scanProxy.y, 0);
    uniforms.uScanRadius.value = scanProxy.radius;

    // Skip the anatomy's draw calls entirely while the lens is shut.
    if (anatomy) anatomy.visible = scanProxy.radius > 0.5;

    // Publish to CSS in logical pixels, y measured from the top.
    const root = document.documentElement.style;
    root.setProperty('--scan-x', `${(scanProxy.x / dpr).toFixed(1)}px`);
    root.setProperty('--scan-y', `${(size.height - scanProxy.y / dpr).toFixed(1)}px`);
    root.setProperty('--scan-r', `${(scanProxy.radius / dpr).toFixed(1)}px`);
  });
}
