// Not part of `npm test` (see vitest.config.ts). Run: npx vitest run --config scripts/vitest.scripts.ts mapdump
import { test } from 'vitest';
import { generateWorld } from '../src/sim/world';
import { MAPS } from '../src/sim/maps';

test('dump', () => {
  for (const def of Object.values(MAPS)) {
    const g = generateWorld(def, Number(process.env.SEED ?? 1));
    const { W, H, tiles, block } = g.world;
    const ch = ['~', '.', ':', '=', '#', 'T', 'r', 'P'];
    const sk: Record<string, string> = { bunker: 'B', guard: 'g', turret: 'u', aa: 'A', tower: 'O', wall: 'w' };
    let out = def.name + '\n';
    for (let y = 0; y < H; y++) {
      let row = '';
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        const b = block[i];
        row += b ? (g.structs[b - 1].side === 0 ? sk[g.structs[b - 1].kind] : sk[g.structs[b - 1].kind].toLowerCase()) : ch[tiles[i]];
      }
      out += row + '\n';
    }
    console.log(out);
    console.log('structs', g.structs.length, g.structs.filter(s => s.kind === 'tower').length);
  }
});
