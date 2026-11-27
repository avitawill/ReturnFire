// Deterministic lockstep for online play. Both machines run the same sim;
// only intents travel. Each side sends its intent for tick T+delay while it
// simulates tick T, and a tick only runs once both intents for it are known.
// Periodic state hashes catch divergence (e.g. different floating-point maths
// on another browser), and the host then sends a full snapshot to resync.
//
// No DOM here: the transport is a plain `send` function, so this runs in tests.

import { deserialize, hashState, serialize, step, DT, idleIntent, type GameState, type Intent, type Side, type SimEvent } from '../sim';
import { VEHICLE_TYPES, type VehicleType } from '../sim/tuning';

/** Wire form of an intent: [x*100, y*100, fire, secondary, vehicle index or -1]. */
export type WireIntent = [number, number, 0 | 1, 0 | 1, number];

export type NetMsg =
  | { k: 'in'; t: number; i: WireIntent }
  | { k: 'h'; t: number; h: string }
  | { k: 'snap'; t: number; s: string };

export function toWire(it: Intent): WireIntent {
  // `| 0` also turns -0 into 0: JSON sends -0 as 0, and atan2 tells them apart.
  const q = (v: number) => Math.round(Math.max(-1, Math.min(1, Number.isFinite(v) ? v : 0)) * 100) | 0;
  return [q(it.move.x), q(it.move.y), it.fire ? 1 : 0, it.secondary ? 1 : 0, it.select ? VEHICLE_TYPES.indexOf(it.select) : -1];
}

export function fromWire(w: WireIntent): Intent {
  return {
    move: { x: w[0] / 100, y: w[1] / 100 },
    fire: w[2] === 1,
    secondary: w[3] === 1,
    select: w[4] >= 0 ? (VEHICLE_TYPES[w[4]] as VehicleType) : null,
  };
}

export interface LockstepOptions {
  state: GameState;
  /** Which side this machine plays. Side 0 is the host and the authority for resyncs. */
  local: Side;
  /** Input delay in ticks. */
  delay: number;
  send(msg: NetMsg): void;
  /** Called with the events of every tick that runs normally. */
  onEvents?(ev: SimEvent[]): void;
  /** Called after the state was replaced by a resync. */
  onResync?(state: GameState): void;
  /** Ticks between hash checks. */
  hashEvery?: number;
}

const HISTORY = 900;

export class Lockstep {
  state: GameState;
  readonly local: Side;
  readonly delay: number;
  private opts: LockstepOptions;
  private intents: [Map<number, WireIntent>, Map<number, WireIntent>] = [new Map(), new Map()];
  private sentUpTo: number;
  private myHashes = new Map<number, string>();
  private theirHashes = new Map<number, string>();
  /** Ticks we could not run because the other side's intent had not arrived. */
  stalls = 0;
  resyncs = 0;
  desyncs = 0;

  constructor(o: LockstepOptions) {
    this.opts = o;
    this.state = o.state;
    this.local = o.local;
    this.delay = o.delay;
    // Both sides start with idle intents for the first `delay` ticks.
    const t0 = this.state.tick;
    for (let t = t0 + 1; t <= t0 + o.delay; t++) {
      this.intents[0].set(t, toWire(idleIntent()));
      this.intents[1].set(t, toWire(idleIntent()));
    }
    this.sentUpTo = t0 + o.delay;
  }

  get remote(): Side {
    return this.local === 0 ? 1 : 0;
  }

  /** How many ticks of the other side's input we already hold beyond the current tick. */
  get buffered(): number {
    let n = 0;
    while (this.intents[this.remote].has(this.state.tick + 1 + n)) n++;
    return n;
  }

  receive(msg: NetMsg) {
    if (msg.k === 'in') this.intents[this.remote].set(msg.t, msg.i);
    else if (msg.k === 'h') {
      this.theirHashes.set(msg.t, msg.h);
      this.compare(msg.t);
    } else if (msg.k === 'snap') this.applySnapshot(msg.t, msg.s);
  }

  /**
   * Try to run one tick with the given local intent. Returns false (a stall)
   * if the other side's intent for that tick has not arrived yet.
   */
  tick(localIntent: Intent): boolean {
    const next = this.state.tick + 1;
    // Schedule our intent `delay` ticks ahead (never more than once per tick).
    while (this.sentUpTo < next + this.delay) {
      const t = this.sentUpTo + 1;
      const w = toWire(localIntent);
      this.intents[this.local].set(t, w);
      this.opts.send({ k: 'in', t, i: w });
      this.sentUpTo = t;
    }
    const mine = this.intents[this.local].get(next);
    const theirs = this.intents[this.remote].get(next);
    if (!mine || !theirs) {
      this.stalls++;
      return false;
    }
    const ev = this.run(next);
    this.opts.onEvents?.(ev);
    this.afterTick(next);
    return true;
  }

  private run(t: number): SimEvent[] {
    const i0 = fromWire(this.intents[0].get(t)!);
    const i1 = fromWire(this.intents[1].get(t)!);
    return step(this.state, [i0, i1], DT);
  }

  private afterTick(t: number) {
    const every = this.opts.hashEvery ?? 120;
    if (t % every === 0) {
      const h = hashState(this.state);
      this.myHashes.set(t, h);
      this.opts.send({ k: 'h', t, h });
      this.compare(t);
    }
    // Forget old history.
    const old = t - HISTORY;
    for (const m of [...this.intents, this.myHashes, this.theirHashes]) for (const k of m.keys()) if (k < old) m.delete(k);
  }

  private compare(t: number) {
    const a = this.myHashes.get(t);
    const b = this.theirHashes.get(t);
    if (!a || !b || a === b) return;
    this.desyncs++;
    this.myHashes.delete(t);
    this.theirHashes.delete(t);
    // The host is the authority: it sends its current state.
    if (this.local === 0) this.opts.send({ k: 'snap', t: this.state.tick, s: serialize(this.state) });
  }

  /** Guest: replace the state with the host's, then replay any ticks we had already run past it. */
  private applySnapshot(t: number, s: string) {
    if (this.local === 0) return;
    const ahead = this.state.tick;
    const fresh = deserialize(s);
    this.state = fresh;
    for (let k = t + 1; k <= ahead; k++) {
      if (!this.intents[0].has(k) || !this.intents[1].has(k)) break;
      this.run(k);
    }
    this.resyncs++;
    for (const k of [...this.myHashes.keys()]) if (k > t) this.myHashes.delete(k);
    this.opts.onResync?.(this.state);
  }
}

/** Input delay in ticks for a measured round-trip time (ms). */
export function delayForRtt(rttMs: number): number {
  return Math.max(4, Math.min(20, Math.ceil(rttMs / 2 / (DT * 1000)) + 3));
}
