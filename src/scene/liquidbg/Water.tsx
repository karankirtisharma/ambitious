import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import {
  Color,
  HalfFloatType,
  LinearFilter,
  Matrix4,
  Mesh,
  PerspectiveCamera,
  Plane,
  Raycaster,
  ShaderMaterial,
  Vector2,
  Vector3,
  WebGLRenderTarget,
} from 'three';
import { useRippleSim } from './useRippleSim';
import { loadWaterNormal, loadDetail, loadEnvCube } from './textures';
import { REFLECT_LAYER } from './layers';
import waterVert from './shaders/water.vert.glsl?raw';
import waterFrag from './shaders/water.frag.glsl?raw';
import fullscreenVert from './shaders/fullscreen.vert.glsl?raw';
import rippleFrag from './shaders/ripple.frag.glsl?raw';

const PLANE_SIZE = 40; // world units — the ground pool, extends into fog

export interface WaterProps {
  motion?: number;
  rippleScale?: number;
  /** Manual reflection-UV nudge (x = L/R, y = U/D). Rarely needed. */
  reflOffset?: [number, number];
  /** Square reflection FBO resolution. 512 is plenty (ripples blur it). */
  reflectionRes?: number;
}

export function Water({
  motion = 1,
  rippleScale = 1,
  reflOffset = [0, 0],
  reflectionRes = 512,
}: WaterProps) {
  const gl = useThree((s) => s.gl);
  const camera = useThree((s) => s.camera);
  const scene = useThree((s) => s.scene);
  const meshRef = useRef<Mesh>(null!);

  const ripple = useRippleSim(gl, fullscreenVert, rippleFrag, 256);

  const normalMap = useMemo(loadWaterNormal, []);
  const envMap = useMemo(loadEnvCube, []);
  const detailMap = useMemo(loadDetail, []);

  // ---- Reflection machinery (created once) ---------------------------------
  const refl = useMemo(() => {
    const target = new WebGLRenderTarget(reflectionRes, reflectionRes, {
      type: HalfFloatType, // keep the portal's HDR values linear for host bloom
      minFilter: LinearFilter,
      magFilter: LinearFilter,
      depthBuffer: true,
      stencilBuffer: false,
    });

    // Clear to black (fresh HalfFloat RTs hold GPU garbage → first-frame ghost).
    const pRT = gl.getRenderTarget();
    const pColor = gl.getClearColor(new Color());
    const pAlpha = gl.getClearAlpha();
    gl.setClearColor(0x000000, 1);
    gl.setRenderTarget(target);
    gl.clear(true, true, false);
    gl.setRenderTarget(pRT);
    gl.setClearColor(pColor, pAlpha);

    const mirrorCam = new PerspectiveCamera();
    // CRITICAL: the reflection camera renders ONLY the liquid-background layer.
    // Never the host's characters (cost) or their x-ray-lens materials (which
    // read gl_FragCoord in main-framebuffer space and glitch in a mirror pass).
    mirrorCam.layers.set(REFLECT_LAYER);

    return {
      target,
      camera: mirrorCam,
      textureMatrix: new Matrix4(),
      worldPos: new Vector3(),
      lookDir: new Vector3(),
      lookTarget: new Vector3(),
      bias: new Matrix4().set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1),
    };
  }, [gl, reflectionRes]);

  useEffect(() => () => refl.target.dispose(), [refl]);

  // ---- Water material ------------------------------------------------------
  const material = useMemo(() => {
    const m = new ShaderMaterial({
      vertexShader: waterVert,
      fragmentShader: waterFrag,
      uniforms: {
        uTextureMatrix: { value: refl.textureMatrix },
        uReflection: { value: refl.target.texture },
        uRipple: { value: null },
        uRippleTexel: { value: ripple.texel },
        uTime: { value: 0 },
        uMotion: { value: motion },
        uNormalMap: { value: normalMap },
        uEnvMap: { value: envMap },
        uEnvIntensity: { value: 0.12 },
        uReflOffset: { value: new Vector2(reflOffset[0], reflOffset[1]) },
        uDetailMap: { value: detailMap },
        uNormalRepeat: { value: 8 },
        uNormalScale: { value: 0.8 },
        uDistortion: { value: 0.09 },
        uRippleStrength: { value: 1.5 },
        uMirror: { value: 0.92 },
        uGrainScale: { value: 38 },
        uDeepColor: { value: new Color('#020402') },
        uFogColor: { value: new Color('#030503') }, // reference water fog fade
        uFogGlow: { value: new Color('#141f05') },
        uFogNear: { value: 15.0 },
        uFogFar: { value: 40.0 },
        uCameraPos: { value: new Vector3() },
      },
    });
    // Host composer owns tone mapping; the water outputs its own final colour.
    m.toneMapped = false;
    return m;
  }, [refl, ripple.texel, motion, normalMap, envMap, detailMap]);

  useEffect(() => () => material.dispose(), [material]);
  useEffect(
    () => () => {
      normalMap.dispose();
      detailMap.dispose();
      envMap.dispose();
    },
    [normalMap, detailMap, envMap]
  );

  // ---- Pointer → ripple via a passive window listener ----------------------
  // The host restricts R3F raycasting to layer 1, so an <mesh onPointerMove>
  // on the water would never fire. Instead we listen on `window` (passive, no
  // preventDefault → zero interference with the host's own pointer handling)
  // and raycast the water plane manually.
  const pointer = useRef({ uv: new Vector2(-10, -10), strength: 0 });
  const rc = useMemo(
    () => ({
      raycaster: new Raycaster(),
      ndc: new Vector2(),
      plane: new Plane(),
      hit: new Vector3(),
      local: new Vector3(),
      uv: new Vector2(),
    }),
    []
  );

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const mesh = meshRef.current;
      if (!mesh) return;
      const rect = gl.domElement.getBoundingClientRect();
      rc.ndc.set(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        -((e.clientY - rect.top) / rect.height) * 2 + 1
      );
      rc.raycaster.setFromCamera(rc.ndc, camera);

      // Water world plane: normal +Y at the mesh's world height.
      mesh.getWorldPosition(refl.worldPos);
      rc.plane.setFromNormalAndCoplanarPoint(new Vector3(0, 1, 0), refl.worldPos);
      if (!rc.raycaster.ray.intersectPlane(rc.plane, rc.hit)) return;

      // World hit → water-local → UV (geometry is centered, size PLANE_SIZE).
      mesh.worldToLocal(rc.local.copy(rc.hit));
      const u = rc.local.x / PLANE_SIZE + 0.5;
      const v = rc.local.y / PLANE_SIZE + 0.5;
      const p = pointer.current;
      if (u < 0 || u > 1 || v < 0 || v > 1) {
        p.uv.set(-10, -10);
        return;
      }
      if (p.uv.x >= 0) {
        const speed = p.uv.distanceTo(rc.uv.set(u, v)) * 30;
        p.strength = Math.min(0.9, p.strength + speed * 0.35);
      }
      p.uv.set(u, v);
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => window.removeEventListener('pointermove', onMove);
  }, [gl, camera, rc, refl]);

  // Keep the manual reflection nudge synced.
  useEffect(() => {
    (material.uniforms.uReflOffset.value as Vector2).set(reflOffset[0], reflOffset[1]);
  }, [material, reflOffset]);

  const readyFrames = useRef(0);

  // priority -1: run BEFORE the host's EffectComposer (priority 1) so the
  // reflection FBO is fresh when the composer renders the water.
  useFrame((state, delta) => {
    const mesh = meshRef.current;
    if (!mesh) return;

    // 1. Advance the ripple sim.
    const p = pointer.current;
    ripple.update(p.uv, p.strength * rippleScale);
    p.strength *= Math.pow(0.02, delta); // framerate-safe decay
    material.uniforms.uRipple.value = ripple.texture();

    // 2. Mirror the host camera across the water's world plane (y = planeY).
    mesh.getWorldPosition(refl.worldPos);
    const planeY = refl.worldPos.y;
    const cam = refl.camera;
    cam.position.set(camera.position.x, 2 * planeY - camera.position.y, camera.position.z);
    camera.getWorldDirection(refl.lookDir);
    refl.lookTarget.copy(camera.position).add(refl.lookDir);
    refl.lookTarget.y = 2 * planeY - refl.lookTarget.y;
    cam.up.set(0, -1, 0);
    cam.lookAt(refl.lookTarget);
    cam.projectionMatrix.copy((camera as PerspectiveCamera).projectionMatrix);
    cam.updateMatrixWorld();

    refl.textureMatrix
      .copy(refl.bias)
      .multiply(cam.projectionMatrix)
      .multiply(cam.matrixWorldInverse);

    // 3. Render ONLY the reflect layer into the FBO (no host geometry, no
    //    shadow recompute). The water isn't on the reflect layer, so it can't
    //    reflect itself — no visibility toggle needed for that.
    const prevRT = gl.getRenderTarget();
    const prevShadowAuto = gl.shadowMap.autoUpdate;
    gl.shadowMap.autoUpdate = false;
    gl.setRenderTarget(refl.target);
    gl.clear();
    gl.render(scene, cam);
    gl.setRenderTarget(prevRT);
    gl.shadowMap.autoUpdate = prevShadowAuto;

    // 4. First-frames warmup guard (hide until the FBO + sim hold valid data).
    if (readyFrames.current < 2) {
      readyFrames.current += 1;
      mesh.visible = false;
    } else {
      mesh.visible = true;
    }

    // 5. Tick uniforms.
    material.uniforms.uTime.value = state.clock.elapsedTime * motion;
    (material.uniforms.uCameraPos.value as Vector3).copy(camera.position);
  }, -1);

  return (
    <mesh ref={meshRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} material={material}>
      <planeGeometry args={[PLANE_SIZE, PLANE_SIZE, 1, 1]} />
    </mesh>
  );
}
