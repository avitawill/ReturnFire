// Public entry point of the simulation. Pure logic: no DOM, no WebGL, no
// wall-clock time, no Math.random. Same seed + same intents => same state.

import type { GameState, Intent, Side } from './entities';
import type { Ctx, SimEvent } from './events';
import { updateMines, updateProjectiles, updateStructures, vehicleWeapons } from './systems/combat';
import { moveVehicle } from './systems/movement';
import { updateRaids } from './systems/raids';
import { trySpawn, vehicleRules } from './systems/rules';
import { updateUnits } from './systems/units';
import { DT } from './tuning';

export * from './entities';
export * from './events';
export { createGame, type GameOptions } from './state';
export { DT } from './tuning';

/**
 * Advance the game by one fixed tick. `dt` must be the fixed timestep (DT);
 * it is a parameter so callers state their assumption explicitly.
 * Returns the events that happened during the tick.
 */
export function step(state: GameState, intents: readonly [Intent, Intent], dt: number = DT): SimEvent[] {
  if (Math.abs(dt - DT) > 1e-9) throw new Error(`step() needs the fixed timestep ${DT}, got ${dt}`);
  const c: Ctx = { s: state, ev: [], dt };
  if (state.winner !== -1) return c.ev;
  state.tick++;
  state.time = state.tick * DT;

  // Alternate which side acts first so neither gets a systematic edge.
  const order: Side[] = state.tick % 2 ? [0, 1] : [1, 0];
  for (const side of order) {
    const sd = state.sides[side];
    if (sd.respawn > 0) sd.respawn = Math.max(0, sd.respawn - dt);
    trySpawn(c, side, intents[side]);
    const v = sd.vehicle;
    if (!v) continue;
    if (!moveVehicle(c, v, intents[side])) continue;
    if (v.sink > 0) continue;
    vehicleWeapons(c, v, intents[side].fire, intents[side].secondary);
    if (state.sides[side].vehicle === v) vehicleRules(c, v);
    if (state.winner !== -1) return c.ev;
  }
  updateStructures(c);
  updateUnits(c);
  updateRaids(c);
  updateProjectiles(c);
  updateMines(c);
  return c.ev;
}

/** Canonical serialisation of a state (typed arrays as plain arrays). */
export function serialize(state: GameState): string {
  return JSON.stringify(state, (_k, v) => (ArrayBuffer.isView(v) ? Array.from(v as Uint8Array) : v));
}

/** FNV-1a hash of the serialised state; cheap equality check for determinism tests. */
export function hashState(state: GameState): string {
  const str = serialize(state);
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}
