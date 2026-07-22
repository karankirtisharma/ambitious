import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  AdditiveBlending,
  CanvasTexture,
  Color,
  DoubleSide,
  Mesh,
  MeshBasicMaterial,
} from 'three';
import { lightProxy, fxProxy } from '../motion/proxies';
import { COLORS } from '../config/lightingPresets';

/**
 * Podium halo — three flat additive torus rings + a normal-blend glow pool,
 * all sized off the platform width. The rings glow (blow toward white against
 * the dark floor); the pool sits nearly invisible at rest and takes the
 * accent only as hover eases in. Radii/tubes scale from the spec's 1.62m
 * reference to our normalized platform.
 */

// Our platform normalizes to ~2.3 footprint; spec authored against 1.62.
const WIDTH = 2.3;
const PLATFORM_H = 0.35;
const TUBE_K = WIDTH / 1.62;

const RINGS = [
  { r: 0.82 * WIDTH, tube: 0.011 * TUBE_K, y: 0.012, op: 0.95, spin: 0.22, recolor: true },
  { r: 0.63 * WIDTH, tube: 0.009 * TUBE_K, y: 0.014, op: 0.8, spin: -0.17, recolor: true },
  { r: 0.46 * WIDTH, tube: 0.007 * TUBE_K, y: 0.66 * PLATFORM_H, op: 0.75, spin: -0.31, recolor: false },
] as const;

/** Rest ring/pool colors — neutral ink-white, never coloured until hover. */
const RING_BASE = new Color('#dfe6ee');
const INNER_ANCHOR = new Color('#eef4fb');
const POOL_REST = new Color('#c9d2dc');

function makePoolTexture(): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  g.addColorStop(0, 'rgba(255,255,255,0.55)');
  g.addColorStop(0.45, 'rgba(255,255,255,0.18)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 256, 256);
  return new CanvasTexture(c);
}

export function HaloRings({ side }: { side: 'left' | 'right' }) {
  const outer = useRef<Mesh>(null!);
  const outer2 = useRef<Mesh>(null!);
  const inner = useRef<Mesh>(null!);
  const pool = useRef<Mesh>(null!);

  const poolTex = useMemo(makePoolTexture, []);
  // GPU-backed CanvasTexture — free it on unmount (dev HMR remounts leak it).
  useEffect(() => () => poolTex.dispose(), [poolTex]);
  // Non-round phase per side so left/right rings never visibly sync.
  const phase = useMemo(() => (side === 'left' ? 0 : 1) * 1.7, [side]);
  const accent = useMemo(() => new Color(side === 'left' ? COLORS.accentL : COLORS.accentR), [side]);
  const scratch = useMemo(() => new Color(), []);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    // Unrolled — no per-frame array/closure allocation in this hot path.
    if (outer.current) outer.current.rotation.z = t * RINGS[0].spin + phase;
    if (outer2.current) outer2.current.rotation.z = t * RINGS[1].spin + phase;
    if (inner.current) inner.current.rotation.z = t * RINGS[2].spin + phase;

    // Hover amount = this side's accent channel (eased by the conductor).
    const hover = side === 'left' ? lightProxy.accentL : lightProxy.accentR;
    // The protocol energy also lights the rings up.
    const lit = Math.min(hover + fxProxy.uEnergy, 1);

    const outerCol = scratch.copy(RING_BASE).lerp(accent, hover * 0.6);
    (outer.current.material as MeshBasicMaterial).color.copy(outerCol);
    (outer2.current.material as MeshBasicMaterial).color.copy(outerCol);
    // inner stays the bright near-white anchor — never recolors.

    // Glow visibility follows hover + protocol.
    const om = outer.current.material as MeshBasicMaterial;
    const o2m = outer2.current.material as MeshBasicMaterial;
    om.opacity = RINGS[0].op * (0.45 + 0.55 * lit);
    o2m.opacity = RINGS[1].op * (0.45 + 0.55 * lit);

    const pm = pool.current.material as MeshBasicMaterial;
    pm.color.copy(POOL_REST).lerp(accent, hover);
    pm.opacity = hover * 0.8;
  });

  return (
    <group>
      {/* Glow pool — normal blend, invisible at rest. */}
      <mesh ref={pool} rotation-x={-Math.PI / 2} position-y={0.006}>
        <planeGeometry args={[1.35 * WIDTH, 1.35 * WIDTH]} />
        <meshBasicMaterial
          map={poolTex}
          transparent
          opacity={0}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>

      {RINGS.map((ring, i) => (
        <mesh
          key={i}
          ref={i === 0 ? outer : i === 1 ? outer2 : inner}
          rotation-x={-Math.PI / 2}
          position-y={ring.y}
        >
          <torusGeometry args={[ring.r, ring.tube, 8, 128]} />
          <meshBasicMaterial
            color={ring.recolor ? RING_BASE : INNER_ANCHOR}
            transparent
            opacity={ring.op}
            depthWrite={false}
            toneMapped={false}
            blending={AdditiveBlending}
            side={DoubleSide}
          />
        </mesh>
      ))}
    </group>
  );
}
