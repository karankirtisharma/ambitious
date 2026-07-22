import type { Material } from 'three';
import { lensUniforms } from './lensUniforms';

type Mode = 'body' | 'anatomy';

/**
 * Inject the lens test into a material's fragment shader.
 *
 * - body:    fragment alpha ×= t        → fades out INSIDE the lens (a hole)
 * - anatomy: fragment alpha ×= (1 − t)  → fades out OUTSIDE the lens
 *
 * t is a smoothstep across a feather band around the radius, so the two are
 * complementary and sum to 1 through the transition — a crossfade, not a
 * punched circle. Distance is in gl_FragCoord space (framebuffer px).
 */
export function patchXrayMaterial(mat: Material, mode: Mode): void {
  // Re-patching would run .replace() against an already-injected shader —
  // the first anchor is gone, so nothing changes on the string BUT the
  // uniforms would be appended twice on the next compile. Guard hard.
  if (mat.userData.xrayPatched) return;
  mat.userData.xrayPatched = true;

  mat.transparent = true;
  // Body keeps writing depth: it is the outer, near-opaque shell, and its
  // depth is what preserves the scene's existing sort order against the
  // platform and particles. Anatomy must NOT write depth or its (invisible,
  // alpha-0) area outside the lens would occlude things behind it.
  mat.depthWrite = mode === 'body';

  // SET, not multiply. These Tripo materials carry a stray sub-1 alpha in
  // their textures — the reason Character.tsx forces them opaque. Multiplying
  // (`a *= t`) re-exposed it: outside the lens the shirt went semi-transparent
  // and the anatomy ghosted through the whole body, which chromatic aberration
  // then split into a coloured fringe. Overwriting alpha discards that base
  // channel, so the surface is fully opaque everywhere except the lens hole.
  const alphaExpr = mode === 'body' ? '_t' : '(1.0 - _t)';

  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uLensCenter = lensUniforms.uLensCenter;
    shader.uniforms.uLensRadius = lensUniforms.uLensRadius;
    shader.uniforms.uLensFeather = lensUniforms.uLensFeather;

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        /* glsl */ `#include <common>
        uniform vec2 uLensCenter;
        uniform float uLensRadius;
        uniform float uLensFeather;`
      )
      .replace(
        '#include <dithering_fragment>',
        /* glsl */ `#include <dithering_fragment>
        {
          float _d = distance(gl_FragCoord.xy, uLensCenter);
          float _inner = uLensRadius * (1.0 - uLensFeather);
          float _outer = uLensRadius * (1.0 + uLensFeather);
          float _t = smoothstep(_inner, _outer, _d); // 0 inside → 1 outside
          gl_FragColor.a = ${alphaExpr};
        }`
      );
  };

  // CRITICAL (spec §4): without a custom key, three can hand this material a
  // program cached for an unpatched material of the same type+params — one
  // that never saw onBeforeCompile, so uLens* are never uploaded and the
  // surface renders garbage or vanishes. The key is APPENDED to three's
  // parameter-derived key, so a constant per-mode discriminator is enough;
  // map/vertexColor/etc. differences are still encoded by the base key.
  mat.customProgramCacheKey = () => `xray-${mode}`;

  mat.needsUpdate = true;
}
