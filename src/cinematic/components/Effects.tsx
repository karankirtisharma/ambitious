import {
  EffectComposer,
  Bloom,
  ToneMapping,
  Vignette,
  Noise,
  ChromaticAberration,
} from '@react-three/postprocessing';
import { BlendFunction, ToneMappingMode } from 'postprocessing';
import { Vector2 } from 'three';
import { useMemo } from 'react';

/**
 * Cinematic post chain, in order: HDR bloom (the panels' glow) → ACES filmic
 * tone map → grain → faint chromatic aberration → vignette. One composer,
 * multisampling off (nothing here aliases hard), all effects merged into a
 * single fullscreen pass by the composer.
 */
export function Effects({ grain = true, aberration = true }: { grain?: boolean; aberration?: boolean }) {
  const caOffset = useMemo(() => new Vector2(0.0006, 0.0006), []);
  return (
    <EffectComposer multisampling={0}>
      <Bloom
        mipmapBlur
        intensity={0.95}
        luminanceThreshold={0.55}
        luminanceSmoothing={0.28}
        radius={0.72}
      />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
      {grain ? (
        <Noise premultiply blendFunction={BlendFunction.SOFT_LIGHT} opacity={0.045} />
      ) : (
        <></>
      )}
      {aberration ? (
        <ChromaticAberration offset={caOffset} radialModulation modulationOffset={0.35} />
      ) : (
        <></>
      )}
      <Vignette offset={0.32} darkness={0.9} eskil={false} />
    </EffectComposer>
  );
}
