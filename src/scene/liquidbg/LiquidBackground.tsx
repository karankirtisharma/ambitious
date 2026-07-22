import { useMemo } from 'react';
import type { Group } from 'three';
import { BackgroundGlow } from './BackgroundGlow';
import { Smoke } from './Smoke';
import { Portal } from './Portal';
import { Motes } from './Motes';
import { Water } from './Water';

/**
 * <LiquidBackground /> — a self-contained R3F background environment.
 *
 * Mounts INSIDE the host's existing <Canvas>. It has NO Canvas, camera,
 * post-processing, DOM, fog, or clear-colour of its own — the host owns all of
 * those. It is a single <group> composing five layers:
 *
 *   BackgroundGlow  (z ≈ -24)  opaque procedural radial glow wall
 *   Smoke           (far back) additive haze sprites
 *   Portal          (z ≈ -14)  three HDR bars — the light source (host bloom)
 *   Motes           (volume)   additive drifting sprites
 *   Water           (y = 0)    liquid ground; planar reflection of the ABOVE
 *                              layers only (never the host characters)
 *
 * The Portal/Smoke/Motes are emissive/additive with `toneMapped=false` and HDR
 * values > 1, so the HOST's Bloom (threshold ≈ 0.9) is what makes them glow —
 * there is no local post chain.
 *
 * Layout was authored around the internal camera; it is repositioned for the
 * host rig via the group transform below (defaults chosen for the host's
 * `camera [0,1.6,6] → target [0,1.25,0] fov 41`, ground at y = 0). Keep the
 * group at world y = 0 and un-tilted so the Water stays a horizontal mirror
 * plane; horizontal position, Y-rotation, and uniform scale are all safe.
 */
export interface LiquidBackgroundProps {
  /** Group transform — nudge to fit the host framing. */
  position?: [number, number, number];
  rotation?: [number, number, number];
  scale?: number | [number, number, number];
  /** 0 = frozen (reduced motion), 1 = full. Also drops offscreen work cheaply. */
  motion?: number;
  /** Cursor-ripple strength. 0 disables ripples without disabling drift. */
  rippleScale?: number;
  /** Atmosphere sprite density — 0 removes smoke/motes for low tiers. */
  smokeIntensity?: number;
  moteCount?: number;
  /** Square reflection FBO size. Lower on low tiers. */
  reflectionRes?: number;
  groupRef?: React.Ref<Group>;
}

export function LiquidBackground({
  position = [0, 0, 0],
  rotation = [0, 0, 0],
  scale = 1,
  motion = 1,
  rippleScale = 1,
  smokeIntensity = 1,
  moteCount = 26,
  reflectionRes = 512,
  groupRef,
}: LiquidBackgroundProps) {
  const scaleArr = useMemo<[number, number, number]>(
    () => (typeof scale === 'number' ? [scale, scale, scale] : scale),
    [scale]
  );

  return (
    <group ref={groupRef} position={position} rotation={rotation} scale={scaleArr}>
      <BackgroundGlow motion={motion} />
      {smokeIntensity > 0 && <Smoke motion={motion} intensity={smokeIntensity} />}
      <Portal motion={motion} />
      {moteCount > 0 && <Motes motion={motion} count={moteCount} />}
      <Water motion={motion} rippleScale={rippleScale} reflectionRes={reflectionRes} reflOffset={[0.002, 0]} />
    </group>
  );
}
