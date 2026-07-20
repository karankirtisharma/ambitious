/**
 * The scan lens.
 *
 * A screen-space circle that follows the cursor while the cypherpunk holds
 * focus. Inside it his outer body is cut away and the anatomy beneath is
 * revealed — one circle, two materials reading it with opposite sign.
 *
 * Coordinates are DRAWING-BUFFER pixels, because that is the space
 * gl_FragCoord speaks: CSS pixels × pixel ratio, and y measured from the
 * bottom. The DOM ring converts back the other way.
 */
export const scanProxy = {
  /** Damped centre, in drawing-buffer pixels (gl_FragCoord space). */
  x: -9999,
  y: -9999,
  /** Radius in drawing-buffer pixels. 0 = fully closed, nothing is cut. */
  radius: 0,
  /** True once the pointer has been placed at least once — before that the
   *  lens must not snap in from the far corner. */
  primed: false,
};

/** Lens size as a fraction of the smaller viewport axis, when fully open. */
export const SCAN_RADIUS_RATIO = 0.085;

if (import.meta.env.DEV) {
  (window as unknown as { __scanProxy?: unknown }).__scanProxy = scanProxy;
}
