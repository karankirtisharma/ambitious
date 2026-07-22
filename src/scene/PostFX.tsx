import { useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import {
  EffectComposer,
  Bloom,
  BrightnessContrast,
  Noise,
  Vignette,
  ToneMapping,
  SMAA,
} from '@react-three/postprocessing';
import { BlendFunction, ChromaticAberrationEffect } from 'postprocessing';
import { Vector2 } from 'three';
import { fxProxy } from '../motion/proxies';
import { useStore } from '../state/store';
import { DEBUG_FLAGS } from '../debugFlags';
import { usePostControls } from '../cinematic/controls';

/**
 * Rendering-first pipeline. The composer keeps its HalfFloatType buffer (an
 * 8-bit target would clamp emissive >1 to white BEFORE bloom and band the black
 * field), and forces renderer.toneMapping = NoToneMapping for its lifetime — so
 * tone mapping MUST be an effect here or the frame ships un-tonemapped and HDR
 * emitters clip to flat slabs.
 *
 * Order is HDR → SDR: Bloom reads the linear-HDR buffer, ToneMapping (ACES
 * Filmic by default — matches the standalone liquid reference) collapses to
 * display range, then a BrightnessContrast neon grade + CA / Vignette finish in
 * SDR. Exposure rides renderer.toneMappingExposure, which the tone-map samples.
 *
 * Bloom is TIGHT (small radius, few levels) so only the true HDR emitters (bar
 * cores, rings, core, bridge — all toneMapped=false, past ~1.0) bloom crisply.
 * Chromatic aberration is ZERO at rest — a constant fringe reads as a defect —
 * and only breathes in with protocol energy.
 */
export function PostFX() {
  if (DEBUG_FLAGS.noPostFx) return null;
  return <PostFXInner />;
}

function PostFXInner() {
  const tier = useStore((s) => s.tier);
  const gl = useThree((s) => s.gl);
  const { tone, bloom, grade } = usePostControls();

  // Exposure lives on the renderer; the AgX/ACES tone-mapping pass multiplies by
  // it. NoToneMapping (set by the composer) doesn't touch this value.
  useEffect(() => {
    gl.toneMappingExposure = tone.exposure;
  }, [gl, tone.exposure]);

  // Constructed imperatively: the declarative wrapper JSON-serializes props for
  // memoization, and the frameloop must NEVER meet a throwing callback.
  const caEffect = useMemo(
    () =>
      new ChromaticAberrationEffect({
        offset: new Vector2(0, 0),
        radialModulation: false,
        modulationOffset: 0,
      }),
    []
  );

  useFrame(() => {
    const off = caEffect.offset as Vector2 | undefined;
    if (off && typeof off.set === 'function') {
      // Rest state is CLEAN. Fringe exists only while the protocol surges.
      // uPulse is a monotonic one-shot that RESTS at 1 on success (only cancel
      // resets it), so drive the fringe from uPulse*(1-uPulse) — a transient
      // that's zero at BOTH ends — else a ~2px fringe would sit permanently over
      // the completion scene and the manifesto.
      const amt = fxProxy.uPulse * (1 - fxProxy.uPulse) * 0.008 + fxProxy.uEnergy * 0.0008;
      off.set(amt, amt * 0.6);
    }
  });

  if (tier === 'low') {
    return (
      <EffectComposer multisampling={0} resolutionScale={0.6}>
        <Bloom
          mipmapBlur
          intensity={bloom.intensity}
          levels={bloom.levels}
          luminanceThreshold={bloom.threshold}
          luminanceSmoothing={bloom.smoothing}
        />
        <ToneMapping mode={tone.mode} />
        <BrightnessContrast brightness={grade.brightness} contrast={grade.contrast} />
        <Vignette offset={grade.vignetteOffset} darkness={grade.vignetteDarkness} />
      </EffectComposer>
    );
  }

  // multisampling 0: MSAA on the HDR float target is costly; SMAA at the end of
  // the chain antialiases the bright portal edges against black for less.
  return (
    <EffectComposer multisampling={0}>
      <Bloom
        mipmapBlur
        intensity={bloom.intensity}
        radius={bloom.radius}
        levels={bloom.levels}
        luminanceThreshold={bloom.threshold}
        luminanceSmoothing={bloom.smoothing}
      />
      <ToneMapping mode={tone.mode} />
      <BrightnessContrast brightness={grade.brightness} contrast={grade.contrast} />
      <primitive object={caEffect} />
      <Noise premultiply blendFunction={BlendFunction.SOFT_LIGHT} opacity={grade.grain} />
      <Vignette offset={grade.vignetteOffset} darkness={grade.vignetteDarkness} />
      <SMAA />
    </EffectComposer>
  );
}
