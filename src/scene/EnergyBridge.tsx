import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  AdditiveBlending,
  BufferGeometry,
  Float32BufferAttribute,
  Points,
  ShaderMaterial,
  Vector3,
} from 'three';
import { BRIDGE_VERT, BRIDGE_FRAG } from './shaders';
import { fxProxy } from '../motion/proxies';
import { CHAR_X, CHEST_Y } from '../config/cameraPoses';
import { useStore } from '../state/store';

const COUNTS = { high: 6000, mid: 3000, low: 1500 } as const;

/**
 * The synchronization centerpiece: particles flowing chest-to-chest along an
 * in-shader Bézier through the core. Half travel each direction — a mutual
 * exchange, not a beam attack. Chaos → order is the narrative: turbulence
 * collapses as the sync progresses.
 */
export function EnergyBridge() {
  const points = useRef<Points>(null!);
  const material = useRef<ShaderMaterial>(null!);
  const tier = useStore((s) => s.tier);
  const count = COUNTS[tier];

  const geometry = useMemo(() => {
    const geo = new BufferGeometry();
    const pos = new Float32Array(count * 3); // computed in-shader
    const progress = new Float32Array(count);
    const speed = new Float32Array(count);
    const seed = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      progress[i] = Math.random();
      const s = 0.6 + Math.random() * 0.8;
      speed[i] = i % 2 === 0 ? s : -s;
      seed[i] = Math.random();
    }
    geo.setAttribute('position', new Float32BufferAttribute(pos, 3));
    geo.setAttribute('aProgress', new Float32BufferAttribute(progress, 1));
    geo.setAttribute('aSpeed', new Float32BufferAttribute(speed, 1));
    geo.setAttribute('aSeed', new Float32BufferAttribute(seed, 1));
    return geo;
  }, [count]);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uIntensity: { value: 0 },
      uFlow: { value: 0.05 },
      uTurbulence: { value: 1 },
      uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
      uP0: { value: new Vector3(-CHAR_X + 0.45, CHEST_Y, 0) },
      uP1: { value: new Vector3(-0.7, CHEST_Y + 0.22, 0) },
      uP2: { value: new Vector3(0.7, CHEST_Y + 0.22, 0) },
      uP3: { value: new Vector3(CHAR_X - 0.45, CHEST_Y, 0) },
    }),
    []
  );

  // Tier changes swap the geometry; R3F only auto-disposes on unmount.
  useEffect(() => () => geometry.dispose(), [geometry]);

  useFrame(({ clock, gl }) => {
    const b = fxProxy.uBridge;
    points.current.visible = b > 0.002;
    if (!points.current.visible) return;
    // PARKED (intentional): these sync particles blow out to a white cloud under
    // the current AgX + bloom pipeline. Writing the memo object here — which R3F
    // does NOT propagate to the mounted material — keeps them dormant/invisible.
    // Do NOT redirect these to material.current.uniforms without ALSO retuning
    // intensity + bloom, or the blown-out cloud comes back.
    uniforms.uTime.value = clock.elapsedTime;
    uniforms.uIntensity.value = Math.min(b, 1);
    uniforms.uFlow.value = fxProxy.uFlow;
    uniforms.uTurbulence.value = fxProxy.uTurbulence;
    // The renderer's tier-clamped ratio, not the device's raw one.
    uniforms.uPixelRatio.value = gl.getPixelRatio();
    geometry.setDrawRange(0, Math.floor(count * Math.min(b * 1.3 + 0.1, 1)));
  });

  return (
    <points ref={points} geometry={geometry} frustumCulled={false} visible={false}>
      <shaderMaterial
        ref={material}
        vertexShader={BRIDGE_VERT}
        fragmentShader={BRIDGE_FRAG}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        blending={AdditiveBlending}
      />
    </points>
  );
}
