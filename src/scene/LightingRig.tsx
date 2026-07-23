import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Object3D, PointLight, SpotLight, DirectionalLight } from 'three';
import { lightProxy, fxProxy } from '../motion/proxies';
import { COLORS } from '../config/lightingPresets';
import { CHAR_X } from '../config/cameraPoses';
import { useStore } from '../state/store';

/**
 * High-contrast monochrome studio rig — hard key, dark fill, hot rims.
 *
 * No flat ambient shaping: the hemisphere is a low floor, the single
 * shadow-casting key does the modelling, the fill is deliberately weak so
 * the shadow side stays genuinely dark, and the rims run hot to cut edges
 * out of the black. Color enters only through the per-subject accent pools
 * and the protocol core.
 *
 * Channels stay proxy-driven so the conductor's state story is untouched:
 * key intensity = keyL+keyR (idle sums to the authored 2.75), rims are
 * 34×rimX, accents 3.2×accentX.
 */
export function LightingRig() {
  const key = useRef<DirectionalLight>(null!);
  const rimL = useRef<SpotLight>(null!);
  const rimR = useRef<SpotLight>(null!);
  const accL = useRef<PointLight>(null!);
  const accR = useRef<PointLight>(null!);
  const core = useRef<PointLight>(null!);
  const flood = useRef<PointLight>(null!);
  const tier = useStore((s) => s.tier);

  const targets = useMemo(() => {
    const l = new Object3D();
    l.position.set(-CHAR_X, 1.05, 0);
    const r = new Object3D();
    r.position.set(CHAR_X, 1.05, 0);
    const c = new Object3D();
    c.position.set(0, 0.9, 0);
    return { l, r, c };
  }, []);

  useFrame(() => {
    key.current.intensity = lightProxy.keyL + lightProxy.keyR;
    // 46, not 34. The host bloom threshold is 1.0, so an edge highlight only
    // GLOWS once its specular actually crosses 1.0 in the linear HDR buffer.
    // Running the rims hot is what buys the professional edge bloom; raising
    // bloom itself would wash the whole frame instead of just the highlights.
    // Key and fill are deliberately untouched — the lighting is the same, only
    // the highlights now carry glow.
    // Per-subject rim COLOUR (see the spotlights below): cypherpunk = protocol
    // green, astronaut = cool white. Green runs a touch lower than white — a
    // saturated green rim reads hotter and blooms more eagerly, and over-driving
    // it is exactly what used to make him look like "he went green".
    rimL.current.intensity = lightProxy.rimL * 42;
    rimR.current.intensity = lightProxy.rimR * 46;
    // Accent pools ease in via the conductor. Driven HARD — this is the light
    // the figure appears to be standing in, so it has to be the strongest thing
    // touching the lower body. What keeps it from flooding is not low intensity
    // but the tight range + steep decay below: bright core, fast falloff. That
    // pairing is the whole trick — turning intensity down instead just made a
    // dim flat wash, which is the same failure at lower brightness.
    accL.current.intensity = lightProxy.accentL * 2.8;
    accR.current.intensity = lightProxy.accentR * 2.8;
    core.current.intensity = (lightProxy.core + fxProxy.uEnergy * 2.2) * 3;
    flood.current.intensity = lightProxy.flood * 22;
  });

  return (
    <>
      <primitive object={targets.l} />
      <primitive object={targets.r} />
      <primitive object={targets.c} />

      {/* Floor, not shaping light. */}
      <hemisphereLight args={[COLORS.hemiSky, COLORS.hemiGround, 0.3]} />

      {/* THE key — the only shadow caster. */}
      <directionalLight
        ref={key}
        position={[-2.6, 5.4, 6.2]}
        color={COLORS.key}
        castShadow={tier !== 'low'}
        target={targets.c}
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-bias={-0.0009}
        shadow-normalBias={0.022}
        shadow-radius={3.5}
        shadow-camera-left={-6}
        shadow-camera-right={6}
        shadow-camera-top={7}
        shadow-camera-bottom={-2}
        shadow-camera-near={1}
        shadow-camera-far={20}
      />

      {/* Weak opposite fill — the dark side stays dark. */}
      <directionalLight position={[4.6, 2.4, 3.2]} intensity={0.55} color={COLORS.fill} target={targets.c} />

      {/* Hot rims, one per subject — edge separation against the void, and the
          colour story the presets always described: the cypherpunk's rim is
          PROTOCOL GREEN, the astronaut's is COOL WHITE. Driven past the bloom
          threshold, so each figure carries a coloured spotlight glow on its
          edges rather than a flat outline. */}
      <spotLight
        ref={rimL}
        position={[-4.4, 3.8, -4.0]}
        distance={15}
        angle={Math.PI * 0.3}
        penumbra={0.75}
        decay={2}
        color={COLORS.green}
        target={targets.l}
      />
      <spotLight
        ref={rimR}
        position={[4.4, 3.8, -4.0]}
        distance={15}
        angle={Math.PI * 0.3}
        penumbra={0.75}
        decay={2}
        color={COLORS.rim}
        target={targets.r}
      />

      {/* Per-subject accent pools — soft colored light, low and forward so it
          pools on the platform/lower body rather than washing the torso.
          Tighter range + steeper decay than physical (2.8 vs 2) on purpose:
          a fast falloff is what gives the accent SHAPE. The old 3.8/2.4 reached
          far enough to light the deck almost evenly, and an evenly-lit surface
          has no gradient to read as illumination — it just looks tinted. Now it
          falls off inside the podium, so there is a bright near edge and a dark
          far edge, and the character gets a kick rather than a bath. */}
      {/* Sat at y 0.8 these read as lights pointed AT the figure. Dropped to
          just above the (now smaller) deck at 0.28, they rake UPWARD instead —
          hottest at the shoes and platform lip, falling off up the legs, gone
          by the chest. That vertical gradient is what sells "the podium is the
          source", which a light at chest height can never do no matter how
          bright it runs. */}
      <pointLight ref={accL} position={[-CHAR_X + 0.2, 0.42, 1.3]} color={COLORS.accentL} distance={3.2} decay={2.8} />
      <pointLight ref={accR} position={[CHAR_X - 0.2, 0.42, 1.3]} color={COLORS.accentR} distance={3.2} decay={2.8} />

      {/* The protocol core's light — ignites with the sequence. */}
      <pointLight ref={core} position={[0, 1.25, 0.2]} color={COLORS.green} distance={6} decay={2} />

      {/* Completion flood — the room accepts the protocol. */}
      <pointLight ref={flood} position={[0, 4.5, 1.5]} color={COLORS.greenDeep} distance={14} decay={1.8} />
    </>
  );
}
