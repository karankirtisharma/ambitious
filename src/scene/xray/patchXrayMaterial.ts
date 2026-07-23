import type { Material } from 'three';
import { lensUniforms } from './lensUniforms';

type Mode = 'body' | 'anatomy';

/**
 * Cut a rectangular scan window through a material, in screen space.
 *
 * DELIBERATELY OPAQUE + DISCARD — there is no alpha blending anywhere:
 *   - body:    discarded INSIDE the rect  → the shell is cut away there
 *   - anatomy: discarded OUTSIDE the rect → it exists only inside the window
 *
 * Because both materials stay opaque and depth-tested, what you see is decided
 * by DEPTH alone — never by draw order, blend state, or per-texture alpha. That
 * is what makes the guarantee absolute: inside the rect the anatomy shows
 * exactly, outside it the body shows exactly, with nothing in between.
 *
 * This replaced an alpha-blended version that kept failing in three separate
 * ways, all of which are now structurally impossible:
 *   1. a wide feathered band crossfading shirt+anatomy into a muddy smear;
 *   2. the anatomy's ~56 sub-meshes not sorting against each other, so inner
 *      organs drew over outer muscle and gaps rendered as black voids;
 *   3. the Tripo materials' stray sub-1 texture alpha ghosting the whole shell.
 * With opaque geometry and a hard cut, none of those have anywhere to happen.
 *
 * The window is axis-aligned in gl_FragCoord space (framebuffer pixels, origin
 * bottom-left), sized from the shared lens uniforms so the DOM reticle and the
 * shader edge stay pixel-locked.
 */
export function patchXrayMaterial(mat: Material, mode: Mode): void {
  // Re-patching would run .replace() against an already-injected shader — the
  // first anchor is gone, so the string would silently not change while the
  // uniforms got appended twice on the next compile. Guard hard.
  if (mat.userData.xrayPatched) return;
  mat.userData.xrayPatched = true;

  mat.transparent = false;
  mat.depthWrite = true;

  // Body is cut away inside the window; anatomy only survives inside it.
  const cutTest = mode === 'body' ? '_d < 0.0' : '_d > 0.0';

  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uLensCenter = lensUniforms.uLensCenter;
    shader.uniforms.uLensRadius = lensUniforms.uLensRadius;

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        /* glsl */ `#include <common>
        uniform vec2 uLensCenter;
        uniform float uLensRadius;`
      )
      .replace(
        '#include <dithering_fragment>',
        /* glsl */ `#include <dithering_fragment>
        {
          // Rect half-size from the shared radius. Closed lens => radius 0 and
          // the centre parked far offscreen, so _d > 0 everywhere: the body
          // survives untouched and the anatomy is fully discarded.
          vec2 _half = vec2(uLensRadius * 1.30, uLensRadius * 0.85);
          vec2 _q = abs(gl_FragCoord.xy - uLensCenter) - _half;
          float _d = max(_q.x, _q.y); // < 0 inside the rect, > 0 outside
          if (${cutTest}) discard;
        }`
      );
  };

  // CRITICAL (spec §4): without a custom key, three can hand this material a
  // program cached for an unpatched material of the same type+params — one that
  // never saw onBeforeCompile, so uLens* are never uploaded and the surface
  // renders garbage or vanishes. Keyed per mode AND per cut-shape so a stale
  // program from the old blended build can never be reused.
  mat.customProgramCacheKey = () => `xray-rect-cut-${mode}`;

  mat.needsUpdate = true;
}
