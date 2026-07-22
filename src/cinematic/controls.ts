import { useControls } from 'leva';
import { ToneMappingMode } from 'postprocessing';

/**
 * Single source of truth for every tunable render value, exposed live through
 * Leva (panel gated behind ?debug=1). Amendment from the art director: nothing
 * hardcoded — exposure, bloom, fog, reflection, grain all dial live so the look
 * is found by eye, not by recompiling.
 *
 * Organised in folders that mirror the rendering-first build order. Systems are
 * added here as they come online; a hook per subsystem keeps the panel legible
 * and lets each component subscribe only to what it needs.
 */

/** System A — post pipeline: tone mapping, bloom, grade. */
export function usePostControls() {
  const tone = useControls('Tone Mapping', {
    // ACES Filmic to MATCH the standalone liquid reference (its post used ACES).
    // Still swappable — AgX holds saturated green better if you ever prefer it.
    mode: {
      value: ToneMappingMode.ACES_FILMIC,
      options: {
        'ACES Filmic': ToneMappingMode.ACES_FILMIC,
        'AgX (cinematic)': ToneMappingMode.AGX,
        'Neutral (Khronos)': ToneMappingMode.NEUTRAL,
        Cineon: ToneMappingMode.CINEON,
        Reinhard: ToneMappingMode.REINHARD,
      },
    },
    exposure: { value: 1.0, min: 0.3, max: 1.8, step: 0.01 },
  });

  const bloom = useControls('Bloom', {
    // TIGHT bloom (reference values): small radius + FEW mip levels keep the
    // halo hugging the bars so they stay crisp — not the wide sci-fi wash that
    // was blowing the scene out and lifting the blacks.
    intensity: { value: 0.65, min: 0, max: 2, step: 0.01 },
    // 1.0 so ONLY true HDR emitters (the white bar cores) bloom — the green
    // haze/reflection stays out of the bloom, keeping blacks deep.
    threshold: { value: 1.0, min: 0, max: 1.2, step: 0.01 },
    radius: { value: 0.38, min: 0, max: 1, step: 0.005 },
    levels: { value: 5, min: 1, max: 9, step: 1 },
    smoothing: { value: 0.2, min: 0, max: 1, step: 0.01 },
  });

  const grade = useControls('Grade', {
    // Neon grade (reference): deep blacks preserved, whites punchy, CLEAN (no grain).
    contrast: { value: 0.12, min: -0.5, max: 0.5, step: 0.005 },
    brightness: { value: -0.01, min: -0.3, max: 0.3, step: 0.005 },
    vignetteOffset: { value: 0.24, min: 0, max: 1, step: 0.01 },
    vignetteDarkness: { value: 0.75, min: 0, max: 1, step: 0.01 },
    grain: { value: 0.0, min: 0, max: 0.12, step: 0.002 },
  });

  return { tone, bloom, grade };
}
