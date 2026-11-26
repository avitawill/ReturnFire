import { describe, expect, it } from 'vitest';
import { createGame, idleIntent, step, DT, type GameState, type Intent } from '../src/sim';
import { AiCommander } from '../src/sim/ai/commander';
import { playMatch, type MatchResult } from './helpers/harness';

const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
const summary = (r: MatchResult) => `seed ${r.seed}: winner ${r.winner} ${r.reason} ${r.minutes.toFixed(1)} min`;

describe('AI commander', () => {
  const stuck: string[] = [];

  it('AI vs AI matches finish with a winner in under 15 simulated minutes in at least 9 of 10 seeds', () => {
    const results = SEEDS.map((seed) => playMatch(seed, { ai: 'medium' }, { ai: 'medium' }, 15));
    for (const r of results) stuck.push(...r.stuck.map((x) => `${summary(r)} ${JSON.stringify(x)}`));
    const finished = results.filter((r) => r.winner !== -1 && r.minutes < 15);
    expect(finished.length, results.map(summary).join('\n')).toBeGreaterThanOrEqual(9);
  });

  it('on hard, the AI beats a do-nothing player every time', () => {
    for (const seed of SEEDS) {
      const r = playMatch(seed, 'idle', { ai: 'hard' }, 20);
      stuck.push(...r.stuck.map((x) => `${summary(r)} ${JSON.stringify(x)}`));
      expect(r.winner, summary(r)).toBe(1);
    }
    // And from the other side of the (mirrored) map.
    for (const seed of SEEDS.slice(0, 3)) expect(playMatch(seed, { ai: 'hard' }, 'idle', 20).winner).toBe(0);
  });

  it('on easy, a scripted competent player beats it at least 8 of 10 times', () => {
    const results = SEEDS.map((seed) => playMatch(seed, 'scripted', { ai: 'easy' }, 20));
    for (const r of results) stuck.push(...r.stuck.map((x) => `${summary(r)} ${JSON.stringify(x)}`));
    const wins = results.filter((r) => r.winner === 0).length;
    expect(wins, results.map(summary).join('\n')).toBeGreaterThanOrEqual(8);
  });

  it('AI ground vehicles never stay within one tile for 20 s while they have a destination', () => {
    // Collected across every match above.
    expect(stuck).toEqual([]);
  });

  it('does not use hidden information: moving the hidden flag changes nothing until a tower falls', () => {
    const run = (s: GameState) => {
      const ai = new AiCommander(1, 'hard', 3);
      const log: string[] = [];
      while (s.tick < 60 * 600) {
        const it = ai.intent(s);
        log.push(JSON.stringify(it));
        const ev = step(s, [idleIntent(), it] as [Intent, Intent], DT);
        if (ev.some((e) => e.type === 'structureDestroyed' && e.kind === 'tower')) break;
      }
      return log;
    };
    const a = createGame({ seed: 3 });
    const b = createGame({ seed: 3 });
    // Move side 0's flag to a different tower in b.
    const towers = b.structs.filter((t) => t.kind === 'tower' && t.side === 0);
    const from = towers.find((t) => t.hasFlag)!;
    const to = towers.find((t) => !t.hasFlag)!;
    from.hasFlag = false;
    to.hasFlag = true;
    Object.assign(b.flags[0], { towerId: to.id, x: to.x, y: to.y, hx: to.x, hy: to.y });
    const la = run(a);
    const lb = run(b);
    expect(la.length).toBeGreaterThan(600);
    expect(lb).toEqual(la);
  });

  it('is deterministic', () => {
    const a = playMatch(4, { ai: 'medium' }, { ai: 'hard' }, 5);
    const b = playMatch(4, { ai: 'medium' }, { ai: 'hard' }, 5);
    expect(a.state.tick).toBe(b.state.tick);
    expect(JSON.stringify(a.state.sides)).toBe(JSON.stringify(b.state.sides));
  });
});
