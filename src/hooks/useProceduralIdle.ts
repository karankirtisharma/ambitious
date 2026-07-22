import { useRef } from 'react';
import type { RefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import type { Group } from 'three';
import { easing } from 'maath';
import { characterProxy } from '../motion/proxies';
import { useStore } from '../state/store';
import { stepSpin } from '../scene/dragSpin';
import type { SpinState } from '../scene/dragSpin';

/**
 * Procedural life for unrigged models.
 * There is no skeleton in these GLBs, so the characters breathe at group
 * level: a pelvis-pivoted scale for breath (feet stay planted), layered
 * incommensurate sines for sway, and a damped lean when the visitor's cursor
 * acknowledges them. It should feel subconscious, never scripted.
 */
export function useProceduralIdle(
  refs: {
    root: RefObject<Group | null>;
    breath: RefObject<Group | null>;
    sway: RefObject<Group | null>;
  },
  opts: {
    /** 'left' = cypherpunk, 'right' = astronaut. */
    side: 'left' | 'right';
    /** Per-character phase offset so the two never sync up. */
    phase: number;
    /** Root rest height — the hook owns root.position.y and must compose
     *  the lean rise ON TOP of this, never overwrite it. */
    baseY: number;
    /** Per-model authoring correction — the offset that makes THIS asset
     *  face the camera by default (read off each GLB; never assume 0). */
    baseYaw: number;
    /** Drag-to-spin layer. The final yaw is a SUM of independent layers:
     *  baseYaw + face (conductor-tweened rotL/rotR) + ack (damped lean) +
     *  user (this) — automatic motion never fights or resets a manual spin. */
    spin: SpinState;
  }
) {
  // Ref, not a render-scoped object: useFrame reads the latest closure, and a
  // re-render must not reset the damped lean mid-motion.
  const leanState = useRef({ v: 0 }).current;

  useFrame(({ clock }, dt) => {
    const root = refs.root.current;
    const breath = refs.breath.current;
    const sway = refs.sway.current;
    if (!root || !breath || !sway) return;

    stepSpin(opts.spin);

    if (useStore.getState().reducedMotion) {
      breath.scale.set(1, 1, 1);
      sway.rotation.set(0, 0, 0);
      sway.position.set(0, 0, 0);
      root.rotation.y =
        opts.baseYaw +
        (opts.side === 'left' ? characterProxy.rotL : characterProxy.rotR) +
        opts.spin.userYaw;
      root.position.y = opts.baseY;
      return;
    }

    const t = clock.elapsedTime + opts.phase;

    // Breathing: ~4.2s cycle, ±0.6% Y with volume-preserving counter-scale.
    const b = Math.sin(t * 1.5) * 0.006;
    breath.scale.set(1 - b * 0.35, 1 + b, 1 - b * 0.35);

    // Layered sway — three incommensurate sines ≈ cheap 1D noise, ±0.5° max.
    sway.rotation.z = (Math.sin(t * 0.31) * 0.5 + Math.sin(t * 0.73 + 2.1) * 0.3) * 0.009;
    sway.rotation.x = Math.sin(t * 0.42 + 0.7) * 0.006;
    sway.position.x = Math.sin(t * 0.19) * 0.006;

    // Protocol agitation: high-frequency, tiny-amplitude energy in the body.
    const a = characterProxy.agitation;
    sway.position.y = a > 0 ? Math.sin(t * 31.7) * 0.0022 * a : 0;

    // Hover acknowledgment: a soft organic lean toward the center + 1cm rise.
    const lean = opts.side === 'left' ? characterProxy.leanL : characterProxy.leanR;
    easing.damp(leanState, 'v', lean, 0.35, dt);
    const base = opts.side === 'left' ? characterProxy.rotL : characterProxy.rotR;
    const sign = opts.side === 'left' ? 1 : -1;
    // Layered yaw: face/base (tweened) + ack lean + user drag. A sum, never
    // an overwrite — see spin's docs.
    root.rotation.y = opts.baseYaw + base + sign * leanState.v * 0.07 + opts.spin.userYaw;
    root.position.y = opts.baseY + leanState.v * 0.012;
  });
}
