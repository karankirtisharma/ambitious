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
    rimL.current.intensity = lightProxy.rimL * 34;
    rimR.current.intensity = lightProxy.rimR * 34;
    // Accent pools ease in via the conductor. Kept moderate so it colors the
    // lower body/platform glow rather than bathing the whole torso — a
    // saturated wash was reading as "the character went green".
    accL.current.intensity = lightProxy.accentL * 2.1;
    accR.current.intensity = lightProxy.accentR * 2.1;
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

      {/* Hot rims, one per subject — edge separation against the void. */}
      <spotLight
        ref={rimL}
        position={[-4.4, 3.8, -4.0]}
        distance={15}
        angle={Math.PI * 0.3}
        penumbra={0.75}
        decay={2}
        color={COLORS.rim}
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
          pools on the platform/lower body rather than washing the torso. */}
      <pointLight ref={accL} position={[-CHAR_X + 0.2, 0.8, 1.3]} color={COLORS.accentL} distance={3.8} decay={2.4} />
      <pointLight ref={accR} position={[CHAR_X - 0.2, 0.8, 1.3]} color={COLORS.accentR} distance={3.8} decay={2.4} />

      {/* The protocol core's light — ignites with the sequence. */}
      <pointLight ref={core} position={[0, 1.25, 0.2]} color={COLORS.green} distance={6} decay={2} />

      {/* Completion flood — the room accepts the protocol. */}
      <pointLight ref={flood} position={[0, 4.5, 1.5]} color={COLORS.greenDeep} distance={14} decay={1.8} />
    </>
  );
}
