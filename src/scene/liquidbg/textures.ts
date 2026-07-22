import {
  CubeTexture,
  CubeTextureLoader,
  LinearFilter,
  RepeatWrapping,
  SRGBColorSpace,
  Texture,
  TextureLoader,
} from 'three';

/**
 * Base-URL-safe texture loading. The host may deploy under a sub-path
 * (GitHub Pages sets `base` via DEPLOY_BASE), so every asset URL is resolved
 * against `import.meta.env.BASE_URL` rather than an absolute "/textures/…".
 *
 * ALL files below must be copied into the host's `public/textures/`:
 *   textures/normal-map.jpg
 *   textures/tech-pattern.png
 *   textures/smoke.jpg
 *   textures/spark.jpg
 *   textures/leaf.png
 *   textures/cube160/{px,nx,py,ny,pz,nz}.png
 */
const BASE = import.meta.env.BASE_URL ?? '/';

function url(rel: string): string {
  // BASE_URL always ends with '/'; strip any leading slash on rel to join.
  return `${BASE}${rel.replace(/^\//, '')}`;
}

const texLoader = new TextureLoader();
const cubeLoader = new CubeTextureLoader();

/** Fine-grain water normal map, no mipmaps (see Water shader notes). */
export function loadWaterNormal(): Texture {
  const t = texLoader.load(url('textures/normal-map.jpg'));
  t.wrapS = t.wrapT = RepeatWrapping;
  t.generateMipmaps = false;
  t.minFilter = LinearFilter;
  t.magFilter = LinearFilter;
  return t;
}

/** High-frequency detail-normal (repurposed tech-pattern). */
export function loadDetail(): Texture {
  const t = texLoader.load(url('textures/tech-pattern.png'));
  t.wrapS = t.wrapT = RepeatWrapping;
  return t;
}

/** Studio-lightbox cubemap; three.js face order +X −X +Y −Y +Z −Z. */
export function loadEnvCube(): CubeTexture {
  return cubeLoader
    .setPath(url('textures/cube160/'))
    .load(['px.png', 'nx.png', 'py.png', 'ny.png', 'pz.png', 'nz.png']);
}

/** An sRGB sprite (smoke / spark / leaf). */
export function loadSprite(file: string): Texture {
  const t = texLoader.load(url(`textures/${file}`));
  t.colorSpace = SRGBColorSpace;
  return t;
}
