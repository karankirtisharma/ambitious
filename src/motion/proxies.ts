/**
 * Persistent proxy objects — the heart of the "nothing ever snaps" guarantee.
 *
 * GSAP tweens ONLY these long-lived singletons; one useFrame per subsystem
 * composes them into the scene every frame (single-writer rule). Because a new
 * tween always starts from the proxy's *current* value, any interruption —
 * hover-out mid-hover-in, cancel mid-sync — simply bends the trajectory.
 */
import { BOOT_POSE } from '../config/cameraPoses';
import { LIGHTING_PRESETS } from '../config/lightingPresets';

export const cameraProxy = {
  px: BOOT_POSE.position[0],
  py: BOOT_POSE.position[1],
  pz: BOOT_POSE.position[2],
  tx: BOOT_POSE.target[0],
  ty: BOOT_POSE.target[1],
  tz: BOOT_POSE.target[2],
  fov: BOOT_POSE.fov,
  /** One-shot decaying pulse displacement (protocol click), never random shake. */
  shake: 0,
  /** Mouse-parallax amplitude — tweened to 0 during panels/protocol. */
  parallax: 1,
};

/** Character base facing (radians) — both stand straight, facing camera. */
export const CHAR_BASE_ROT = { left: 0, right: 0 } as const;

export const characterProxy = {
  /** Root Y rotations; during sync the characters turn to face one another. */
  rotL: CHAR_BASE_ROT.left,
  rotR: CHAR_BASE_ROT.right,
  /** Micro-jitter amplitude during the protocol sequence. */
  agitation: 0,
  /** Hover lean targets (0|1), damped inside the idle hook. */
  leanL: 0,
  leanR: 0,
};

/** Mirrors LightingPreset fields; LightingRig reads it every frame. */
export const lightProxy = { ...LIGHTING_PRESETS.idle };

export const fxProxy = {
  /** Orbiting particles around the protocol core (hover state). */
  uOrbit: 0,
  /** Expanding floor shockwave, one-shot 0→1 on protocol click. */
  uPulse: 0,
  /** Energy bridge formation 0..1 (drives intensity + draw range). */
  uBridge: 0,
  /** Global escalation — turbulence, chromatic aberration, agitation. */
  uEnergy: 0,
  /** Bridge particle flow speed. */
  uFlow: 0.05,
  /** Bridge turbulence: chaotic ignition → laminar filament. */
  uTurbulence: 1.0,
};

/** Master sync clock (0..1) — tweened by the protocol timeline. */
export const syncProxy = { t: 0 };
