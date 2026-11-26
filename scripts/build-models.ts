// Writes public/models/models.glb from src/render/modeldefs.ts.
import { writeFileSync } from 'node:fs';
import { allModels } from '../src/render/modeldefs';
import { writeGlb, type GlbNode } from './glb';

const roots: GlbNode[] = allModels().map((m) => ({
  name: m.id,
  children: m.parts.map((p) => ({ name: p.name, translation: p.at, mesh: { geo: p.geo, material: p.material } })),
}));
const bytes = writeGlb(roots, ['satin', 'matte', 'glass']);
writeFileSync(new URL('../public/models/models.glb', import.meta.url), bytes);
console.log(`models.glb: ${roots.length} models, ${(bytes.length / 1024).toFixed(0)} KB`);
