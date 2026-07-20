import { useRef } from 'react';
import type { RefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import type { Group } from 'three';
import { easing } from 'maath';
import { characterProxy } from '../motion/proxies';
import { useStore } from '../state/store';

/** Full revolution every 42s — a slow, premium showcase turn, never a toy spin. */
const SPIN_SPEED = (Math.PI * 2) / 42;

const EXPLORABLE = new Set(['idle', 'hoverCypherpunk', 'hoverAstronaut', 'hoverProtocol']);

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
  }
) {
  // Ref, not a render-scoped object: useFrame reads the latest closure, and a
  // re-render must not reset the damped lean mid-motion.
  const leanState = useRef({ v: 0 }).current;
  // Showcase-spin accumulator. Damped back to 0 (never snapped) the instant
  // it's not explorable, so it settles out of the way before the ceremony's
  // deliberate face-each-other rotation takes over.
  const spinState = useRef({ v: 0 }).current;

  useFrame(({ clock }, dt) => {
    const root = refs.root.current;
    const breath = refs.breath.current;
    const sway = refs.sway.current;
    if (!root || !breath || !sway) return;

    if (useStore.getState().reducedMotion) {
      breath.scale.set(1, 1, 1);
      sway.rotation.set(0, 0, 0);
      sway.position.set(0, 0, 0);
      root.rotation.y = opts.side === 'left' ? characterProxy.rotL : characterProxy.rotR;
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

    // Premium showcase turn: runs through idle/hover, eases back to rest
    // (never snaps) the instant this character is the hover focus, a panel
    // opens, or the ceremony takes over deliberate facing.
    if (EXPLORABLE.has(useStore.getState().scene) && leanState.v < 0.05) {
      spinState.v += dt * SPIN_SPEED;
    } else {
      easing.damp(spinState, 'v', 0, 0.5, dt);
    }

    root.rotation.y = base + sign * leanState.v * 0.07 + spinState.v;
    root.position.y = opts.baseY + leanState.v * 0.012;
  });
}
