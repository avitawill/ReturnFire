import { describe, expect, it } from 'vitest';
import { createGame, hashState, type GameState } from '../src/sim';
import { AiCommander } from '../src/sim/ai/commander';
import { makeRng, rand } from '../src/sim/rng';
import { fromWire, Lockstep, toWire, type NetMsg } from '../src/net/lockstep';

/** Two peers over a simulated link: each message arrives `lag` frames later (with jitter). */
function pair(seed: number, opts: { lag: number; jitter: number; delay: number; map?: string }) {
  const r = makeRng(seed);
  const queue: { at: number; to: 0 | 1; msg: NetMsg }[] = [];
  let frame = 0;
  const send = (to: 0 | 1) => (msg: NetMsg) =>
    // JSON round trip, as over the wire.
    queue.push({ at: frame + opts.lag + Math.floor(rand(r) * (opts.jitter + 1)), to, msg: JSON.parse(JSON.stringify(msg)) });
  const peers = [0, 1].map((side) => new Lockstep({ state: createGame({ seed, map: opts.map }), local: side as 0 | 1, delay: opts.delay, send: send(side === 0 ? 1 : 0), hashEvery: 60 }));
  const ais = [new AiCommander(0, 'hard', seed), new AiCommander(1, 'hard', seed)];
  const run = (frames: number, perturb?: (s: GameState[]) => void) => {
    for (let k = 0; k < frames; k++) {
      frame++;
      // Deliver due messages (in order of arrival time).
      queue.sort((a, b) => a.at - b.at);
      while (queue.length && queue[0].at <= frame) {
        const m = queue.shift()!;
        peers[m.to].receive(m.msg);
      }
      if (perturb && k === Math.floor(frames / 3)) perturb(peers.map((p) => p.state));
      // Each machine decides with its own AI on its own copy of the state.
      for (const side of [0, 1] as const) peers[side].tick(ais[side].intent(peers[side].state));
    }
  };
  return { peers, run };
}

describe('lockstep', () => {
  it('intents survive the wire format', () => {
    const it0 = { move: { x: 0.707, y: -0.5 }, fire: true, secondary: false, select: 'jeep' as const };
    expect(fromWire(toWire(it0))).toEqual({ move: { x: 0.71, y: -0.5 }, fire: true, secondary: false, select: 'jeep' });
  });

  it('never puts -0 on the wire (JSON would turn it into 0 on the other machine)', () => {
    const w = toWire({ move: { x: -0.001, y: -0.004 }, fire: false, secondary: false, select: null });
    expect(Object.is(w[0], 0) && Object.is(w[1], 0)).toBe(true);
  });

  it('two machines over a laggy link stay in sync', () => {
    const { peers, run } = pair(3, { lag: 4, jitter: 6, delay: 10 });
    run(60 * 90);
    const [a, b] = peers;
    // Bring them to the same tick before comparing.
    expect(a.state.tick).toBeGreaterThan(60 * 60);
    const t = Math.min(a.state.tick, b.state.tick);
    expect(Math.abs(a.state.tick - b.state.tick)).toBeLessThanOrEqual(10);
    if (a.state.tick === b.state.tick) expect(hashState(a.state)).toBe(hashState(b.state));
    expect(a.desyncs + b.desyncs).toBe(0);
    expect(t).toBeGreaterThan(0);
  });

  it('a diverged guest is resynced from the host', () => {
    const { peers, run } = pair(4, { lag: 3, jitter: 3, delay: 8 });
    run(60 * 40, ([, guest]) => {
      // Simulate a floating-point difference: nudge something on the guest only.
      const u = guest.units.find((x) => x.side === 0)!;
      u.x += 7;
    });
    const [host, guest] = peers;
    expect(guest.resyncs).toBeGreaterThan(0);
    // Let them settle at the same tick, then compare.
    for (let i = 0; i < 30 && host.state.tick !== guest.state.tick; i++) run(1);
    run(60 * 3);
    let same = false;
    for (let i = 0; i < 40 && !same; i++) {
      if (host.state.tick === guest.state.tick) same = hashState(host.state) === hashState(guest.state);
      if (!same) run(1);
    }
    expect(same).toBe(true);
  });
});
