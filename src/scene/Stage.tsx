import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { MeshReflectorMaterial, useTexture } from '@react-three/drei';
import {
  AdditiveBlending,
  BufferGeometry,
  Float32BufferAttribute,
  MirroredRepeatWrapping,
  ShaderMaterial,
  SRGBColorSpace,
} from 'three';
import { DUST_VERT, DUST_FRAG } from './shaders';
import { useStore } from '../state/store';
import { DEBUG_FLAGS } from '../debugFlags';

const VAULT_URL = `${import.meta.env.BASE_URL}env/vault.webp`;
const FLOOR_URL = `${import.meta.env.BASE_URL}env/floor.webp`;
useTexture.preload(VAULT_URL);
useTexture.preload(FLOOR_URL);

/**
 * The architectural void: a reflective slab, a fogged backdrop cylinder with
 * faint vertical slits, and drifting dust. The environment frames the
 * protagonists — it never competes with them.
 */
export function Stage() {
  const tier = useStore((s) => s.tier);

  return (
    <>
      <Floor tier={tier} />
      <FloorPatch />
      <Backdrop />
      <Dust />
    </>
  );
}

/**
 * Pre-lit wet-stone decal over the reflector — fills the dead mid-ground
 * between the platforms and the vault wall. Feathered alpha (premultiplied
 * to black) lets the live reflections take over at its edges.
 */
function FloorPatch() {
  const tex = useTexture(FLOOR_URL);
  tex.colorSpace = SRGBColorSpace;

  return (
    // Deep enough that the far feathered edge tucks BEHIND the vault wall
    // (z −8.5) — solid stone runs into the wall base, no black gap band.
    <mesh rotation-x={-Math.PI / 2} position={[0, 0.008, -3.2]}>
      <planeGeometry args={[27, 20]} />
      <meshBasicMaterial
        map={tex}
        fog
        transparent
        depthWrite={false}
        color="#d6dad6"
        toneMapped
      />
    </mesh>
  );
}

function Floor({ tier }: { tier: 'high' | 'mid' | 'low' }) {
  // The reflector renders the whole scene into an offscreen FBO each frame —
  // reserved for the high tier, at a resolution the blur makes equivalent.
  // Known cost: drei's internal render targets are not disposed if the
  // reflector unmounts on a tier downgrade (~8MB GPU, at most once per
  // session) — accepted over reaching into drei internals.
  if (tier !== 'high' || DEBUG_FLAGS.noReflect) {
    return (
      <mesh rotation-x={-Math.PI / 2} position-y={0}>
        <planeGeometry args={[44, 44]} />
        <meshStandardMaterial color="#0a0c0b" roughness={0.85} metalness={0.4} />
      </mesh>
    );
  }
  return (
    <mesh rotation-x={-Math.PI / 2} position-y={0}>
      <planeGeometry args={[44, 44]} />
      <MeshReflectorMaterial
        resolution={512}
        blur={[260, 80]}
        mixBlur={1}
        mixStrength={2.2}
        depthScale={0.7}
        minDepthThreshold={0.35}
        maxDepthThreshold={1.2}
        roughness={0.85}
        color="#0a0c0b"
        metalness={0.45}
        mirror={0.55}
      />
    </mesh>
  );
}

function Backdrop() {
  // The vault chamber — baked lighting, so an unlit material; scene fog
  // recesses it and the reflector floor mirrors it. Its circular vault door
  // centers behind the protocol core; its own floor hides below ours.
  const vault = useTexture(VAULT_URL);
  vault.colorSpace = SRGBColorSpace;
  // Mirror-extend in BOTH axes: seamless joins, no stretch — the wall
  // continues past the view edge on any aspect ratio (ultrawide sideways,
  // portrait upward — the mirrored ceiling reads as structure) instead of
  // terminating as a billboard.
  vault.wrapS = MirroredRepeatWrapping;
  vault.wrapT = MirroredRepeatWrapping;
  vault.repeat.set(3, 3);
  vault.offset.set(-1, -1);
  vault.needsUpdate = true;

  return (
    // 3x the frame in each axis; the middle tile keeps the original mapping,
    // so the vault door stays centered behind the core. (The old backdrop
    // cylinder is gone — the camera sat inside it and its near-black flanks
    // occluded the plate at the view edges.)
    <mesh position={[0, -0.7, -8.5]}>
      <planeGeometry args={[78, 43.8]} />
      <meshBasicMaterial map={vault} fog color="#e2e6e2" toneMapped />
    </mesh>
  );
}

const DUST_COUNT = 300;

function Dust() {
  const material = useRef<ShaderMaterial>(null!);

  const geometry = useMemo(() => {
    const geo = new BufferGeometry();
    const pos = new Float32Array(DUST_COUNT * 3);
    const seed = new Float32Array(DUST_COUNT);
    for (let i = 0; i < DUST_COUNT; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 16;
      pos[i * 3 + 1] = Math.random() * 5;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 10;
      seed[i] = Math.random();
    }
    geo.setAttribute('position', new Float32BufferAttribute(pos, 3));
    geo.setAttribute('aSeed', new Float32BufferAttribute(seed, 1));
    return geo;
  }, []);

  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uPixelRatio: { value: Math.min(window.devicePixelRatio, 2) },
    }),
    []
  );

  useFrame(({ clock, gl }) => {
    material.current.uniforms.uTime.value = clock.elapsedTime;
    material.current.uniforms.uPixelRatio.value = gl.getPixelRatio();
  });

  return (
    <points geometry={geometry} frustumCulled={false}>
      <shaderMaterial
        ref={material}
        vertexShader={DUST_VERT}
        fragmentShader={DUST_FRAG}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        blending={AdditiveBlending}
      />
    </points>
  );
}
