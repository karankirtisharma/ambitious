import { useMemo } from 'react';

/**
 * The colonnade — receding stone pillars flanking the hall on both sides. This
 * is where the reference gets its "massive architectural space": dark columns
 * marching back toward the portal, their inner faces rimmed green by the light
 * at the far end. On the fixed front camera, perspective does the depth work.
 *
 * The pillars are ordinary lit meshes (so they catch the green source and read
 * as real architecture), sitting OUTSIDE the heroes at x=±6.5 so they frame the
 * stage without crowding it. The green source is ranged so it never reaches the
 * heroes at z=0 — environment lighting, not character lighting.
 */
const GREEN = '#2bff57';

export function Colonnade() {
  const pillars = useMemo(() => {
    const out: { x: number; z: number }[] = [];
    for (const side of [-1, 1]) {
      for (let i = 0; i < 5; i++) {
        out.push({ x: side * 6.5, z: 1.5 - i * 3.3 });
      }
    }
    return out;
  }, []);

  return (
    <>
      {pillars.map((p, i) => (
        <mesh key={i} position={[p.x, 5, p.z]} receiveShadow>
          <boxGeometry args={[1.4, 12, 1.4]} />
          <meshStandardMaterial
            color="#0a0c0e"
            roughness={0.62}
            metalness={0.15}
            emissive="#0a2013"
            emissiveIntensity={0.12}
          />
        </mesh>
      ))}
      {/* Green source at the portal base: rims the far pillars and pools the
          reference's green glow at the foot of the columns. distance 11 dies
          before the heroes (12u away) — it lights the architecture, not them. */}
      <pointLight position={[0, 2.2, -12]} color={GREEN} intensity={9} distance={11} decay={2} />
    </>
  );
}
