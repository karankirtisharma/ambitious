import {
  useEffect,
  useLayoutEffect,
  useRef,
  type AnchorHTMLAttributes,
  type ElementType,
} from 'react';
import { useStore } from '../../state/store';

/**
 * Character-scramble wave that ripples out from the cursor across a line of
 * text. Ported from vengenceui's `ascii-glitch-ripple`, which ships as a
 * shadcn/Tailwind component — this project has neither Tailwind nor `cn`, so
 * the styling hooks are plain classes and the logic is the only thing kept.
 *
 * Two deliberate departures from the upstream component:
 *
 * 1. ACCESSIBILITY. Upstream leaves the scrambled glyphs as the element's only
 *    text, so a screen reader announces "░▒▓█!?" mid-wave. Every instance here
 *    carries `aria-label` with the real string, so assistive tech reads the
 *    word no matter what the pixels are doing.
 * 2. `trigger`. Upstream only fires on real pointer events. Several targets
 *    here (the character HUD labels) sit under `pointer-events: none` and can
 *    never receive `mouseenter`, so they drive the wave from scene state
 *    instead — the ripple fires when the 3D character is hovered.
 *
 * The node is written IMPERATIVELY (`textContent`) and therefore renders with
 * NO React children, per the UI contract in CLAUDE.md — React text plus
 * imperative text in one node is a `removeChild` crash. The first write is a
 * layout effect so the text is present before paint rather than flashing empty.
 */

// Wave shaping — upstream defaults, kept as-is.
const WAVE_THRESH = 3;
const CHAR_MULT = 3;
const ANIM_STEP = 40;
const WAVE_BUF = 5;

const DEFAULT_CHARS =
  '.,·-─~+:;=*π┐┌┘┴┬╗╔╝╚╬╠╣╩╦║░▒▓█▄▀▌▐■!?&#$@0123456789*';

type AsciiGlitchRippleProps = {
  /** The real text. Also the accessible name. */
  children: string;
  /** Element to render. Defaults to a span — upstream defaults to an anchor,
   *  which is the wrong default outside a link context. */
  as?: ElementType;
  className?: string;
  /** Wave lifetime in ms. */
  dur?: number;
  chars?: string;
  preserveSpaces?: boolean;
  /** Larger = wider, slower-reading wave. */
  spread?: number;
  /** Fire a wave when this flips true — for nodes that cannot be hovered. */
  trigger?: boolean;
  /** Whether pointer movement spawns waves. Off for non-interactive labels. */
  interactive?: boolean;
  // Anchor attrs rather than plain HTML attrs: nav links are the main target
  // and need `href`. Superset — non-anchor hosts simply pass fewer of them.
} & Omit<AnchorHTMLAttributes<HTMLElement>, 'children'>;

interface Wave {
  startPos: number;
  startTime: number;
}

