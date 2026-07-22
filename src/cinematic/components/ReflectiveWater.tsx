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
  ShaderMaterial,
  Vector3,
  Vector4,
  WebGLRenderTarget,
} from 'three';
import { WATER_VERT, WATER_FRAG } from '../shaders/water';

/**
 * Custom planar-reflection floor with procedural ripples.
 *
 * Each frame it mirrors the main camera across the floor plane, renders the
 * scene once (minus itself) into a half-resolution FBO, and the water shader
 * samples that FBO through rippled, Fresnel-weighted UVs. This is the one
 * necessary extra pass; everything else in the scene is trivially cheap.
 *
 * Runs at useFrame priority -1 so the reflection is ready before the
 * postprocessing composer (priority 1) renders the frame.
 */
export interface ReflectiveWaterProps {
  size?: number;
  /** Deep-water base (what near-vertical views see). */
  baseColor?: string;
  /** Colour lifted into the reflection — the water's cast. */
  tint?: string;
  ripple?: number;
  fadeNear?: number;
  fadeFar?: number;
  /** Hooks around the mirror render — the host uses them to park anything
   *  computed in main-framebuffer space (e.g. the X-ray lens uniforms) that
   *  must not be evaluated in this half-res pass. */
  onReflectStart?: () => void;
  onReflectEnd?: () => void;
}

export function ReflectiveWater({
  size = 120,
  baseColor = '#04070a',
  tint = '#245068',
  ripple = 0.032,
  fadeNear = 16,
  fadeFar = 58,
  onReflectStart,
  onReflectEnd,
}: ReflectiveWaterProps) {
  const mesh = useRef<Mesh>(null!);
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const viewport = useThree((s) => s.size);
  const dpr = useThree((s) => s.viewport.dpr);

  // Half-res, capped — reflection blur hides the resolution loss, and it
  // halves the cost of the extra pass.
  const rt = useMemo(() => {
    const w = Math.max(2, Math.floor(viewport.width * Math.min(dpr, 2) * 0.5));
    const h = Math.max(2, Math.floor(viewport.height * Math.min(dpr, 2) * 0.5));
    const target = new WebGLRenderTarget(w, h, {
      minFilter: LinearFilter,
      magFilter: LinearFilter,
      type: HalfFloatType,
      depthBuffer: true,
    });
    return target;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewport.width, viewport.height, dpr]);

  useEffect(() => () => rt.dispose(), [rt]);

  const uniforms = useMemo(
    () => ({
      uReflection: { value: rt.texture },
      uTextureMatrix: { value: new Matrix4() },
      uTime: { value: 0 },
      uCameraPos: { value: new Vector3() },
      uBaseColor: { value: new Color(baseColor) },
      uTint: { value: new Color(tint) },
      uRipple: { value: ripple },
      uFadeNear: { value: fadeNear },
      uFadeFar: { value: fadeFar },
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rt]
  );

  // Scratch objects for the mirror math (allocation-free per frame).
  const refl = useMemo(
    () => ({
      virtualCam: new PerspectiveCamera(),
      reflectorPos: new Vector3(),
      cameraPos: new Vector3(),
      normal: new Vector3(),
      view: new Vector3(),
      target: new Vector3(),
      lookAt: new Vector3(),
      rotation: new Matrix4(),
      plane: new Plane(),
      clipPlane: new Vector4(),
      clipBias: 0.0,
      q: new Vector4(),
    }),
    []
  );

  useFrame(({ clock }) => {
    const m = mesh.current;
    if (!m) return;
    const r = refl;

    r.reflectorPos.setFromMatrixPosition(m.matrixWorld);
    r.cameraPos.setFromMatrixPosition(camera.matrixWorld);
    r.rotation.extractRotation(m.matrixWorld);
    r.normal.set(0, 0, 1).applyMatrix4(r.rotation); // plane's local +Z is its normal

    r.view.subVectors(r.reflectorPos, r.cameraPos);
    if (r.view.dot(r.normal) > 0) return; // camera behind the mirror
    r.view.reflect(r.normal).negate().add(r.reflectorPos);

    r.rotation.extractRotation(camera.matrixWorld);
    r.lookAt.set(0, 0, -1).applyMatrix4(r.rotation).add(r.cameraPos);
    r.target.subVectors(r.reflectorPos, r.lookAt);
    r.target.reflect(r.normal).negate().add(r.reflectorPos);

    const vc = r.virtualCam;
    vc.position.copy(r.view);
    vc.up.set(0, 1, 0).applyMatrix4(r.rotation).reflect(r.normal);
    vc.lookAt(r.target);
    vc.far = (camera as PerspectiveCamera).far;
    vc.updateMatrixWorld();
    vc.projectionMatrix.copy((camera as PerspectiveCamera).projectionMatrix);

    // World → reflection-UV (bias) matrix.
    const tm = uniforms.uTextureMatrix.value as Matrix4;
    tm.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
    tm.multiply(vc.projectionMatrix);
    tm.multiply(vc.matrixWorldInverse);
    // NOTE: no ·matrixWorld here — the vertex shader feeds WORLD positions
    // into this matrix already; multiplying the model matrix in as well
    // applies it twice and the mirror samples garbage UVs.

    // Oblique near-plane clip so nothing below the water leaks into the
    // mirror. The Lengyel formula wants the plane in CAMERA space — feeding
    // the world-space plane in degenerates the projection (div-by-zero for an
    // axis-aligned floor) and clips the whole scene.
    r.reflectorPos.setFromMatrixPosition(m.matrixWorld);
    r.plane.setFromNormalAndCoplanarPoint(r.normal, r.reflectorPos);
    r.plane.applyMatrix4(vc.matrixWorldInverse);
    const cp = r.clipPlane;
    cp.set(r.plane.normal.x, r.plane.normal.y, r.plane.normal.z, r.plane.constant);
    const proj = vc.projectionMatrix;
    r.q.x = (Math.sign(cp.x) + proj.elements[8]) / proj.elements[0];
    r.q.y = (Math.sign(cp.y) + proj.elements[9]) / proj.elements[5];
    r.q.z = -1.0;
    r.q.w = (1.0 + proj.elements[10]) / proj.elements[14];
    cp.multiplyScalar(2.0 / cp.dot(r.q));
    proj.elements[2] = cp.x;
    proj.elements[6] = cp.y;
    proj.elements[10] = cp.z + 1.0 - r.clipBias;
    proj.elements[14] = cp.w;

    // Render the mirrored view — self hidden so the floor never reflects itself.
    const prevRT = gl.getRenderTarget();
    const prevXR = gl.xr.enabled;
    const prevShadow = gl.shadowMap.autoUpdate;
    m.visible = false;
    gl.xr.enabled = false;
    gl.shadowMap.autoUpdate = false;
    onReflectStart?.();
    gl.setRenderTarget(rt);
    gl.clear();
    gl.render(scene, vc);
    onReflectEnd?.();
    gl.xr.enabled = prevXR;
    gl.shadowMap.autoUpdate = prevShadow;
    gl.setRenderTarget(prevRT);
    m.visible = true;

    uniforms.uTime.value = clock.elapsedTime;
    (uniforms.uCameraPos.value as Vector3).copy(r.cameraPos);
  }, -1);

  return (
    <mesh ref={mesh} rotation-x={-Math.PI / 2} position-y={0}>
      <planeGeometry args={[size, size]} />
      <shaderMaterial vertexShader={WATER_VERT} fragmentShader={WATER_FRAG} uniforms={uniforms} />
    </mesh>
  );
}
