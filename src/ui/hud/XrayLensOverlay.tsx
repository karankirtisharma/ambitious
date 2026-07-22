import { useEffect, useRef } from 'react';
import { lensState } from '../../scene/xray/lensUniforms';
import { DEBUG_FLAGS } from '../../debugFlags';

/**
 * The DOM companion to the shader lens: a soft radial glow ring glued to the
 * same center + radius the shader uses, so the on-screen affordance and the
 * reveal stay pixel-locked. A feathered gradient (not a hard border) matches
 * the shader's feathered edge.
 *
 * Reads lensState on its own rAF loop — it lives outside the Canvas, so it
 * cannot use useFrame. Writes only transform/size/opacity: no React re-render
 * per frame, no layout thrash.
 */
export function XrayLensOverlay() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (DEBUG_FLAGS.xray === 'off' || DEBUG_FLAGS.xray === 'full') return;
    const el = ref.current;
    if (!el) return;
    let raf = 0;
    const tick = () => {
      const r = lensState.cssRadius;
      if (r < 0.5) {
        el.style.opacity = '0';
      } else {
        // Ring a touch larger than the reveal so its glow frames the peek.
        const d = r * 2.4;
        el.style.width = `${d}px`;
        el.style.height = `${d}px`;
        el.style.transform = `translate(${lensState.cssX - d / 2}px, ${lensState.cssY - d / 2}px)`;
        el.style.opacity = String(Math.min(r / 24, 1));
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  if (DEBUG_FLAGS.xray === 'off' || DEBUG_FLAGS.xray === 'full') return null;

  return <div ref={ref} className="cy-xray-lens" aria-hidden="true" />;
}