export function AsciiGlitchRipple({
  children,
  as = 'span',
  className,
  dur = 900,
  chars = DEFAULT_CHARS,
  preserveSpaces = true,
  spread = 1.0,
  trigger = false,
  interactive = true,
  ...rest
}: AsciiGlitchRippleProps) {
  // An arbitrary ElementType cannot carry a typed ref; the cast is contained
  // to this line and the runtime element is always a real DOM tag.
  const Component = as as 'span';
  const elRef = useRef<HTMLElement>(null);
  // Scrambling runs at frame rate — all of it lives in a ref so a wave never
  // triggers a React render.
  const st = useRef({
    txt: children,
    glyphs: children.split(''),
    isAnim: false,
    cursorPos: 0,
    waves: [] as Wave[],
    animId: 0,
    isHover: false,
    lockedW: 0,
    dur,
    chars,
    preserveSpaces,
    spread,
  });

  // Under reduced motion the effect is simply never armed — the text renders
  // and stays put. One code path, per the motion policy.
  const reduced = useStore((s) => s.reducedMotion);
  // Set by the listener effect so the `trigger` effect can fire the same wave
  // spawner the pointer uses. Declared here so both effects close over it.
  const spawnRef = useRef<(() => void) | null>(null);
  const wasTriggered = useRef(false);

  // Keep the mutable mirror in step with props, and re-render the plain text if
  // the string itself changed while idle.
  useLayoutEffect(() => {
    const s = st.current;
    s.txt = children;
    s.glyphs = children.split('');
    s.dur = dur;
    s.chars = chars;
    s.preserveSpaces = preserveSpaces;
    s.spread = spread;
    if (elRef.current && s.lockedW) {
      elRef.current.style.width = '';
      s.lockedW = 0;
    }
    if (!s.isAnim && elRef.current) elRef.current.textContent = children;
  }, [children, dur, chars, preserveSpaces, spread]);

  useEffect(() => {
    const el = elRef.current;
    if (!el || reduced) return;

    const stop = () => {
      const s = st.current;
      el.textContent = s.txt;
      if (s.lockedW) {
        el.style.width = '';
        s.lockedW = 0;
      }
      s.isAnim = false;
      if (s.animId) {
        cancelAnimationFrame(s.animId);
        s.animId = 0;
      }
    };

    /** How a single glyph is displaced by every wave currently alive. */
    const glyphAt = (idx: number, now: number) => {
      const s = st.current;
      let hit = false;
      let glyph = s.glyphs[idx];
      for (const w of s.waves) {
        const age = now - w.startTime;
        const prog = Math.min(age / s.dur, 1);
        const dist = Math.abs(idx - w.startPos);
        const maxDist = Math.max(w.startPos, s.glyphs.length - w.startPos - 1);
        const rad = (prog * (maxDist + WAVE_BUF)) / s.spread;
        if (dist <= rad) {
          hit = true;
          // Only the leading EDGE of the wave scrambles; everything the wave
          // has already passed settles back to the real character. That is
          // what reads as a travelling ripple rather than a block of noise.
          const intens = rad - dist;
          if (intens <= WAVE_THRESH && intens > 0) {
            glyph = s.chars[(dist * CHAR_MULT + Math.floor(age / ANIM_STEP)) % s.chars.length];
          }
        }
      }
      return { hit, glyph };
    };

    const frame = () => {
      const s = st.current;
      const now = performance.now();
      s.waves = s.waves.filter((w) => now - w.startTime < s.dur);
      if (s.waves.length === 0) {
        stop();
        return;
      }
      el.textContent = s.glyphs
        .map((c, i) => {
          if (s.preserveSpaces && c === ' ') return ' ';
          const r = glyphAt(i, now);
          return r.hit ? r.glyph : c;
        })
        .join('');
      s.animId = requestAnimationFrame(frame);
    };

    const spawn = () => {
      const s = st.current;
      s.waves.push({ startPos: s.cursorPos, startTime: performance.now() });
      if (s.isAnim) return;
      // Freeze the rendered width first: the substitute glyphs are not
      // metrically identical, so an unlocked inline element visibly jitters
      // its neighbours in a flex row for the whole wave.
      if (!s.lockedW) {
        s.lockedW = el.getBoundingClientRect().width;
        el.style.width = `${s.lockedW}px`;
      }
      s.isAnim = true;
      s.animId = requestAnimationFrame(frame);
    };

    // Expose the spawner so the `trigger` effect below can reuse it.
    spawnRef.current = spawn;
    // Dev handle: the wave is pointer-driven and sub-second, which makes it
    // near-impossible to catch from an automated browser. Lets a probe fire a
    // wave deterministically and sample the glyphs.
    if (import.meta.env.DEV) (el as unknown as Record<string, unknown>).__asciiSpawn = spawn;

    if (!interactive) return () => stop();

    const track = (e: MouseEvent) => {
      const rect = el.getBoundingClientRect();
      const len = st.current.txt.length;
      const pos = Math.round(((e.clientX - rect.left) / rect.width) * len);
      st.current.cursorPos = Math.max(0, Math.min(pos, len - 1));
    };
    const onEnter = (e: MouseEvent) => {
      st.current.isHover = true;
      track(e);
      spawn();
    };
    const onMove = (e: MouseEvent) => {
      if (!st.current.isHover) return;
      const prev = st.current.cursorPos;
      track(e);
      // One wave per character crossed, not one per mousemove event.
      if (st.current.cursorPos !== prev) spawn();
    };
    const onLeave = () => {
      st.current.isHover = false;
    };

    el.addEventListener('mouseenter', onEnter);
    el.addEventListener('mousemove', onMove);
    el.addEventListener('mouseleave', onLeave);
    return () => {
      el.removeEventListener('mouseenter', onEnter);
      el.removeEventListener('mousemove', onMove);
      el.removeEventListener('mouseleave', onLeave);
      stop();
    };
  }, [reduced, interactive]);

  // Programmatic waves — fired by scene state rather than the pointer.
  useEffect(() => {
    if (reduced) return;
    if (trigger && !wasTriggered.current) {
      st.current.cursorPos = 0; // sweep left → right across the word
      spawnRef.current?.();
    }
    wasTriggered.current = trigger;
  }, [trigger, reduced]);

  return (
    <Component
      ref={elRef as React.Ref<HTMLSpanElement>}
      className={['cy-ascii', className].filter(Boolean).join(' ')}
      aria-label={children}
      {...rest}
    />
  );
}
