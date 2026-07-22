import { useEffect } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import { setLensPointer, updateLensFrame } from './lensUniforms';
import { DEBUG_FLAGS } from '../../debugFlags';

/**
 * Drives the shared lens each frame: tracks the pointer in canvas-CSS pixels,
 * then advances the eased center + radius against the renderer's real pixel
 * ratio so gl_FragCoord math stays exact across DPR and quality tiers.
 *
 * One instance only (the cypherpunk character mounts it).
 */
export function useXrayDriver() {
  const gl = useThree((s) => s.gl);

  useEffect(() => {
    const el = gl.domElement;
    const onMove = (e: PointerEvent) => {
      const rect = el.getBoundingClientRect();
      setLensPointer(e.clientX - rect.left, e.clientY - rect.top);
    };
    // On window, not the canvas: the DOM HUD sits above the canvas and would
    // otherwise swallow the moves.
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => window.removeEventListener('pointermove', onMove);
  }, [gl]);

  useFrame((state, dt) => {
    updateLensFrame(
      Math.min(dt, 0.05),
      state.size.width,
      state.size.height,
      gl.getPixelRatio(),
      DEBUG_FLAGS.xray === 'full'
    );
  });
}

/** Component wrapper so the driver hook is mounted conditionally (once), not
 *  called behind a runtime branch. Renders nothing. */
export function XrayDriver() {
  useXrayDriver();
  return null;
}
