import { useEffect } from 'react';
import { useStore, send } from '../state/store';
import { Nav } from './chrome/Nav';
import { FrameDecorations } from './chrome/FrameDecorations';
import { StatusFooter } from './chrome/StatusFooter';
import { CharacterLabel } from './hud/CharacterLabel';
import { ProtocolButton } from './hud/ProtocolButton';
import { ScrollHint } from './hud/ScrollHint';
import { HudStats } from './hud/HudStats';
import { XrayLensOverlay } from './hud/XrayLensOverlay';
import { DossierPanel } from './dossier/DossierPanel';
import { SyncOverlay } from './overlay/SyncOverlay';

/**
 * The DOM overlay root. pointer-events:none by default — the canvas keeps
 * receiving hover raycasts through it; only genuinely interactive elements
 * (.ia) opt back in. Carries data-scene for CSS state hooks.
 */
export function Hud() {
  const scene = useStore((s) => s.scene);
  const booted = useStore((s) => s.booted);
  const explorable =
    scene === 'idle' ||
    scene === 'hoverCypherpunk' ||
    scene === 'hoverAstronaut' ||
    scene === 'hoverProtocol';

  // Escape: closes a dossier, or cancels the protocol.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      const { scene, phase } = useStore.getState();
      if ((scene === 'cypherpunkPanel' || scene === 'astronautPanel') && phase !== 'exiting') {
        send({ type: 'CLOSE_PANEL' });
      } else if (
        (scene === 'protocolInitiated' || scene === 'synchronization') &&
        phase !== 'exiting'
      ) {
        send({ type: 'CANCEL_PROTOCOL' });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Idle wheel: the page is locked, but the room still answers — a single
  // rate-limited pulse nudge toward the protocol button.
  useEffect(() => {
    let last = 0;
    const onWheel = () => {
      const { scene, scrollUnlocked, booted } = useStore.getState();
      if (scrollUnlocked || !booted) return;
      const explorable =
        scene === 'idle' ||
        scene === 'hoverCypherpunk' ||
        scene === 'hoverAstronaut' ||
        scene === 'hoverProtocol';
      if (!explorable) return;
      const now = performance.now();
      if (now - last < 1200) return;
      last = now;
      window.dispatchEvent(new CustomEvent('cy-nudge'));
    };
    window.addEventListener('wheel', onWheel, { passive: true });
    window.addEventListener('touchmove', onWheel, { passive: true });
    return () => {
      window.removeEventListener('wheel', onWheel);
      window.removeEventListener('touchmove', onWheel);
    };
  }, []);

  return (
    <div data-scene={scene} style={{ pointerEvents: 'none' }}>
      <div className="cy-grain" aria-hidden="true" />
      <FrameDecorations />
      <Nav />

      {/* Keyboard path into the dossiers — sighted-mouse users raycast the 3D.
          Disabled outside explorable scenes so the affordance mirrors the FSM. */}
      {booted && (
        <div>
          <button
            id="cy-open-cypherpunk"
            className="visually-hidden ia"
            disabled={!explorable}
            onClick={() => send({ type: 'CLICK_CHAR', side: 'cypherpunk' })}
          >
            Open Cypherpunk dossier
          </button>
          <button
            id="cy-open-astronaut"
            className="visually-hidden ia"
            disabled={!explorable}
            onClick={() => send({ type: 'CLICK_CHAR', side: 'astronaut' })}
          >
            Open Astronaut dossier
          </button>
        </div>
      )}

      <XrayLensOverlay />
      <CharacterLabel side="cypherpunk" />
      <CharacterLabel side="astronaut" />
      <ProtocolButton />
      <ScrollHint />
      <HudStats />
      <StatusFooter />
      <DossierPanel />
      <SyncOverlay />
    </div>
  );
}
