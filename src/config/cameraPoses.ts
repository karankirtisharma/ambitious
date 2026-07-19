import type { SceneState } from '../state/transitions';

export interface CameraPose {
  position: [number, number, number];
  target: [number, number, number];
  fov: number;
}

/** Character root X positions — the two pedestals. */
export const CHAR_X = 2.2;
/**
 * Measured stand heights: the platform's dish surface sits at y 0.352, and
 * each Tripo model's visible soles float above its own origin (stray sub-feet
 * geometry skewed the bbox normalization). root Y = dish − sole offset.
 */
export const STAND_Y = { cypherpunk: 0.178, astronaut: 0.205 } as const;
/** Chest height used by the energy bridge endpoints. */
export const CHEST_Y = 1.51;

/**
 * One cinematic pose per state. The rig tweens between them like a dolly —
 * hover shifts are deliberately small (3–5% translation, ~1.5° orbit).
 */
export const CAMERA_POSES: Record<SceneState, CameraPose> = {
  idle:               { position: [0, 1.52, 5.6],     target: [0, 1.22, 0],    fov: 41 },
  hoverCypherpunk:    { position: [-0.42, 1.48, 5.3], target: [-0.8, 1.26, 0], fov: 40 },
  hoverAstronaut:     { position: [0.42, 1.48, 5.3],  target: [0.8, 1.26, 0],  fov: 40 },
  hoverProtocol:      { position: [0, 1.34, 5.1],     target: [0, 1.19, 0],    fov: 39 },
  cypherpunkPanel:    { position: [-0.3, 1.45, 4.4],  target: [-1.55, 1.29, 0], fov: 38 },
  astronautPanel:     { position: [0.3, 1.45, 4.4],   target: [1.55, 1.29, 0],  fov: 38 },
  protocolInitiated:  { position: [0, 1.3, 4.9],      target: [0, 1.22, 0],    fov: 38 },
  synchronization:    { position: [0, 1.48, 4.3],     target: [0, 1.28, 0],    fov: 41 },
  protocolComplete:   { position: [0, 1.72, 5.5],     target: [0, 1.26, 0],    fov: 42 },
  scrollStory:        { position: [0, 2.0, 6.2],      target: [0, 1.34, 0],    fov: 42 },
};

/** Boot: the establishing shot settles from here into the idle pose. */
export const BOOT_POSE: CameraPose = {
  position: [0, 1.62, 6.4],
  target: [0, 1.28, 0],
  fov: 42,
};

/** How long the dolly takes into each state, seconds. */
export const CAMERA_DURATIONS: Record<SceneState, number> = {
  idle: 1.0,
  hoverCypherpunk: 1.1,
  hoverAstronaut: 1.1,
  hoverProtocol: 0.9,
  cypherpunkPanel: 1.5,
  astronautPanel: 1.5,
  protocolInitiated: 2.0,
  synchronization: 2.4,
  protocolComplete: 2.2,
  scrollStory: 1.6,
};
