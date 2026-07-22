import { Vector2 } from 'three';
import { easing } from 'maath';
import { getScene } from '../../state/store';

/**
 * X-ray lens — the single source of truth shared by the two patched materials
 * and the DOM overlay.
 *
 * `lensUniforms` holds the ACTUAL THREE uniform objects. The same references
 * are handed to both the body material (fades to transparent INSIDE the lens)
 * and the anatomy material (fades to transparent OUTSIDE it), so one write per
 * frame drives both — they can never disagree about where the window is.
 *
 * Center is in gl_FragCoord space: framebuffer pixels, origin bottom-left,
 * already multiplied by the renderer's pixel ratio. Radius/feather likewise.
 */
export const lensUniforms = {
  // Parked far offscreen when closed so a stray frame can't punch a hole.
  uLensCenter: { value: new Vector2(-1e5, -1e5) },
  uLensRadius: { value: 0 },
  /** Feather as a FRACTION of radius; band = radius·(1±feather). Kept TIGHT:
   *  a wide band is a wide crossfade, and the crossfade region is exactly
   *  where shirt + anatomy overlap into a muddy ghost. A narrow band reads as
   *  a crisp scanner edge with a clean anatomy core. Fractional so the band
   *  collapses with the radius at the closed state (no ghost hole). */
  uLensFeather: { value: 0.16 },
};

/** CSS-pixel mirror (top-left origin) for the DOM overlay to read. */
export const lensState = {
  pointerX: -1e5,
  pointerY: -1e5,
  hovering: false,
  cssX: -1e5,
  cssY: -1e5,
  cssRadius: 0,
};

/** Open radius, CSS px — a small crisp peek, not a chest-wide bubble.
 *  50 under the studio lighting: 42 read as too timid once the reveal's
 *  interior was recessed. */
export const LENS_RADIUS_CSS = 50;

/** Follow smoothing (maath smoothTime). Small: a hair of weight, but the
 *  reveal stays under the cursor while you sweep. 0.075 read as "not
 *  tracking" — the lens lagged so far it never landed on what you pointed at. */
const FOLLOW_SMOOTH = 0.03;

export function setLensHover(on: boolean) {
  lensState.hovering = on;
}

export function setLensPointer(x: number, y: number) {
  lensState.pointerX = x;
  lensState.pointerY = y;
}

const explorable = () => {
  const s = getScene();
  return s === 'idle' || s === 'hoverCypherpunk' || s === 'hoverAstronaut' || s === 'hoverProtocol';
};

/**
 * Advance the eased center + radius one frame and publish to the uniforms.
 * The center trails the raw pointer with a little weight (spec: "feel like it
 * has a little weight, not track rigidly"); the radius eases open/closed.
 */
export function updateLensFrame(
  dt: number,
  width: number,
  height: number,
  pixelRatio: number,
  forceFull = false
) {
  const open = forceFull || (lensState.hovering && explorable());

  // Trailing follow. Snap in from far offscreen on first reveal so it doesn't
  // sweep across the whole screen to reach the cursor.
  if (open && lensState.cssX < -1e4) {
    lensState.cssX = lensState.pointerX;
    lensState.cssY = lensState.pointerY;
  }
  easing.damp(lensState, 'cssX', lensState.pointerX, FOLLOW_SMOOTH, dt);
  easing.damp(lensState, 'cssY', lensState.pointerY, FOLLOW_SMOOTH, dt);

  const targetR = forceFull
    ? Math.hypot(width, height) // whole-model inspect mode
    : open
      ? LENS_RADIUS_CSS
      : 0;
  easing.damp(lensState, 'cssRadius', targetR, 0.11, dt);

  // Below ~0.4px the lens is closed; re-park the center so it never lingers.
  if (!open && lensState.cssRadius < 0.4) {
    lensState.cssRadius = 0;
    lensState.cssX = -1e5;
    lensState.cssY = -1e5;
  }

  // CSS (top-left) → framebuffer (bottom-left) pixels.
  lensUniforms.uLensCenter.value.set(
    lensState.cssX * pixelRatio,
    (height - lensState.cssY) * pixelRatio
  );
  lensUniforms.uLensRadius.value = lensState.cssRadius * pixelRatio;
}
