import { EffectComposer, Noise, Vignette } from '@react-three/postprocessing';
import { BlendFunction } from 'postprocessing';
import { useStore } from '../state/store';
import { DEBUG_FLAGS } from '../debugFlags';

/**
 * Threshold bloom does selective bloom for free in a scene this dark — only
 * pedestal rings, rims, core and bridge push past 0.68 luminance.
 */
export function PostFX() {
  if (DEBUG_FLAGS.noPostFx) return null;
  return <PostFXInner />;
}

function PostFXInner() {
  const tier = useStore((s) => s.tier);

  // Light theme: the whole frame sits above any useful bloom threshold, so
  // threshold-bloom would just wash the room out — it's gone. The vignette
  // stays, gently, as a lens shade rather than darkness.
  if (tier === 'low') {
    return (
      <EffectComposer multisampling={0} resolutionScale={0.6}>
        <Vignette offset={0.32} darkness={0.3} />
      </EffectComposer>
    );
  }

  return (
    <EffectComposer multisampling={0}>
      <Noise premultiply blendFunction={BlendFunction.MULTIPLY} opacity={0.035} />
      <Vignette offset={0.32} darkness={0.34} />
    </EffectComposer>
  );
}
