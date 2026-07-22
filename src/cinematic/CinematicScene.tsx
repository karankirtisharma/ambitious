import { Suspense, useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { LightPanels } from './components/LightPanels';
import { ReflectiveWater } from './components/ReflectiveWater';
import { VolumetricFog } from './components/VolumetricFog';
import { CameraDrift } from './components/CameraDrift';
import { Effects } from './components/Effects';

/**
 * Cinematic background — three emissive panels over rippled black water.
 *
 * Drop-in fullscreen background for a landing page:
 *
 *   <div className="hero">
 *     <CinematicScene />          // position:fixed/absolute behind content
 *     <main>…your DOM UI…</main>  // real HTML on top, never inside the canvas
 *   </div>
 *
 * Total per-frame cost: main pass + one half-res reflection pass + one
 * composer pass. No shadows, no environment maps, ~6 draw calls.
 */
export function CinematicScene({ className }: { className?: string }) {
  const webgl2 = useMemo(() => {
    try {
      const c = document.createElement('canvas');
      return !!c.getContext('webgl2', { failIfMajorPerformanceCaveat: true });
    } catch {
      return false;
    }
  }, []);

  // No-WebGL fallback: a static gradient that keeps the mood; content above
  // the canvas is real DOM and never depends on this.
  if (!webgl2) {
    return (
      <div
        className={className}
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'radial-gradient(ellipse 42% 55% at 50% 58%, #12222e 0%, #06090c 55%, #000 100%)',
        }}
      />
    );
  }

  return (
    <div className={className} aria-hidden="true" style={{ position: 'absolute', inset: 0 }}>
      <Canvas
        dpr={[1, 2]}
        gl={{ antialias: false, alpha: false, powerPreference: 'high-performance', stencil: false }}
        camera={{ fov: 38, near: 0.1, far: 90, position: [0, 1.25, 8.6] }}
      >
        <color attach="background" args={['#000000']} />
        <Suspense fallback={null}>
          <CameraDrift />
          <LightPanels />
          <ReflectiveWater />
          <VolumetricFog />
          <Effects />
        </Suspense>
      </Canvas>
    </div>
  );
}

export default CinematicScene;
