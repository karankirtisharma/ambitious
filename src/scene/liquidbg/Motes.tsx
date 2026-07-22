import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { AdditiveBlending, Color, Group, Object3D, Vector3 } from 'three';
import { loadSprite } from './textures';
import { enableReflectLayer } from './layers';

interface Mote {
  basePos: Vector3;
  size: number;
  rate: number;
  phase: number;
  isLeaf: boolean;
  tint: Color;
}

/**
 * Drifting motes — spark + leaf sprites suspended around the bars. `count = 0`
 * removes it. Deterministic scatter (index hash, no per-frame allocation).
 */
export function Motes({
  motion = 1,
  count = 26,
  color = '#e8ffcf',
}: {
  motion?: number;
  count?: number;
  color?: string;
}) {
  const groupRef = useRef<Group>(null!);

  const spark = useMemo(() => loadSprite('spark.jpg'), []);
  const leaf = useMemo(() => loadSprite('leaf.png'), []);

  const motes = useMemo<Mote[]>(() => {
    const tint = new Color(color);
    const rnd = (n: number) => {
      const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
      return s - Math.floor(s);
    };
    return Array.from({ length: count }, (_, i): Mote => ({
      basePos: new Vector3((rnd(i) - 0.5) * 9, 0.6 + rnd(i + 7) * 3.4, -14 + (rnd(i + 13) - 0.5) * 8),
      size: 0.05 + rnd(i + 3) * 0.12,
      rate: 0.06 + rnd(i + 5) * 0.05,
      phase: rnd(i + 9) * 6.283,
      isLeaf: i % 5 === 0,
      tint,
    }));
  }, [color, count]);

  useEffect(() => {
    if (groupRef.current) enableReflectLayer(groupRef.current);
  }, []);

  useEffect(
    () => () => {
      spark.dispose();
      leaf.dispose();
    },
    [spark, leaf]
  );

  useFrame(({ clock }) => {
    const t = clock.elapsedTime * motion;
    const g = groupRef.current;
    if (!g) return;
    for (let i = 0; i < g.children.length; i++) {
      const m = motes[i];
      const child = g.children[i] as Object3D;
      child.position.set(
        m.basePos.x + Math.sin(t * m.rate + m.phase) * 0.5,
        m.basePos.y + Math.sin(t * m.rate * 0.8 + m.phase * 1.3) * 0.35,
        m.basePos.z + Math.cos(t * m.rate * 0.6 + m.phase) * 0.5
      );
    }
  });

  return (
    <group ref={groupRef}>
      {motes.map((m, i) => (
        <sprite key={i} scale={[m.size, m.size, 1]}>
          <spriteMaterial
            map={m.isLeaf ? leaf : spark}
            color={m.tint}
            transparent
            opacity={m.isLeaf ? 0.5 : 0.85}
            blending={AdditiveBlending}
            depthWrite={false}
            toneMapped={false}
          />
        </sprite>
      ))}
    </group>
  );
}
