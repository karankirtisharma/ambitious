import { useRef } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { useStore } from '../../state/store';
import type { Side } from '../../state/transitions';
import { CHARACTER_LABELS, HOVER_LABELS } from '../../config/content';
import { AsciiGlitchRipple } from '../fx/AsciiGlitchRipple';
import { md, DUR } from '../../motion/motionConfig';

/**
 * "CYPHERPUNK // HACKER" — plus the small technical labels that fade in
 * around a character when the cursor pays attention. They appear quietly and
 * dissolve naturally; they never dominate.
 */
export function CharacterLabel({ side }: { side: Side }) {
  const scene = useStore((s) => s.scene);
  const root = useRef<HTMLDivElement>(null);

  const isLeft = side === 'cypherpunk';
  const hot = scene === (isLeft ? 'hoverCypherpunk' : 'hoverAstronaut');
  const ownPanel = scene === (isLeft ? 'cypherpunkPanel' : 'astronautPanel');
  // The ceremony and the story bring their own identity columns.
  const yielded =
    ownPanel ||
    scene === 'protocolInitiated' ||
    scene === 'synchronization' ||
    scene === 'protocolComplete' ||
    scene === 'scrollStory';

  useGSAP(
    () => {
      const lines = root.current!.querySelectorAll('.cy-charlabel__techline');

      gsap.to(root.current, {
        autoAlpha: yielded ? 0 : 1,
        duration: md(0.5),
        ease: yielded ? 'power2.in' : 'power2.out',
        overwrite: 'auto',
      });

      if (hot) {
        gsap.to(lines, {
          opacity: 1,
          y: 0,
          duration: md(0.35),
          ease: 'power3.out',
          stagger: DUR.labelStagger,
          delay: md(0.22),
          overwrite: 'auto',
        });
      } else {
        gsap.to(lines, {
          opacity: 0,
          y: 8,
          duration: md(0.2),
          ease: 'power2.in',
          stagger: { each: 0.03, from: 'end' },
          overwrite: 'auto',
        });
      }
    },
    { dependencies: [hot, yielded], scope: root }
  );

  const label = CHARACTER_LABELS[side];

  return (
    <div
      ref={root}
      className={[
        'cy-charlabel',
        isLeft ? 'cy-charlabel--left' : 'cy-charlabel--right',
        hot ? 'cy-charlabel--hot' : '',
      ].join(' ')}
      aria-hidden="true"
    >
      {/* Fired by SCENE state, not by pointer: the HUD sits under
          pointer-events:none, so this node can never receive mouseenter.
          The name glitches at the instant its 3D character is hovered. */}
      <AsciiGlitchRipple
        as="div"
        className="cy-charlabel__name"
        trigger={hot}
        interactive={false}
        dur={780}
        spread={1.3}
      >
        {label.primary}
      </AsciiGlitchRipple>
      <div className="cy-charlabel__role">{label.secondary}</div>
      <div className="cy-charlabel__tech">
        {HOVER_LABELS[side].map((line) => (
          <div key={line} className="cy-charlabel__techline">
            <b>▸</b> {line}
          </div>
        ))}
      </div>
    </div>
  );
}
