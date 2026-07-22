/**
 * Cyphernaut asset pipeline.
 * Tripo AI GLBs arrive at ~2M triangles / ~57MB with no rig; this pass
 * strips the transmission-volume extension (three.js would otherwise run the
 * expensive transparent transmission pass), simplifies, normalizes scale so
 * both characters stand ~1.8 units tall with feet at y=0, compresses textures
 * to WebP and geometry with meshopt.
 *
 * Run: npm run optimize:models
 */
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import {
  dedup,
  flatten,
  join,
  weld,
  simplify,
  prune,
  textureCompress,
  meshopt,
  getBounds,
} from '@gltf-transform/functions';
import { MeshoptSimplifier, MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
import sharp from 'sharp';

const MODELS = [
  { src: 'assets-src/cypherpunk-src.glb', out: 'public/models/cypherpunk.glb', ratio: 0.12, fit: 'height', target: 1.8 },
  { src: 'assets-src/astronaut-src.glb', out: 'public/models/astronaut.glb', ratio: 0.12, fit: 'height', target: 1.8 },
  // A disc platform's silhouette survives far harder simplification.
  { src: 'assets-src/futuristic platform 3d model.glb', out: 'public/models/platform.glb', ratio: 0.05, fit: 'footprint', target: 2.3 },
  // Anatomy underlay for the X-ray lens. Normalized to the SAME height/base
  // as cypherpunk so the two register when nested in one transform. Kept a
  // touch denser than the body (0.16 vs 0.12): the reveal shows internal
  // muscle/organ detail up close, which simplifies away faster than a
  // clothed silhouette. Run: npm run optimize:models anatomy
  { src: 'assets-src/anatomy-src.glb', out: 'public/models/anatomy.glb', ratio: 0.16, fit: 'height', target: 1.8 },
];

await MeshoptSimplifier.ready;
await MeshoptEncoder.ready;
await MeshoptDecoder.ready;

const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({
    'meshopt.encoder': MeshoptEncoder,
    'meshopt.decoder': MeshoptDecoder,
  });

// Optional filter: `node scripts/optimize-models.mjs platform` runs matches only.
const only = process.argv[2];

for (const { src, out, ratio, fit, target } of MODELS) {
  if (only && !src.includes(only)) continue;
  console.log(`\n=== ${src} ===`);
  const doc = await io.read(src);

  for (const mat of doc.getRoot().listMaterials()) {
    mat.setExtension('KHR_materials_volume', null);
    mat.setExtension('KHR_materials_transmission', null);
    // Tripo occasionally emits fully-metallic dielectrics; keep PBR sane.
    if (mat.getMetallicFactor() > 0.9 && mat.getRoughnessFactor() < 0.2) {
      mat.setRoughnessFactor(0.4);
    }
  }

  await doc.transform(
    dedup(),
    flatten(),
    join(),
    weld(),
    simplify({ simplifier: MeshoptSimplifier, ratio, error: 0.001, lockBorder: true }),
    prune()
  );

  // Normalize: base at y=0, centered on x/z. Characters fit a target height;
  // platforms fit a target footprint diameter.
  const scene = doc.getRoot().getDefaultScene() ?? doc.getRoot().listScenes()[0];
  const bounds = getBounds(scene);
  const span =
    fit === 'footprint'
      ? Math.max(bounds.max[0] - bounds.min[0], bounds.max[2] - bounds.min[2])
      : bounds.max[1] - bounds.min[1];
  const scale = target / span;
  const cx = (bounds.min[0] + bounds.max[0]) / 2;
  const cz = (bounds.min[2] + bounds.max[2]) / 2;

  const wrapper = doc.createNode('normalized').setScale([scale, scale, scale]);
  const offset = doc
    .createNode('offset')
    .setTranslation([-cx, -bounds.min[1], -cz]);
  wrapper.addChild(offset);
  for (const child of scene.listChildren()) {
    if (child !== wrapper) offset.addChild(child);
  }
  scene.addChild(wrapper);

  await doc.transform(
    flatten(),
    textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [1024, 1024], quality: 85 }),
    meshopt({ encoder: MeshoptEncoder, level: 'high' })
  );

  await io.write(out, doc);

  const outDoc = await io.read(out);
  let tris = 0;
  for (const mesh of outDoc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const indices = prim.getIndices();
      tris += indices ? indices.getCount() / 3 : prim.getAttribute('POSITION').getCount() / 3;
    }
  }
  const { statSync } = await import('node:fs');
  const mb = (statSync(out).size / 1048576).toFixed(2);
  const outBounds = getBounds(outDoc.getRoot().listScenes()[0]);
  console.log(
    `→ ${out}: ${mb}MB, ${Math.round(tris).toLocaleString()} tris, ` +
      `height ${(outBounds.max[1] - outBounds.min[1]).toFixed(2)}, ` +
      `feet y=${outBounds.min[1].toFixed(3)}, ` +
      `materials ${outDoc.getRoot().listMaterials().length}, ` +
      `extensions [${outDoc.getRoot().listExtensionsUsed().map((e) => e.extensionName).join(', ')}]`
  );
}

console.log('\nDone.');
