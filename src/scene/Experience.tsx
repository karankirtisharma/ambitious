import { Suspense, useCallback, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Preload, PerformanceMonitor } from '@react-three/drei';
import { CameraRig } from './CameraRig';
import { SceneEnvironment } from './SceneEnvironment';
import { LiquidBackground } from './liquidbg/LiquidBackground';
import { LightingRig } from './LightingRig';
import { Stage } from './Stage';
import { Character } from './Character';
import { Pedestal } from './Pedestal';
import { ProtocolCore } from './ProtocolCore';
import { EnergyBridge } from './EnergyBridge';
import { PostFX } from './PostFX';
import { COLORS } from '../config/lightingPresets';
import { BOOT_POSE } from '../config/cameraPoses';
import { useStore } from '../state/store';
import { bootFlags } from '../hooks/useCapabilities';
import { DEBUG_FLAGS } from '../debugFlags';

function ReadyFlag() {
  const done = useRef(false);
  useFrame(() => {
    if (!done.current) {
      done.current = true;
      bootFlags.firstFrame = true;
    }
  });
  return null;
}

const TIER_DPR: Record<'high' | 'mid' | 'low', [number, number]> = {
  high: [1, 1.75],
  mid: [1, 1.25],
  low: [1, 1],
};

export function Experience() {
  const tier = useStore((s) => s.tier);
  const contextLosses = useRef(0);

  // Runtime adaptation — never mid-ceremony.
  const protocolRunning = () => {
    const scene = useStore.getState().scene;
    return (
      scene === 'protocolInitiated' || scene === 'synchronization' || scene === 'protocolComplete'
    );
  };

  const degrade = useCallback(() => {
    // Never step tier before boot: the first-frame shader-compile FPS crater
    // would otherwise cascade high→mid→low and thrash the Floor/PostFX mount.
    if (!useStore.getState().booted) return;
    if (protocolRunning()) return;
    const { tier, setTier } = useStore.getState();
    if (tier === 'high') setTier('mid');
    else if (tier === 'mid') setTier('low');
  }, []);

  return (
    <Canvas
      shadows
      gl={{
        powerPreference: 'high-performance',
        antialias: false,
        stencil: false,
        alpha: false,
      }}
      dpr={TIER_DPR[tier]}
      camera={{ fov: BOOT_POSE.fov, near: 0.1, far: 60, position: BOOT_POSE.position }}
      onCreated={({ raycaster, gl, scene, camera }) => {
        if (import.meta.env.DEV) {
          const w = window as unknown as { __scene?: unknown; __camera?: unknown };
          w.__scene = scene;
          w.__camera = camera;
        }
        // Pointer events only ever test layer-1 hitboxes — the 260k-triangle
        // character meshes never enter an intersection test.
        raycaster.layers.set(1);

        // Context-loss recovery. THE fix for the "black canvas over a
        // dismissed boot" bug: a heavy first frame can lose the context, and
        // the old handler only dropped tier — with no restore path and no
        // watchdog, a non-restoring loss left the canvas permanently black
        // (boot already gone, fallback never armed). Now: preventDefault so
        // the browser will restore, shed weight, ask R3F to redraw on
        // restore, and if restore never comes, degrade to the static record.
        let watchdog: ReturnType<typeof setTimeout> | null = null;
        gl.domElement.addEventListener('webglcontextlost', (e) => {
          e.preventDefault();
          contextLosses.current += 1;
          if (contextLosses.current === 1) useStore.getState().setTier('low');
          else useStore.getState().setFallback();
          if (watchdog) clearTimeout(watchdog);
          watchdog = setTimeout(() => {
            // No restore in time → static record beats an eternal black frame.
            useStore.getState().setFallback();
          }, 2600);
        });
        gl.domElement.addEventListener('webglcontextrestored', () => {
          // R3F's always-on frameloop resumes rendering on its own once the
          // context is back; we only need to disarm the fallback watchdog.
          if (watchdog) {
            clearTimeout(watchdog);
            watchdog = null;
          }
        });
      }}
    >
      <color attach="background" args={[COLORS.bg]} />
      {/* FogExp2, colour == background: invisible until lit, and it dissolves
          the floor/backdrop seam into the void while attenuating the far portal
          bloom for free depth. (Linear near/far fog left a visible band.) */}
      <fogExp2 attach="fog" args={[COLORS.bg, 0.032]} />
      <PerformanceMonitor onDecline={degrade}>
        <Suspense fallback={null}>
          <SceneEnvironment />
          <CameraRig />
          <LightingRig />
          <Stage />
          {DEBUG_FLAGS.env !== 'off' && (
            <LiquidBackground
              reflectionRes={tier === 'low' ? 256 : tier === 'mid' ? 384 : 512}
              smokeIntensity={tier === 'low' ? 0 : 1}
              moteCount={tier === 'low' ? 0 : 26}
            />
          )}
          <Character side="cypherpunk" />
          <Character side="astronaut" />
          <Pedestal side="left" />
          <Pedestal side="right" />
          <ProtocolCore />
          <EnergyBridge />
          <PostFX />
          <Preload all />
          <ReadyFlag />
        </Suspense>
      </PerformanceMonitor>
    </Canvas>
  );
}
