import { describe, expect, it } from 'vitest';
import { createGame } from '../src/sim';
import { MAP_NAMES } from '../src/sim/maps';
import { findPath } from '../src/sim/world';
import { playMatch } from './helpers/harness';

const cases = [...MAP_NAMES.map((m) => ({ map: m, seed: 1 })), ...[1, 2, 3, 4, 5, 6, 7, 8].map((seed) => ({ map: 'random', seed }))];

describe('maps', () => {
  it.each(cases)('$map (seed $seed) is symmetric, complete and drivable pad to pad', ({ map, seed }) => {
    const s = createGame({ seed, map });
    const { W, H, tiles } = s.world;
    for (let i = 0; i < W * H; i++) expect(tiles[i]).toBe(tiles[W * H - 1 - i]);
    for (const side of [0, 1] as const) expect(s.structs.filter((t) => t.kind === 'tower' && t.side === side)).toHaveLength(6);
    const [a, b] = s.sides;
    const open = { ...s.world, block: new Int16Array(W * H) };
    expect(findPath(open, a.padX, a.padY, b.padX, b.padY, 'heavy', { maxNodes: 20000 })).not.toBeNull();
  });

  it('random maps are deterministic per seed and differ between seeds', () => {
    const t = (seed: number) => Array.from(createGame({ seed, map: 'random' }).world.tiles).join('');
    expect(t(11)).toBe(t(11));
    expect(t(11)).not.toBe(t(12));
  });

  it.each(['strait', 'atoll', 'lagoon', 'archipelago', 'canals', 'rivers', 'random'])('hard AI beats a do-nothing player on %s', (map) => {
    for (const seed of [1, 2, 3]) expect(playMatch(seed, 'idle', { ai: 'hard' }, 15, map).winner).toBe(1);
  });

  it.each(['strait', 'atoll', 'lagoon', 'archipelago', 'canals', 'rivers', 'random'])('AI vs AI usually finishes within 15 minutes on %s', (map) => {
    const done = [1, 2, 3].filter((seed) => playMatch(seed, { ai: 'medium' }, { ai: 'medium' }, 15, map).winner !== -1);
    expect(done.length).toBeGreaterThanOrEqual(2);
  });
});
