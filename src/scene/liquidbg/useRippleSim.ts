import { useEffect, useMemo } from 'react';
import {
  ClampToEdgeWrapping,
  Color,
  HalfFloatType,
  LinearFilter,
  Mesh,
  OrthographicCamera,
  PlaneGeometry,
  RGBAFormat,
  Scene,
  ShaderMaterial,
  Texture,
  Vector2,
  WebGLRenderer,
  WebGLRenderTarget,
} from 'three';

/**
 * Ping-pong framebuffer wave simulation (discrete 2D wave equation).
 *
 * THREE HalfFloat targets rotate roles each frame — prev ← curr ← next ← prev
 * — because the wave equation needs two past frames. A tiny private scene
 * (fullscreen quad + ortho camera) runs the update shader into "next".
 *
 * Returns { update, texture, texel }. The Water component calls update() once
 * per frame before rendering its reflection, then binds texture() into the
 * water material's uRipple.
 */
export interface RippleSim {
  update(mouseUv: Vector2, strength: number): void;
  texture(): Texture;
  texel: Vector2;
}

export function useRippleSim(
  gl: WebGLRenderer,
  vertexShader: string,
  fragmentShader: string,
  size = 256
): RippleSim {
  const sim = useMemo(() => {
    const opts = {
      type: HalfFloatType,
      format: RGBAFormat,
      minFilter: LinearFilter,
      magFilter: LinearFilter,
      wrapS: ClampToEdgeWrapping, // clamp = free boundary; waves fade at the edge
      wrapT: ClampToEdgeWrapping,
      depthBuffer: false,
      stencilBuffer: false,
      generateMipmaps: false,
    } as const;

    const targets = [
      new WebGLRenderTarget(size, size, opts),
      new WebGLRenderTarget(size, size, opts),
      new WebGLRenderTarget(size, size, opts),
    ];

    // Clear to zero — fresh HalfFloat RTs hold uninitialized GPU memory, which
    // would drive wild normals (a displaced ghost reflection) on the first
    // frames. Zero = a flat, calm surface from frame 0. Renderer clear state
    // is saved/restored so nothing in the host is disturbed.
    const prevRT = gl.getRenderTarget();
    const prevColor = gl.getClearColor(new Color());
    const prevAlpha = gl.getClearAlpha();
    gl.setClearColor(0x000000, 1);
    targets.forEach((t) => {
      gl.setRenderTarget(t);
      gl.clear(true, false, false);
    });
    gl.setRenderTarget(prevRT);
    gl.setClearColor(prevColor, prevAlpha);

    const material = new ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        tCurr: { value: null as Texture | null },
        tPrev: { value: null as Texture | null },
        uTexel: { value: new Vector2(1 / size, 1 / size) },
        uDamping: { value: 0.976 }, // heavy, viscous water
        uMouse: { value: new Vector2(-10, -10) }, // off-field = no splat
        uSplatStrength: { value: 0 },
        uSplatRadius: { value: 0.0005 },
      },
      depthTest: false,
      depthWrite: false,
    });

    const geometry = new PlaneGeometry(2, 2);
    const scene = new Scene();
    const quad = new Mesh(geometry, material);
    scene.add(quad);
    const camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);

    return {
      targets,
      material,
      geometry,
      scene,
      camera,
      idx: [0, 1, 2] as [number, number, number], // [prev, curr, next]
    };
  }, [gl, vertexShader, fragmentShader, size]);

  // Dispose all GPU resources on unmount.
  useEffect(() => {
    return () => {
      sim.targets.forEach((t) => t.dispose());
      sim.material.dispose();
      sim.geometry.dispose();
    };
  }, [sim]);

  return useMemo<RippleSim>(
    () => ({
      update(mouseUv: Vector2, strength: number) {
        const [prev, curr, next] = sim.idx;
        const u = sim.material.uniforms;
        (u.tPrev.value as Texture | null) = sim.targets[prev].texture;
        (u.tCurr.value as Texture | null) = sim.targets[curr].texture;
        (u.uMouse.value as Vector2).copy(mouseUv);
        u.uSplatStrength.value = strength;

        const prevRT = gl.getRenderTarget();
        gl.setRenderTarget(sim.targets[next]);
        gl.render(sim.scene, sim.camera);
        gl.setRenderTarget(prevRT);

        sim.idx = [curr, next, prev]; // rotate roles
      },
      texture() {
        return sim.targets[sim.idx[1]].texture;
      },
      texel: new Vector2(1 / size, 1 / size),
    }),
    [gl, sim, size]
  );
}
