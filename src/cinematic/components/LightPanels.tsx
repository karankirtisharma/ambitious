import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { AdditiveBlending, Color, Group, ShaderMaterial, Vector2 } from 'three';
import { PANEL_VERT, PANEL_FRAG } from '../shaders/panel';

export interface PanelDef {
  x: number;
  width: number;
  height: number;
  /** Bottom edge Y (panels float just above the floor at y=0). */
  bottom: number;
  intensity: number;
}

/** Tall · short · tall — asymmetric, generous negative space. */
const PANELS: PanelDef[] = [
  { x: -1.85, width: 0.52, height: 3.5, bottom: 0.35, intensity: 2.4 },
  { x: 0.0, width: 0.5, height: 2.15, bottom: 0.35, intensity: 2.15 },
  { x: 1.85, width: 0.52, height: 3.5, bottom: 0.35, intensity: 2.4 },
];

const CORE = new Color('#cfeaff'); // near-white, faint cyan

/**
 * Three floating emissive panels. Each is a flat SDF-masked quad running into
 * HDR; bloom paints the glow. Idle motion is a whisper — a slow bob and a
 * subliminal breathe on intensity — so it feels alive without drawing the eye.
 */
export function LightPanels() {
  const group = useRef<Group>(null);
  const mats = useRef<ShaderMaterial[]>([]);

  const built = useMemo(
    () =>
      PANELS.map((p) => ({
        def: p,
        y: p.bottom + p.height / 2,
        uniforms: {
          uColor: { value: CORE.clone() },
          uIntensity: { value: p.intensity },
          uSize: { value: new Vector2(p.width, p.height) },
          uRadius: { value: Math.min(p.width, p.height) * 0.24 },
        },
      })),
    []
  );

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const g = group.current;
    if (g) {
      for (let i = 0; i < g.children.length; i++) {
        // Each panel bobs on its own slow phase.
        g.children[i].position.y = built[i].y + Math.sin(t * 0.35 + i * 2.1) * 0.045;
      }
    }
    for (let i = 0; i < mats.current.length; i++) {
      const m = mats.current[i];
      if (m) m.uniforms.uIntensity.value = built[i].def.intensity * (1 + Math.sin(t * 0.6 + i) * 0.04);
    }
  });

  return (
    <group ref={group}>
      {built.map((b, i) => (
        <mesh key={i} position={[b.def.x, b.y, 0]}>
          <planeGeometry args={[b.def.width, b.def.height]} />
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
    </group>
  );
}
