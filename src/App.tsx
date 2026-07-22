import { Component, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { useGSAP } from '@gsap/react';
import { Leva } from 'leva';
import { Experience } from './scene/Experience';
import { Hud } from './ui/Hud';
import { BootLoader } from './ui/chrome/BootLoader';
import { Fallback } from './ui/Fallback';
import { ManifestoSection } from './scroll/ManifestoSection';
import { initConductor } from './motion/conductor';
import { detectCapabilities } from './hooks/useCapabilities';
import { useStore } from './state/store';
import { DEBUG_FLAGS } from './debugFlags';

/** Loader/shader/context crashes route to the static record, never a blank page. */
class SceneBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: Error) {
    console.error('[cyphernaut] scene failure — switching to static record:', error);
    useStore.getState().setFallback();
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

/**
 * Never create a WebGL context in a PRERENDERING document — some environments
 * prerender a second copy of the page, and two 550k-triangle scenes compiling
 * at once is how contexts get killed. Merely-hidden documents still mount:
 * embedded panes can report "hidden" while visibly displayed, and rAF simply
 * resumes when they surface.
 */
function useDocumentVisible(): boolean {
  const [ready, setReady] = useState(
    () => !(document as Document & { prerendering?: boolean }).prerendering
  );
  useEffect(() => {
    if (ready) return;
    const check = () => {
      if (!(document as Document & { prerendering?: boolean }).prerendering) setReady(true);
    };
    document.addEventListener('prerenderingchange', check);
    return () => document.removeEventListener('prerenderingchange', check);
  }, [ready]);
  return ready;
}

export default function App() {
  const fallback = useStore((s) => s.fallbackMode);
  const visible = useDocumentVisible();

  useEffect(() => {
    const caps = detectCapabilities();
    if (caps.mode === 'fallback') useStore.getState().setFallback();
    else useStore.getState().setTier(DEBUG_FLAGS.tierOverride ?? caps.tier);

    if (DEBUG_FLAGS.motionOverride) {
      useStore.getState().setReducedMotion(DEBUG_FLAGS.motionOverride === 'reduced');
      return;
    }
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    useStore.getState().setReducedMotion(mq.matches);
    const onChange = (e: MediaQueryListEvent) => useStore.getState().setReducedMotion(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  useGSAP(() => {
    const dispose = initConductor();
    return dispose;
  }, []);

  if (fallback) return <Fallback />;

  return (
    <>
      {/* Live render-tuning panel — invisible unless ?debug=1 is on the URL. */}
      <Leva hidden={!DEBUG_FLAGS.debug} collapsed />
      <div className="cy-hero">
        <div className="cy-canvas-holder">
          {visible && (
            <SceneBoundary>
              <Experience />
            </SceneBoundary>
          )}
        </div>
        <SceneBoundary>
          <Hud />
        </SceneBoundary>
      </div>
      <ManifestoSection />
      <BootLoader />
    </>
  );
}
