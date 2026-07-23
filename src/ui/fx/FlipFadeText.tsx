import { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { md, me } from '../../motion/motionConfig';

/**
 * Cycling word whose letters flip in on the X axis with a blur/fade stagger,
 * then flip out before the next word lands.
 *
 * Ported from vengenceui's `flip-fade-text`, which is built on framer-motion +
 * Tailwind. Neither is a dependency here and adding framer-motion to a project
 * that already routes ALL motion through GSAP would mean two animation engines
 * competing for the same properties — so the variants are re-expressed as GSAP
 * tweens. The visual result is the same three-part letter transform (rotateX,
 * y, opacity+blur) on a stagger.
 *
 * Durations go through `md()`/`me()`, so reduced motion collapses this the same
 * way it collapses everything else instead of needing a separate branch.
 */

const DEFAULT_WORDS = ['DECRYPTING', 'MOUNTING', 'CALIBRATING', 'SYNCING', 'VERIFYING'];

interface FlipFadeTextProps {
  words?: string[];
  /** ms a word is held before it flips out. */
  interval?: number;
  className?: string;
  /** Seconds for a single letter's entrance. */
  letterDuration?: number;
  staggerDelay?: number;
  exitStaggerDelay?: number;
}

export function FlipFadeText({
  words = DEFAULT_WORDS,
  interval = 1100,
  className,
  letterDuration = 0.5,
  staggerDelay = 0.045,
  exitStaggerDelay = 0.025,
}: FlipFadeTextProps) {
  const [index, setIndex] = useState(0);
  const wrap = useRef<HTMLSpanElement>(null);

  const word = words[index % words.length] ?? '';

  // Flip the current word OUT, and only advance once it has left — swapping on
  // a bare interval would pop the new word in over the old one mid-exit.
  useEffect(() => {
    if (words.length < 2) return;
    const id = window.setInterval(() => {
      const letters = wrap.current?.querySelectorAll<HTMLElement>('.cy-flip__l');
      if (!letters?.length) return;
      gsap.to(letters, {
        rotateX: -90,
        y: -12,
        opacity: 0,
        filter: 'blur(8px)',
        duration: md(letterDuration * 0.67),
        ease: me('power2.in'),
        stagger: exitStaggerDelay,
        overwrite: 'auto',
        onComplete: () => setIndex((i) => (i + 1) % words.length),
      });
    }, interval);
    return () => window.clearInterval(id);
  }, [words, interval, letterDuration, exitStaggerDelay]);

  // Entrance — re-runs on every word swap. useGSAP scopes and reverts it, so
  // an unmount mid-flight never leaves letters stranded at rotateX 90.
  useGSAP(
    () => {
      const letters = wrap.current!.querySelectorAll<HTMLElement>('.cy-flip__l');
      if (!letters.length) return;
      // A backgrounded tab suspends rAF, which suspends GSAP — so a fromTo
      // would apply its `from` state (opacity 0) and then never advance,
      // leaving the word INVISIBLE. On a loading screen that is the one place
      // it must never happen: tab away mid-boot, come back, and the label has
      // vanished. Land straight on the resting state instead.
      if (document.visibilityState === 'hidden') {
        gsap.set(letters, { rotateX: 0, y: 0, opacity: 1, filter: 'blur(0px)' });
        return;
      }
      gsap.fromTo(
        letters,
        { rotateX: 90, y: 12, opacity: 0, filter: 'blur(8px)' },
        {
          rotateX: 0,
          y: 0,
          opacity: 1,
          filter: 'blur(0px)',
          duration: md(letterDuration),
          ease: me('power3.out'),
          stagger: staggerDelay,
          overwrite: 'auto',
        }
      );
    },
    { dependencies: [index, word], scope: wrap }
  );

  return (
    // aria-hidden: the boot screen already announces its state through a
    // polite live region — a per-letter cycling word would flood it.
    <span ref={wrap} className={['cy-flip', className].filter(Boolean).join(' ')} aria-hidden="true">
      {word.split('').map((ch, i) => (
        <span className="cy-flip__l" key={`${word}-${i}`}>
          {ch === ' ' ? ' ' : ch}
        </span>
      ))}
    </span>
  );
}
