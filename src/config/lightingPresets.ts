import type { SceneState } from '../state/transitions';

/**
 * The whole lighting story in one table.
 * Green is life — it is spent, not decorated with: the cypherpunk's rim is
 * protocol green, the astronaut's is cool white, and the flood only exists
 * after synchronization completes.
 */
export interface LightingPreset {
  /** Key spotlight intensities per character. */
  keyL: number;
  keyR: number;
  /** Rim lights — L is green, R is cool white. */
  rimL: number;
  rimR: number;
  /** Core point light between the characters. */
  core: number;
  /** Pedestal ring glow multipliers. */
  glowL: number;
  glowR: number;
  /** Character material de-emphasis 0 (full) → 1 (receded). */
  dimL: number;
  dimR: number;
  /** Green environmental flood — protocol-complete only. */
  flood: number;
  /** Hover accent pools (0..1) — each subject's colored point light. */
  accentL: number;
  accentR: number;
}

/**
 * Monochrome studio semantics:
 * - keyL+keyR SUM drives the single shadow-casting key (idle sums to the
 *   spec's 2.75) — per-side emphasis survives as a brightness bias.
 * - rimL/rimR are direct multipliers on the spec's hot rims (34 × value),
 *   so 1.0 = the authored rest look.
 * - accentL/accentR (0..1) drive each subject's colored hover pool and the
 *   floor-ring tint. The conductor tweens them like every other channel, so
 *   hover on/off/cross all retarget one continuous ease.
 */
export const LIGHTING_PRESETS: Record<SceneState, LightingPreset> = {
  idle: {
    keyL: 1.35, keyR: 1.4, rimL: 1.0, rimR: 1.0, core: 0.1,
    glowL: 0.42, glowR: 0.42, dimL: 0, dimR: 0, flood: 0,
    accentL: 0, accentR: 0,
  },
  // Hover = the subject GLOWS. The rim is the glow: it is the only channel
  // that puts light on the silhouette rather than the form, so driving it well
  // past the bloom threshold wraps the hovered figure in its own colour —
  // GREEN on the left, COOL WHITE on the right (see COLORS/LightingRig). The
  // un-hovered side drops to 0.55 so the contrast reads as attention, not as
  // "both got brighter".
  hoverCypherpunk: {
    keyL: 1.7, keyR: 0.9, rimL: 2.5, rimR: 0.55, core: 0.2,
    glowL: 0.75, glowR: 0.3, dimL: 0, dimR: 0.5, flood: 0,
    accentL: 1, accentR: 0,
  },
  hoverAstronaut: {
    keyL: 0.9, keyR: 1.7, rimL: 0.55, rimR: 2.5, core: 0.2,
    glowL: 0.3, glowR: 0.75, dimL: 0.5, dimR: 0, flood: 0,
    accentL: 0, accentR: 1,
  },
  hoverProtocol: {
    keyL: 1.3, keyR: 1.3, rimL: 1.05, rimR: 1.05, core: 1.2,
    glowL: 0.6, glowR: 0.6, dimL: 0, dimR: 0, flood: 0,
    accentL: 0.35, accentR: 0.35,
  },
  // The panel states hold the hover glow — the subject you opened stays lit in
  // its own colour while the other recedes — a touch under hover so the open
  // dossier, not the figure, is the brightest thing on screen.
  cypherpunkPanel: {
    keyL: 1.8, keyR: 0.65, rimL: 2.3, rimR: 0.4, core: 0.15,
    glowL: 0.8, glowR: 0.25, dimL: 0, dimR: 0.68, flood: 0,
    accentL: 1, accentR: 0,
  },
  astronautPanel: {
    keyL: 0.65, keyR: 1.8, rimL: 0.4, rimR: 2.3, core: 0.15,
    glowL: 0.25, glowR: 0.8, dimL: 0.68, dimR: 0, flood: 0,
    accentL: 0, accentR: 1,
  },
  protocolInitiated: {
    keyL: 1.1, keyR: 1.1, rimL: 1.25, rimR: 1.25, core: 2.2,
    glowL: 0.95, glowR: 0.95, dimL: 0, dimR: 0, flood: 0.06,
    accentL: 0.6, accentR: 0.6,
  },
  synchronization: {
    keyL: 1.0, keyR: 1.0, rimL: 1.7, rimR: 1.7, core: 3.2,
    glowL: 1.2, glowR: 1.2, dimL: 0, dimR: 0, flood: 0.16,
    accentL: 0.85, accentR: 0.85,
  },
  protocolComplete: {
    keyL: 1.35, keyR: 1.35, rimL: 1.4, rimR: 1.4, core: 1.9,
    glowL: 0.95, glowR: 0.95, dimL: 0, dimR: 0, flood: 0.42,
    accentL: 0.7, accentR: 0.7,
  },
  scrollStory: {
    keyL: 1.2, keyR: 1.2, rimL: 1.1, rimR: 1.1, core: 1.4,
    glowL: 0.75, glowR: 0.75, dimL: 0, dimR: 0, flood: 0.32,
    accentL: 0.45, accentR: 0.45,
  },
};

/** Scene palette. */
export const COLORS = {
  // Near-neutral deep black: the previous green-tinted #060807 combined with
  // fog into a murky wash; the reference look is a clean void.
  bg: '#040505',
  green: '#B0F546',
  greenDeep: '#5fae32',
  /** Monochrome studio rig. */
  key: '#f6f8fb',
  fill: '#aab4c0',
  rim: '#dfe8f2',
  hemiSky: '#c8ced6',
  hemiGround: '#0a0b0d',
  /** Hover accents — one per subject. */
  accentL: '#B0F546',
  accentR: '#cfe0ff',
} as const;
