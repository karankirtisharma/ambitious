import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { AdditiveBlending, Color, Group, ShaderMaterial, Vector2, Vector3 } from 'three';
import { PANEL_VERT, PANEL_FRAG } from '../../cinematic/shaders/panel';
import { SHAFT_VERT, SHAFT_FRAG } from '../../cinematic/shaders/shaft';
import { WALL_VERT, WALL_FRAG } from '../../cinematic/shaders/wall';

/**
 * The light installation — DISTANT architecture, not a centrepiece. A massive
 * near-black wall stands deep behind the stage (PORTAL_Z), and three recessed
 * light slots are cut into it. What the eye reads is architecture lit from
 * within, far away — the depth cue the flat glowing rectangles never had.
 *
 * MONOCHROME by design: the slots are cool white, the wall is near-black
 * catching a cool bleed. Green is added later, as a whisper, only once the
 * black/white/grey room already reads premium. The slots are LIGHT SOURCES
 * (they spill onto the wall), never the brightest blob in frame.
 *
 * Additive scene-graph only — no camera writes, no store access, no lights.
 */

const PORTAL_Z = -12;

// Three tall light columns: tall · short · tall, rooted near the floor and
// rising high — architectural verticality, not floating pills. A distant,
// elegant focal point, not a dominating slab.
const SLOTS = [
  { x: -1.5, w: 0.38, h: 7.2, bottom: 0.12, intensity: 2.2 },
  { x: 0.0, w: 0.34, h: 4.6, bottom: 0.12, intensity: 2.1 },
  { x: 1.5, w: 0.38, h: 7.2, bottom: 0.12, intensity: 2.2 },
] as const;

// Vast wall so it reads as the back of a massive hall, meeting the floor.
const WALL_SIZE = new Vector2(44, 20);
const WALL_Y = 4.5;

/** The reference look: a hot near-white spine falling to a saturated signal
 *  green — the ONE green, reused in the reflection, the shafts and the base
 *  glow. Bright bar, black room; the green never leaves the columns + their
 *  immediate light. */
const CORE = new Color('#eafff0');
const EDGE = new Color('#2bff57');
/** Green-white for the light-in-fog shafts and the wall bleed. */
const SHAFT = new Color('#7dffa4');
const WALL_BASE = new Color(0.01, 0.011, 0.014);
const WALL_BLEED = new Color('#8fe6a8');
/** Matches the scene background exactly — the manual view-depth fog for the
 *  portal's custom shaders (which get no automatic scene fog). Color-management
 *  is on (R3F v9), so new Color(hex) is already linear; no convert needed. */
const FOG_COLOR = new Color('#040505');

export function PortalEnvironment() {
  const group = useRef<Group>(null);
  const mats = useRef<ShaderMaterial[]>([]);
  const shaftMats = useRef<ShaderMaterial[]>([]);

  const built = useMemo(
    () =>
      SLOTS.map((p) => ({
        def: p,
        y: p.bottom + p.h / 2,
        uniforms: {
          uCore: { value: CORE.clone() },
          uEdge: { value: EDGE.clone() },
          uIntensity: { value: p.intensity },
          uSize: { value: new Vector2(p.w, p.h) },
          // Near-square ends: p.w*0.22 gave a visible capsule cap — the "pill".
          uRadius: { value: p.w * 0.06 },
          uFogColor: { value: FOG_COLOR.clone() },
          uFogDensity: { value: 0.032 },
        },
        shaft: {
          w: p.w * 2.2,
          h: p.h * 1.35,
          y: p.bottom + (p.h * 1.35) / 2 - 0.2,
          uniforms: {
            uColor: { value: SHAFT.clone() },
            uOpacity: { value: 0.05 },
            uTime: { value: 0 },
          },
        },
      })),
    []
  );

  const wallUniforms = useMemo(
    () => ({
      uSize: { value: WALL_SIZE.clone() },
      uBase: { value: WALL_BASE.clone() },
      uBleed: { value: WALL_BLEED.clone() },
      uSlots: { value: new Vector3(SLOTS[0].x, SLOTS[1].x, SLOTS[2].x) },
      uFogColor: { value: FOG_COLOR.clone() },
      uFogDensity: { value: 0.045 },
    }),
    []
  );

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const g = group.current;
    if (g) {
      for (let i = 0; i < built.length; i++) {
        // Column meshes are the FIRST children of the group.
        const col = g.children[i];
        if (col) col.position.y = built[i].y + Math.sin(t * 0.3 + i * 2.1) * 0.03;
      }
    }
    for (let i = 0; i < mats.current.length; i++) {
      const m = mats.current[i];
      if (m) m.uniforms.uIntensity.value = built[i].def.intensity * (1 + Math.sin(t * 0.5 + i) * 0.05);
    }
    for (let i = 0; i < shaftMats.current.length; i++) {
      const s = shaftMats.current[i];
      if (s) s.uniforms.uTime.value = t;
    }
  });

  return (
    <group ref={group} position-z={PORTAL_Z}>
      {/* Light slots — emissive, in front of the wall. FIRST children. */}
      {built.map((b, i) => (
        <mesh key={`col-${i}`} position={[b.def.x, b.y, 0.14]}>
          <planeGeometry args={[b.def.w, b.def.h]} />
          <shaderMaterial
            ref={(m) => {
              if (m) mats.current[i] = m;
            }}
            vertexShader={PANEL_VERT}
            fragmentShader={PANEL_FRAG}
            uniforms={b.uniforms}
            transparent
            depthWrite={false}
            toneMapped={false}
            blending={AdditiveBlending}
          />
        </mesh>
      ))}

      {/* Soft light-in-fog around each slot. */}
      {built.map((b, i) => (
        <mesh key={`shaft-${i}`} position={[b.def.x, b.shaft.y, 0.07]}>
          <planeGeometry args={[b.shaft.w, b.shaft.h]} />
          <shaderMaterial
            ref={(m) => {
              if (m) shaftMats.current[i] = m;
            }}
            vertexShader={SHAFT_VERT}
            fragmentShader={SHAFT_FRAG}
            uniforms={b.shaft.uniforms}
            transparent
            depthWrite={false}
            toneMapped={false}
            blending={AdditiveBlending}
          />
        </mesh>
      ))}

      {/* The massive dark wall the slots are cut into. */}
      <mesh position={[0, WALL_Y, 0]}>
        <planeGeometry args={[WALL_SIZE.x, WALL_SIZE.y]} />
        <shaderMaterial vertexShader={WALL_VERT} fragmentShader={WALL_FRAG} uniforms={wallUniforms} />
      </mesh>
    </group>
  );
}
