import type { Material, WebGLProgramParametersWithUniforms } from 'three';
import { Vector3 } from 'three';

/**
 * Patches a standard material so it participates in the scan lens.
 *
 * `mode: 'cutaway'` — the outer body. Fades toward invisible approaching the
 * lens centre, opaque well outside it — a soft vignette, not a hard hole.
 * `mode: 'reveal'`  — the anatomy. The complementary fade: opaque at centre,
 * gone by the outer edge. The two alphas sum to ~1 in the band between, so
 * it crossfades rather than cutting.
 *
 * The test runs on gl_FragCoord, so it is exact in screen space regardless
 * of how the model is transformed — no projection maths in the vertex stage,
 * and it survives the breathing/sway/spin the character is already under.
 */
export type ScanMode = 'cutaway' | 'reveal';

export interface ScanUniforms {
  uScanCenter: { value: Vector3 };
  uScanRadius: { value: number };
}

/** One shared uniform object per mode keeps every patched material in sync. */
export function createScanUniforms(): ScanUniforms {
  return {
    // xy = centre in drawing-buffer px, z unused (Vector3 for cheap .set)
    uScanCenter: { value: new Vector3(-9999, -9999, 0) },
    uScanRadius: { value: 0 },
  };
}

const COMMON_HEAD = /* glsl */ `
  uniform vec3 uScanCenter;
  uniform float uScanRadius;
`;

/** Where the soft band starts, as a fraction of the radius (0 = a hard dot
 *  at the centre, 1 = the whole disc is one long fade). */
const FEATHER_INNER = 0.25;

export function patchScanMaterial(material: Material, mode: ScanMode, uniforms: ScanUniforms) {
  // Alpha now genuinely varies across the surface — must actually blend.
  material.transparent = true;
  material.depthWrite = false;

  // Without this, a patched material can be handed a program compiled for an
  // identical *unpatched* material — the discard/blend logic is there but
  // uScan* never gets uploaded, so the shader reads uninitialised memory.
  // The cache key must reflect the injection.
  material.customProgramCacheKey = () => `cy-scan-${mode}`;

  material.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
    shader.uniforms.uScanCenter = uniforms.uScanCenter;
    shader.uniforms.uScanRadius = uniforms.uScanRadius;

    shader.fragmentShader = COMMON_HEAD + shader.fragmentShader;

    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <clipping_planes_fragment>',
      `#include <clipping_planes_fragment>
      float scanDist = distance(gl_FragCoord.xy, uScanCenter.xy);
      float scanInner = uScanRadius * ${FEATHER_INNER.toFixed(3)};
      ${
        mode === 'cutaway'
          ? `// 0 at the lens centre (fully gone), 1 well outside it.
      float scanAlpha = uScanRadius > 0.5 ? smoothstep(scanInner, uScanRadius, scanDist) : 1.0;`
          : `// Skip the anatomy pass entirely once well outside the lens.
      if (uScanRadius <= 0.5 || scanDist > uScanRadius * 1.08) discard;
      // 1 at the lens centre, 0 by the outer edge — the cutaway's mirror.
      float scanAlpha = 1.0 - smoothstep(scanInner, uScanRadius, scanDist);`
      }`
    );

    // Multiply in after <output_fragment> has assigned gl_FragColor — every
    // build of three's standard/physical shader carries dithering_fragment
    // immediately after it, so the alpha channel is already final here.
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <dithering_fragment>',
      `gl_FragColor.a *= scanAlpha;
      #include <dithering_fragment>`
    );
  };
  material.needsUpdate = true;
}
