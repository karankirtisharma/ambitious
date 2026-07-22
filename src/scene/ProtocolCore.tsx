import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import {
  AdditiveBlending,
  BufferGeometry,
  Float32BufferAttribute,
  Group,
  Mesh,
  ShaderMaterial,
  Vector3,
} from 'three';
import { PLANE_VERT, CORE_FRAG, SHOCK_FRAG, ORBIT_VERT, ORBIT_FRAG } from './shaders';
import { lightProxy, fxProxy } from '../motion/proxies';

const CORE_POS = new Vector3(0, 1.42, 0);
const ORBIT_COUNT = 200;

/**
 * The in-world half of the protocol button: a camera-facing energy disc,
 * anticipation particles that orbit on hover, and the floor shockwave fired
 * on initiation. The clickable "+" itself is DOM — crisp and accessible.
 */
export function ProtocolCore() {
  const glow = useRef<Group>(null!);
  const glowMat = useRef<ShaderMaterial>(null!);
  const orbitMat = useRef<ShaderMaterial>(null!);
  const shockMat = useRef<ShaderMaterial>(null!);
  const shockMesh = useRef<Mesh>(null!);

  const dpr = Math.min(window.devicePixelRatio, 2);
  const projected = useMemo(() => new Vector3(), []);
  const lastPx = useRef(-1);
  const lastPy = useRef(-1);

  const glowUniforms = useMemo(
    () => ({ uTime: { value: 0 }, uIntensity: { value: 0 }, uEnergy: { value: 0 } }),
    []
  );
  const shockUniforms = useMemo(() => ({ uPulse: { value: 0 } }), []);
  const orbitUniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uOrbit: { value: 0 },
      uPixelRatio: { value: dpr },
      uCenter: { value: CORE_POS.clone() },
    }),
    [dpr]
  );

  const orbitGeometry = useMemo(() => {
    const geo = new BufferGeometry();
    const pos = new Float32Array(ORBIT_COUNT * 3); // computed in-shader
    const seed = new Float32Array(ORBIT_COUNT);
    for (let i = 0; i < ORBIT_COUNT; i++) seed[i] = Math.random();
    geo.setAttribute('position', new Float32BufferAttribute(pos, 3));
    geo.setAttribute('aSeed', new Float32BufferAttribute(seed, 1));
    return geo;
  }, []);

  // The DOM "+" must sit exactly on the in-world core, so it has to follow
  // the camera's drift rather than a fixed percentage of the viewport.
  useFrame(({ clock, camera, gl, size }) => {
    projected.copy(CORE_POS).project(camera);
    const px = (projected.x * 0.5 + 0.5) * size.width;
    const py = (1 - (projected.y * 0.5 + 0.5)) * size.height;
    if (Math.abs(px - lastPx.current) > 0.4 || Math.abs(py - lastPy.current) > 0.4) {
      lastPx.current = px;
      lastPy.current = py;
      const root = document.documentElement.style;
      root.setProperty('--core-x', `${px.toFixed(1)}px`);
      root.setProperty('--core-y', `${py.toFixed(1)}px`);
    }

    const t = clock.elapsedTime;
    // PARKED (intentional): the core glow / orbit / shockwave FX blow out to a
    // white cloud under the current AgX + bloom pipeline. Writing the memo
    // objects here — which R3F does NOT propagate to the mounted materials —
    // keeps them dormant. Do NOT redirect to *Mat.current.uniforms without
    // retuning intensity + bloom, or the blown-out cloud comes back. (The DOM
    // button positioning above is unaffected — it uses camera projection.)
    glowUniforms.uTime.value = t;
    glowUniforms.uIntensity.value = lightProxy.core;
    glowUniforms.uEnergy.value = fxProxy.uEnergy;
    orbitUniforms.uTime.value = t;
    orbitUniforms.uOrbit.value = fxProxy.uOrbit;
    orbitUniforms.uPixelRatio.value = gl.getPixelRatio();
    shockUniforms.uPulse.value = fxProxy.uPulse;
    shockMesh.current.visible = fxProxy.uPulse > 0.001 && fxProxy.uPulse < 0.999;
    // Billboard the glow disc; levitate faintly with hover anticipation.
    glow.current.quaternion.copy(camera.quaternion);
    glow.current.position.y = CORE_POS.y + Math.sin(t * 1.1) * 0.02 * fxProxy.uOrbit;
  });

  return (
    <>
      <group ref={glow} position={CORE_POS.toArray()}>
        <mesh>
          <planeGeometry args={[1.7, 1.7]} />
          <shaderMaterial
            ref={glowMat}
            vertexShader={PLANE_VERT}
            fragmentShader={CORE_FRAG}
            uniforms={glowUniforms}
            transparent
            depthWrite={false}
            blending={AdditiveBlending}
          />
        </mesh>
      </group>

      <points geometry={orbitGeometry} frustumCulled={false}>
        <shaderMaterial
          ref={orbitMat}
          vertexShader={ORBIT_VERT}
          fragmentShader={ORBIT_FRAG}
          uniforms={orbitUniforms}
          transparent
          depthWrite={false}
          blending={AdditiveBlending}
        />
      </points>

      <mesh ref={shockMesh} rotation-x={-Math.PI / 2} position-y={0.02} visible={false}>
        <planeGeometry args={[16, 16]} />
        <shaderMaterial
          ref={shockMat}
          vertexShader={PLANE_VERT}
          fragmentShader={SHOCK_FRAG}
          uniforms={shockUniforms}
          transparent
          depthWrite={false}
          blending={AdditiveBlending}
        />
      </mesh>
    </>
  );
}
