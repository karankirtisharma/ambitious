import { useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Vector3 } from 'three';

const BASE = new Vector3(0, 1.7, 8.6);
const TARGET = new Vector3(0, 1.05, 0);

/**
 * Slow cinematic drift + damped pointer parallax. All eased — the camera
 * never snaps; a still viewer sees an almost imperceptible float.
 */
export function CameraDrift() {
  const camera = useThree((s) => s.camera);
  const pointer = useThree((s) => s.pointer);
  const eased = useRef({ x: 0, y: 0 });

  useFrame(({ clock }, dt) => {
    const t = clock.elapsedTime;
    const k = Math.min(dt * 2.2, 1);
    eased.current.x += (pointer.x - eased.current.x) * k;
    eased.current.y += (pointer.y - eased.current.y) * k;

    camera.position.set(
      BASE.x + Math.sin(t * 0.11) * 0.22 + eased.current.x * 0.28,
      BASE.y + Math.sin(t * 0.17 + 1.3) * 0.08 + eased.current.y * 0.12,
      BASE.z
    );
    camera.lookAt(TARGET);
  });

  return null;
}
