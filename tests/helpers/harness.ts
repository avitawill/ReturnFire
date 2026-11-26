import { createGame, idleIntent, step, DT, type GameState, type Intent, type Side } from '../../src/sim';
import { AiCommander, type Difficulty } from '../../src/sim/ai/commander';
import { TILE } from '../../src/sim/tuning';
import { newScript, scriptedIntent } from './scripted';

export type PlayerKind = { ai: Difficulty } | 'idle' | 'scripted';

export interface StuckReport {
  side: Side;
  vehicle: string;
  at: number;
  x: number;
  y: number;
}

export interface MatchResult {
  seed: number;
  winner: Side | -1;
  reason: string | null;
  minutes: number;
  towersLeft: [number, number];
  lost: [number, number];
  stuck: StuckReport[];
  state: GameState;
}

const STUCK_SECONDS = 20;

/** Plays a match headless. Tracks AI ground vehicles that stay within one tile for 20 s while they have a destination. */
export function playMatch(seed: number, p0: PlayerKind, p1: PlayerKind, maxMinutes = 15): MatchResult {
  const s = createGame({ seed });
  const mk = (p: PlayerKind, side: Side) => {
    if (p === 'idle') return () => idleIntent();
    if (p === 'scripted') {
      const mem = newScript();
      return () => scriptedIntent(s, side, mem);
    }
    const ai = new AiCommander(side, p.ai, seed);
    return Object.assign(() => ai.intent(s), { ai });
  };
  const ctl = [mk(p0, 0), mk(p1, 1)] as const;
  const anchor: ({ x: number; y: number; t: number; id: number } | null)[] = [null, null];
  const stuck: StuckReport[] = [];
  const maxTicks = Math.round((maxMinutes * 60) / DT);
  while (s.winner === -1 && s.tick < maxTicks) {
    const intents: [Intent, Intent] = [ctl[0](), ctl[1]()];
    step(s, intents, DT);
    for (const side of [0, 1] as Side[]) {
      const ai = (ctl[side] as { ai?: AiCommander }).ai;
      const v = s.sides[side].vehicle;
      if (!ai || !v || v.type === 'heli') {
        anchor[side] = null;
        continue;
      }
      const a = anchor[side];
      if (!ai.debug.hasDestination || !a || a.id !== v.id || Math.hypot(v.x - a.x, v.y - a.y) > TILE) {
        anchor[side] = { x: v.x, y: v.y, t: s.time, id: v.id };
        continue;
      }
      if (s.time - a.t > STUCK_SECONDS) {
        stuck.push({ side, vehicle: v.type, at: s.time, x: v.x / TILE, y: v.y / TILE });
        anchor[side] = { x: v.x, y: v.y, t: s.time, id: v.id };
      }
    }
  }
  return {
    seed,
    winner: s.winner,
    reason: s.endReason,
    minutes: s.time / 60,
    towersLeft: [s.sides[0].towersLeft, s.sides[1].towersLeft],
    lost: [s.sides[0].vehiclesLost, s.sides[1].vehiclesLost],
    stuck,
    state: s,
  };
}
