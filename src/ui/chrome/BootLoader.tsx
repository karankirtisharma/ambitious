import { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { useProgress } from '@react-three/drei';
import { Logo } from './Logo';
import { useStore } from '../../state/store';
import { bootFlags } from '../../hooks/useCapabilities';
import { FlipFadeText } from '../fx/FlipFadeText';

/** Cycles beside the percentage while assets stream in. Deliberately verbs in
 *  the boot log's voice, so the two readouts feel like one machine talking. */
const BOOT_WORDS = ['DECRYPTING', 'HANDSHAKING', 'MOUNTING', 'CALIBRATING', 'SYNCING'];

const LOG_LINES: Array<[number, string]> = [
  [0, 'ESTABLISHING SECURE CHANNEL …'],
  [12, 'HANDSHAKE ACCEPTED — AES-256'],
  [28, 'MOUNTING /dev/cypher … OK'],
  [46, 'DECRYPTING GEOMETRY STREAMS'],
  [68, 'CALIBRATING OPTICS'],
  [86, 'SYNCING PEDESTAL ARRAY'],
  [100, 'ALL SYSTEMS NOMINAL'],
];

const MIN_BOOT_MS = 1400;
const FAILSAFE_MS = 9000;

/**
 * Secure-OS boot screen over real asset progress. Gate: assets loaded AND the
 * first frame has actually rendered AND a minimum beat has passed — then
 * "ACCESS GRANTED", a slow fade, and the establishing camera settle.
 */
export function BootLoader() {
  const { progress, active } = useProgress();
  const [gone, setGone] = useState(false);
  const [granted, setGranted] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const started = useRef(performance.now());
  const hiddenAt = useRef(0);
  const finishing = useRef(false);

  useEffect(() => {
    const id = window.setInterval(() => {
      if (finishing.current) return;
      const now = performance.now();
      // Hidden documents legitimately stop rAF — only continuous VISIBLE
      // time without a frame counts as a dead render loop.
      if (document.visibilityState !== 'visible') hiddenAt.current = now;
      const elapsed = now - started.current;
      const visibleFor = now - Math.max(hiddenAt.current, started.current);
      const assetsDone = (!active && progress >= 100) || elapsed > FAILSAFE_MS;
      // If a visible render loop never produced a frame, the honest
      // degradation is the static record — never an eternal boot screen.
      if (visibleFor > FAILSAFE_MS && !bootFlags.firstFrame) {
        finishing.current = true;
        window.clearInterval(id);
        useStore.getState().setFallback();
        return;
      }
      if (assetsDone && bootFlags.firstFrame && elapsed > MIN_BOOT_MS) {
        finishing.current = true;
        window.clearInterval(id);
        setGranted(true);
        gsap.to('.cy-boot__granted', { opacity: 1, duration: 0.35, ease: 'power2.out' });
        gsap.to(root.current, {
          opacity: 0,
          duration: 1.1,
          delay: 0.9,
          ease: 'power2.inOut',
          onComplete: () => {
            useStore.getState().setBooted();
            setGone(true);
          },
        });
      }
    }, 100);
    return () => window.clearInterval(id);
  }, [progress, active]);

  if (gone) return null;

  const pct = Math.round(progress);
  const visibleLines = LOG_LINES.filter(([at]) => pct >= at || at === 0);
  const latestLine = granted ? 'Access granted' : visibleLines[visibleLines.length - 1]?.[1] ?? '';

  return (
    <div className="cy-boot" ref={root}>
      {/* Coarse steps only — the fast percentage stays out of the live region. */}
      <span className="visually-hidden" role="status" aria-live="polite">
        {latestLine}
      </span>
      <div className="cy-boot__box">
        <div className="cy-boot__logo">
          <Logo size={40} />
        </div>
        <div className="cy-boot__log" aria-hidden="true">
          {visibleLines.map(([at, line]) => (
            <div key={at}>
              <span className="ok">▸</span> {line}
            </div>
          ))}
        </div>
        <div className="cy-boot__barwrap">
          <div className="cy-boot__bar">
            <i style={{ transform: `scaleX(${Math.max(pct, 2) / 100})` }} />
          </div>
          <div className="cy-boot__pct num">
            {/* Held short: the boot gate can clear in ~1.4s, and a 2.5s cycle
                would only ever show a single word. */}
            <FlipFadeText words={BOOT_WORDS} interval={900} />
            <span>{String(pct).padStart(3, '0')}%</span>
          </div>
        </div>
        <div className="cy-boot__granted">{granted ? 'ACCESS GRANTED' : ' '}</div>
      </div>
    </div>
  );
}
