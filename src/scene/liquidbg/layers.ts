import type { Object3D } from 'three';

/**
 * Dedicated three.js layer for the liquid-background reflection pass.
 *
 * The host uses:
 *   • layer 0 — everything the main camera renders (characters, pedestals…),
 *   • layer 1 — pointer-raycast hitboxes (`raycaster.layers.set(1)`).
 *
 * We claim layer 2 for "things the water is allowed to reflect". Every liquid
 * background mesh is put on BOTH layer 0 (so the host's main camera still
 * renders it) AND layer 2 (so the reflection camera can render *only* it).
 * The reflection camera is set to layer 2 alone, so it never renders the
 * host's 260k-triangle characters (cost) or their x-ray-lens materials, which
 * read gl_FragCoord in main-framebuffer space and would glitch in the mirror
 * pass. The Water mesh itself is deliberately NOT on layer 2 — that is how it
 * avoids reflecting itself, with no per-frame visibility toggle.
 */
export const REFLECT_LAYER = 2;

/** Enable the reflect layer on an object and its whole subtree. */
export function enableReflectLayer(root: Object3D): void {
  root.traverse((o) => o.layers.enable(REFLECT_LAYER));
}
