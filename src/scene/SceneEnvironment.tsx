import { useEffect } from 'react';
import { useThree } from '@react-three/fiber';
import {
  BackSide,
  Mesh,
  PMREMGenerator,
  Scene,
  ShaderMaterial,
  SphereGeometry,
} from 'three';

/**
 * Environment map generated from the scene's OWN world — not a studio HDRI
 * the subject visibly doesn't stand in. A procedural sphere reproduces the
 * void: near-black floor, faint cool horizon band where the rims live, dark
 * zenith. PMREM'd once at boot; materials then reflect the room they're
 * actually in, which is what sells the monochrome specular look.
 */
const ENV_VERT = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const ENV_FRAG = /* glsl */ `
  varying vec3 vDir;
  void main() {
    float h = vDir.y; // -1 floor … +1 zenith
    // Void floor, faint cool horizon glow, dark ceiling.
    vec3 floorC = vec3(0.012, 0.014, 0.016);
    vec3 horizon = vec3(0.10, 0.115, 0.13);
    vec3 zenith = vec3(0.03, 0.035, 0.042);
    vec3 col = mix(floorC, horizon, smoothstep(-0.35, 0.06, h));
    col = mix(col, zenith, smoothstep(0.12, 0.75, h));
    // The rims sit behind-above: bias a touch of extra light into -z.
    col *= 1.0 + 0.35 * smoothstep(0.2, 1.0, -vDir.z) * smoothstep(0.0, 0.6, h);
    gl_FragColor = vec4(col, 1.0);
  }
`;

export function SceneEnvironment() {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);

  useEffect(() => {
    const pmrem = new PMREMGenerator(gl);
    const envScene = new Scene();
    const mat = new ShaderMaterial({
      vertexShader: ENV_VERT,
      fragmentShader: ENV_FRAG,
      side: BackSide,
      depthWrite: false,
    });
    const sphere = new Mesh(new SphereGeometry(10, 48, 24), mat);
    envScene.add(sphere);

    const rt = pmrem.fromScene(envScene, 0.04);
    scene.environment = rt.texture;

    return () => {
      scene.environment = null;
      rt.dispose();
      pmrem.dispose();
      sphere.geometry.dispose();
      mat.dispose();
    };
  }, [gl, scene]);

  return null;
}
