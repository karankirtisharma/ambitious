import { useMemo, useRef } from 'react';
import { useGLTF } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import { Color, Mesh, type Group, type Material, type MeshStandardMaterial } from 'three';
import { patchXrayMaterial } from './patchXrayMaterial';
import { lensState } from './lensUniforms';
import { DEBUG_FLAGS } from '../../debugFlags';

const ANATOMY_URL = `${import.meta.env.BASE_URL}models/anatomy.glb`;
useGLTF.preload(ANATOMY_URL);

/**
 * Malformed sub-meshes to hide by name (spec §7). AI-generated anatomy models
 * routinely ship a few broken nodes — most often the hands — that read as
 * garbage geometry when revealed. Found by inspecting at `?xray=full`, then
 * listed here rather than attempting to repair the geometry.
 *
 * Matched case-insensitively as substrings against node names.
 */
const HIDDEN_MESH_PATTERNS: string[] = [
  // The hands. Crude mitten geometry, and the anatomy figure's proportions
  // drift from the body model's at the extremities, so the lens over a hand
  // showed a displaced grey blob — the classic AI-model hand failure.
  // Located via scripts/inspect-anatomy-parts.mjs (outermost |x| at wrist
  // height). Hidden, the lens over a hand opens onto a soft empty feather,
  // which reads as "nothing to scan here" rather than a glitch.
  'tripo_part_7',
  'tripo_part_24',
];

/**
 * The anatomy underlay. Loads once, patches every material to fade OUTSIDE the
 * lens, and draws before the body (renderOrder -1) so the body's own inside
 * fade reveals it. Nested by the caller inside the body's transform groups, so
 * it inherits identical position / rotation / breath / sway — perfect
 * registration, the lens can never slide off what it scans.
 */
export function Anatomy() {
  const { scene } = useGLTF(ANATOMY_URL);
  const group = useRef<Group>(null);

  // 350k triangles the reveal only ever shows a peek of — skip the whole draw
  // while the lens is closed (the common, not-hovering case).
  useFrame(() => {
    const g = group.current;
    if (g) g.visible = lensState.cssRadius > 0.3;
  });

  const prepared = useMemo(() => {
    const hidden: string[] = [];
    scene.traverse((obj) => {
      if (!(obj as Mesh).isMesh) return;
      const mesh = obj as Mesh;

      const broken = HIDDEN_MESH_PATTERNS.some((p) =>
        mesh.name.toLowerCase().includes(p.toLowerCase())
      );
      if (broken) {
        mesh.visible = false;
        hidden.push(mesh.name);
        return;
      }

      mesh.raycast = () => {}; // never intersected; the capsule owns the pointer
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      mesh.renderOrder = -1; // draw beneath the body
      const mats: Material[] = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const mat of mats) {
        patchXrayMaterial(mat, 'anatomy');
        // Interior exposure. Under the studio relight the pale muscle tones
        // land at nearly the white shirt's luminance, and the reveal washes
        // out to nothing through a small window. A body cavity is occluded
        // from the key anyway — recess it: same hues, lower exposure, no
        // specular shine. (Guarded: useGLTF caches the scene, and repeating
        // the multiply on a remount would compound the darkening.)
        const std = mat as MeshStandardMaterial;
        if (std.color && !std.userData.xrayRecessed) {
          std.userData.xrayRecessed = true;
          // DECOUPLE from the scene lighting. This effect broke every time
          // the rig was retuned because the revealed muscle was lit by the
          // key + env like any surface — so a brighter rig washed it out, a
          // darker one buried it. Instead: light it from its OWN albedo as
          // emissive (a fixed floor), keep only a whisper of scene response
          // for 3D form, and kill env reflection. The reveal now looks the
          // same no matter what happens to the lights. Do NOT re-couple it.
          // Low albedo kills the lit response — including the green hover
          // accent light that was tinting the muscle. The look is carried by
          // a DESATURATED self-emissive (silver-muscle, no colour cast), so
          // it reads like a clean scan regardless of the rig or its accents.
          const lum = std.color.r * 0.299 + std.color.g * 0.587 + std.color.b * 0.114;
          std.emissive.copy(std.color).lerp(new Color(lum, lum, lum), 0.7);
          std.emissiveIntensity = 0.62;
          std.color.multiplyScalar(0.32);
          std.roughness = 0.95;
          std.metalness = 0;
          std.envMapIntensity = 0.12;
        }
      }
    });

    if (import.meta.env.DEV && DEBUG_FLAGS.xray === 'full') {
      // eslint-disable-next-line no-console
      console.log(
        '[xray] anatomy meshes:',
        (() => {
          const names: string[] = [];
          scene.traverse((o) => {
            if ((o as Mesh).isMesh) names.push(o.name);
          });
          return names;
        })()
      );
      if (hidden.length) console.log('[xray] hidden:', hidden);
    }
    return scene;
  }, [scene]);

  return (
    <group ref={group} visible={false}>
      <primitive object={prepared} />
    </group>
  );
}
