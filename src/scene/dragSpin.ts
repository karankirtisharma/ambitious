/**
 * Drag-to-spin for rotatable models. Each rotatable part owns ONE SpinState;
 * its yaw contribution is a LAYER added to the model's other rotation layers
 * (baseYaw + userYaw + ackYaw + faceYaw), never an overwrite — so scripted
 * turns and hover leans stack on top of wherever the user left the model.
 *
 * Pointer flow: the pick target's onPointerDown calls beginDrag; window-level
 * move/up listeners take over (the pointer routinely leaves the hitbox
 * mid-drag). Released drags carry residual spin that decays with friction.
 */

export interface SpinState {
  /** Accumulated user yaw — the drag layer. */
  userYaw: number;
  /** Residual per-frame spin after release. */
  vel: number;
  dragging: boolean;
  lastX: number;
  /** Total pixels moved this gesture — clicks are gestures that never move. */
  moved: number;
}

/** Radians per pixel of horizontal drag. */
const SENSITIVITY = 0.011;
/** Post-release decay per frame. */
const FRICTION = 0.94;
/** Cap on released spin: one coarse pointer event × 1/(1-friction) would
 *  otherwise fling the model through dozens of turns. */
const MAX_FLICK = 0.06;

export function createSpin(): SpinState {
  return { userYaw: 0, vel: 0, dragging: false, lastX: 0, moved: 0 };
}

const clamp = (v: number, m: number) => Math.max(-m, Math.min(m, v));

/**
 * Begin a gesture and install its window listeners. Returns the release
 * cleanup (also wired to pointerup/cancel internally).
 */
export function beginDrag(s: SpinState, startX: number): void {
  s.dragging = true;
  s.lastX = startX;
  s.moved = 0;
  s.vel = 0;

  const onMove = (e: PointerEvent) => {
    const dx = e.clientX - s.lastX;
    s.lastX = e.clientX;
    s.moved += Math.abs(dx);
    s.userYaw += dx * SENSITIVITY;
    // Velocity mirrors the latest move so release inherits the flick.
    s.vel = clamp(dx * SENSITIVITY, MAX_FLICK);
  };
  const onUp = () => {
    s.dragging = false;
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onUp);
  };
  window.addEventListener('pointermove', onMove, { passive: true });
  window.addEventListener('pointerup', onUp, { passive: true });
  window.addEventListener('pointercancel', onUp, { passive: true });
}

/** Advance one frame: apply inertia + friction while not dragging. */
export function stepSpin(s: SpinState): void {
  if (s.dragging) return;
  if (s.vel === 0) return;
  s.userYaw += s.vel;
  s.vel *= FRICTION;
  if (Math.abs(s.vel) < 0.00005) s.vel = 0;
}

/** True when the finished gesture was a drag, not a click. */
export function wasDrag(s: SpinState): boolean {
  return s.moved > 5;
}
