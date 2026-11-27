import { describe, expect, it } from 'vitest';
import { createGame, hashState, idleIntent, step, DT, type GameState, type Intent, type SimEvent } from '../src/sim';
import { newScript, scriptedIntent } from './helpers/scripted';

function runScripted(seed: number, maxSeconds = 900) {
  const s = createGame({ seed });
  const mem = newScript();
  const log: SimEvent[] = [];
  const maxTicks = Math.round(maxSeconds / DT);
  while (s.winner === -1 && s.tick < maxTicks) {
    const intents: [Intent, Intent] = [scriptedIntent(s, 0, mem), idleIntent()];
    for (const e of step(s, intents, DT)) log.push(e);
  }
  return { s, log };
}

describe('headless full match', () => {
  it('a scripted player drives, shoots, destroys a tower and carries the flag home', () => {
    const { s, log } = runScripted(7);
    const types = new Set(log.map((e) => e.type));
    expect(types.has('vehicleSpawned')).toBe(true);
    expect(types.has('shot')).toBe(true);
    expect(log.some((e) => e.type === 'structureDestroyed' && e.kind === 'tower')).toBe(true);
    expect(log.some((e) => e.type === 'flagRevealed' && e.side === 1)).toBe(true);
    expect(log.some((e) => e.type === 'flagTaken' && e.by === 0)).toBe(true);
    expect(s.winner).toBe(0);
    expect(s.endReason).toBe('flagCaptured');
    expect(s.flags[1].state).toBe('captured');
  });

  it('wins across several seeds', () => {
    for (const seed of [1, 2, 3]) expect(runScripted(seed).s.winner, `seed ${seed}`).toBe(0);
  });
});

describe('determinism', () => {
  const run = (seed: number): GameState => runScripted(seed, 240).s;

  it('same seed and inputs give byte-identical final state', () => {
    const a = run(42);
    const b = run(42);
    expect(hashState(a)).toBe(hashState(b));
    expect(a.tick).toBeGreaterThan(100);
  });

  it('different seeds diverge', () => {
    expect(hashState(createGame({ seed: 1 }))).not.toBe(hashState(createGame({ seed: 2 })));
  });

  it('step rejects a variable timestep', () => {
    const s = createGame({ seed: 1 });
    expect(() => step(s, [idleIntent(), idleIntent()], 0.02)).toThrow();
  });
});

describe('serialisation', () => {
  it('round-trips a state mid-match, and the copy keeps simulating identically', async () => {
    const { serialize, deserialize } = await import('../src/sim');
    const a = runScripted(5, 60).s;
    const b = deserialize(serialize(a));
    expect(hashState(b)).toBe(hashState(a));
    for (let i = 0; i < 600; i++) {
      step(a, [idleIntent(), idleIntent()]);
      step(b, [idleIntent(), idleIntent()]);
    }
    expect(hashState(b)).toBe(hashState(a));
  });
});
