import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  AdditiveBlending,
  Color,
  Group,
  Sprite,
  SpriteMaterial,
  Vector3,
} from 'three';
import { loadSprite } from './textures';
import { enableReflectLayer } from './layers';

interface Puff {
  basePos: Vector3;
  scale: number;
  rate: number;
  phase: number;
  baseOpacity: number;
  tint: Color;
}

const COUNT = 16;

/**
 * Atmospheric haze — one greyscale smoke sprite billboarded on ~16 additive
 * puffs (a backlit central halo around the bars + wider corner masses).
 * `intensity = 0` removes it entirely.
 */
export function Smoke({
  motion = 1,
  intensity = 1,
  color = '#cde8b0',
}: {
  motion?: number;
  intensity?: number;
  color?: string;
}) {
  const groupRef = useRef<Group>(null!);
  const matsRef = useRef<SpriteMaterial[]>([]);

  const texture = useMemo(() => loadSprite('smoke.jpg'), []);

  const puffs = useMemo<Puff[]>(() => {
    const tint = new Color(color);
    return Array.from({ length: COUNT }, (_, i): Puff => {
      const central = i < 7;
      if (central) {
        const a = (i / 6) * Math.PI - Math.PI / 2;
        return {
          basePos: new Vector3(Math.sin(a) * 5.5, 2.4 + Math.cos(a) * 1.4, -15.5 - (i % 2) * 2.0),
          scale: 6 + (i % 3) * 1.8,
          rate: 0.04 + (i % 4) * 0.012,
          phase: i * 1.7,
          baseOpacity: (0.11 - Math.abs(Math.sin(a)) * 0.05) * intensity,
          tint,
        };
      }
      const j = i - 7;
      const a = (j / (COUNT - 8)) * Math.PI - Math.PI / 2;
      const side = Math.sin(a);
      return {
        basePos: new Vector3(side * 14 + (j % 2 === 0 ? 1.5 : -1.5), 3.6 + Math.cos(a) * 1.6, -18 - (j % 3) * 2.5),
        scale: 8 + (j % 4) * 2.4,
        rate: 0.05 + (j % 5) * 0.015,
        phase: j * 2.1 + 3.0,
        baseOpacity: (0.05 + Math.abs(side) * 0.05) * intensity,
        tint,
      };
    });
  }, [color, intensity]);

  useEffect(() => {
    if (groupRef.current) enableReflectLayer(groupRef.current);
  }, []);

  useEffect(
    () => () => {
      texture.dispose();
      matsRef.current.forEach((m) => m?.dispose());
    },
    [texture]
  );

  useFrame(({ clock }) => {
    const t = clock.elapsedTime * motion;
    const g = groupRef.current;
    if (!g) return;
    for (let i = 0; i < g.children.length; i++) {
      const spr = g.children[i] as Sprite;
      const p = puffs[i];
      spr.position.set(
        p.basePos.x + Math.sin(t * p.rate + p.phase) * 1.2,
        p.basePos.y + Math.cos(t * p.rate * 0.7 + p.phase) * 0.6,
        p.basePos.z
      );
      const m = matsRef.current[i];
      if (m) m.opacity = p.baseOpacity * (0.75 + 0.25 * Math.sin(t * 0.25 + p.phase));
    }
  });

  return (
    <group ref={groupRef}>
      {puffs.map((p, i) => (
        <sprite key={i} scale={[p.scale, p.scale, 1]}>
          <spriteMaterial
            ref={(m) => {
              if (m) matsRef.current[i] = m;
            }}
            map={texture}
            color={p.tint}
            transparent
            opacity={p.baseOpacity}
            blending={AdditiveBlending}
            depthWrite={false}
            toneMapped={false}
          />
        </sprite>
      ))}
    </group>
  );
}
