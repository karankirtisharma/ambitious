import { Suspense, useCallback, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Preload, PerformanceMonitor } from '@react-three/drei';
import { CameraRig } from './CameraRig';
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
    if (protocolRunning()) return;
    const { tier, setTier } = useStore.getState();
    if (tier === 'high') setTier('mid');
    else if (tier === 'mid') setTier('low');
  }, []);

  return (
    <Canvas
      gl={{
        powerPreference: 'high-performance',
        antialias: false,
        stencil: false,
        alpha: false,
      }}
      dpr={TIER_DPR[tier]}
      camera={{ fov: BOOT_POSE.fov, near: 0.1, far: 60, position: BOOT_POSE.position }}
      onCreated={({ raycaster, gl, scene }) => {
        if (import.meta.env.DEV) (window as unknown as { __scene?: unknown }).__scene = scene;
        // Pointer events only ever test layer-1 hitboxes — the 260k-triangle
        // character meshes never enter an intersection test.
        raycaster.layers.set(1);
        gl.domElement.addEventListener('webglcontextlost', (e) => {
          e.preventDefault();
          contextLosses.current += 1;
          // First death: shed weight and let the context restore.
          // Second death: the hardware has spoken — static record.
          if (contextLosses.current === 1) useStore.getState().setTier('low');
          else useStore.getState().setFallback();
        });
      }}
    >
      <color attach="background" args={[COLORS.bg]} />
      {/* Far plane sits past the vault plate (z −8.5) so it reads through
          the haze instead of dissolving into it. */}
      <fog attach="fog" args={[COLORS.bg, 10, 34]} />
      <PerformanceMonitor onDecline={degrade}>
        <Suspense fallback={null}>
          <CameraRig />
          <LightingRig />
          <Stage />
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
