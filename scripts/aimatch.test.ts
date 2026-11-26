import { test } from 'vitest';
import { playMatch, type PlayerKind } from '../tests/helpers/harness';
test('ai matches', () => {
  const kind = (k: string): PlayerKind => (k === 'idle' || k === 'scripted' ? k : { ai: k as 'easy' | 'medium' | 'hard' });
  const p0 = kind(process.env.P0 ?? 'medium');
  const p1 = kind(process.env.P1 ?? 'medium');
  const n = Number(process.env.N ?? 10);
  for (let seed = 1; seed <= n; seed++) {
    const t0 = Date.now();
    const r = playMatch(seed, p0, p1, Number(process.env.MIN ?? 15));
    console.log(`seed ${seed}: winner ${r.winner} ${r.reason ?? ''} ${r.minutes.toFixed(1)}min towersLeft ${r.towersLeft} lost ${r.lost} stuck ${JSON.stringify(r.stuck.slice(0, 3))} (${Date.now() - t0}ms)`);
  }
}, 600_000);
