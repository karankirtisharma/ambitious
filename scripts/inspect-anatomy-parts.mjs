/**
 * One-off: locate anatomy sub-meshes by bounding box so extremity parts
 * (hands — crude and misregistered) can be hidden by name in Anatomy.tsx.
 * Model space: normalized, feet y=0, height 1.8, A-pose arms out ±x.
 */
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import { getBounds } from '@gltf-transform/functions';

await MeshoptDecoder.ready;
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.decoder': MeshoptDecoder });

const doc = await io.read('public/models/anatomy.glb');
const rows = [];
for (const node of doc.getRoot().listNodes()) {
  if (!node.getMesh()) continue;
  const b = getBounds(node);
  const cx = (b.min[0] + b.max[0]) / 2;
  const cy = (b.min[1] + b.max[1]) / 2;
  const sx = b.max[0] - b.min[0];
  rows.push({
    name: node.getName(),
    cx: +cx.toFixed(2),
    cy: +cy.toFixed(2),
    minX: +b.min[0].toFixed(2),
    maxX: +b.max[0].toFixed(2),
    spanX: +sx.toFixed(2),
  });
}
rows.sort((a, b) => Math.max(Math.abs(b.minX), Math.abs(b.maxX)) - Math.max(Math.abs(a.minX), Math.abs(a.maxX)));
for (const r of rows.slice(0, 18)) console.log(JSON.stringify(r));
console.log(`total: ${rows.length}`);
