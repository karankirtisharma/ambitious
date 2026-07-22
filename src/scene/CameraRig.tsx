import { useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { PerspectiveCamera, Vector3 } from 'three';
import { easing } from 'maath';
import { cameraProxy } from '../motion/proxies';

/**
 * The camera is another character. This is its ONLY writer: the conductor
 * tweens the proxy, the rig composes proxy + damped mouse parallax + layered
 * idle drift + the one-shot protocol thump into the real camera each frame.
 */
export function CameraRig() {
  const parallax = useRef(new Vector3());
  const lookAt = useRef(new Vector3());
  const camera = useThree((s) => s.camera) as PerspectiveCamera;

  useFrame(({ pointer, clock, size }, dt) => {
    const t = clock.elapsedTime;

    // Portrait compensation: the composition is authored for landscape.
    // Narrow aspects pull the dolly back and widen the lens so both
    // characters stay in frame — desktop (aspect ≥ ~1.45) is untouched.
    const aspect = size.width / Math.max(size.height, 1);
    const fit = Math.min(Math.max(1.45 / aspect, 1), 1.9);

    // Gentle mouse parallax. Kept small and well-damped: a strong swing (0.3)
    // felt floaty on its own AND fought the drag-to-spin — sweeping the cursor
    // to rotate a character used to yank the camera with it. A restrained,
    // slow-following parallax still reads as depth without hijacking the frame.
    easing.damp3(
      parallax.current,
      [
        pointer.x * 0.13 * cameraProxy.parallax,
        pointer.y * 0.06 * cameraProxy.parallax,
        0,
      ],
      0.85,
      dt
    );

    // Incommensurate sines = organic handheld breathing, never a loop. Amplitude
    // is deliberately SUBTLE now — just enough life that the chamber isn't dead
    // still, but calm enough that the composition stays settled.
    const driftX = Math.sin(t * 0.23) * 0.045;
    const driftY = Math.sin(t * 0.17 + 1.3) * 0.02;
    const driftZ = Math.sin(t * 0.11) * 0.06;

    // The protocol thump: a decaying push, plus the faintest tremble.
    const s = cameraProxy.shake;
    const shakeY = -s * 0.035 + Math.sin(t * 51.0) * 0.006 * s;
    const shakeZ = s * 0.07;

    // The target follows the parallax less than the body — depth feel.
    lookAt.current.set(
      cameraProxy.tx + parallax.current.x * 0.35,
      cameraProxy.ty + parallax.current.y * 0.35,
      cameraProxy.tz
    );

    // Position = target + (pose − target) · fit, plus the additive layers.
    camera.position.set(
      lookAt.current.x + (cameraProxy.px - lookAt.current.x) * fit + parallax.current.x + driftX,
      lookAt.current.y + (cameraProxy.py - lookAt.current.y) * fit + parallax.current.y + driftY + shakeY,
      lookAt.current.z + (cameraProxy.pz - lookAt.current.z) * fit + driftZ + shakeZ
    );
    camera.lookAt(lookAt.current);

    const targetFov = cameraProxy.fov + (fit - 1) * 14;
    if (Math.abs(camera.fov - targetFov) > 0.01) {
      camera.fov = targetFov;
      camera.updateProjectionMatrix();
    }
  });

  return null;
}
