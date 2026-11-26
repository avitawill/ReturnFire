// Path following on the tile grid. Pure; used by the AI commander and by
// scripted test players.

import { Tile, type GameState, type Intent, type MoveIntent, type Vehicle } from '../entities';
import { adiff, clamp, dist } from '../math';
import { PLAYER, TILE, VEHICLES } from '../tuning';
import { findPath, type Mover } from '../world';
import { moverFor } from '../systems/movement';

export interface NavMemory {
  goalX: number;
  goalY: number;
  path: number[];
  /** Index of the next waypoint in `path`. */
  idx: number;
  /** Tick at which the path was computed. */
  at: number;
  mover: Mover | 'air';
  failed: boolean;
  /** Path goes through hostile structures that must be shot down. */
  breaching: boolean;
  /** Struct id blocking the next waypoint, or -1. */
  blocker: number;
}

export const newNav = (): NavMemory => ({ goalX: NaN, goalY: NaN, path: [], idx: 0, at: -1e9, mover: 'heavy', failed: false, breaching: false, blocker: -1 });

const REPLAN_TICKS = 90;

/**
 * Stick direction that moves `v` toward (gx, gy) along a tile path.
 * Returns a zero vector when within `arrive` px of the goal.
 */
export function steerTo(s: GameState, v: Vehicle, nav: NavMemory, gx: number, gy: number, arrive = 14): MoveIntent {
  if (dist(v.x, v.y, gx, gy) < arrive) return { x: 0, y: 0 };
  if (VEHICLES[v.type].fly) {
    nav.mover = 'air';
    return unit(gx - v.x, gy - v.y);
  }
  const mover = moverFor(v);
  const goalMoved = dist(nav.goalX, nav.goalY, gx, gy) > TILE * 1.5 || Number.isNaN(nav.goalX);
  if (goalMoved || nav.mover !== mover || s.tick - nav.at > REPLAN_TICKS) {
    // Driving over your own pad after leaving it docks the vehicle: route around it unless going home.
    const sd = s.sides[v.side];
    const W = s.world.W;
    const extra = dist(gx, gy, sd.padX, sd.padY) > 80
      ? (i: number) => (dist(((i % W) + 0.5) * TILE, (Math.floor(i / W) + 0.5) * TILE, sd.padX, sd.padY) < 48 ? 40 : 0)
      : undefined;
    let p = findPath(s.world, v.x, v.y, gx, gy, mover, { extra });
    nav.breaching = false;
    if (!p) {
      const breach = (k: number) => {
        const st = s.structs[k];
        return st.side !== v.side && !st.indestructible;
      };
      p = findPath(s.world, v.x, v.y, gx, gy, mover, { breach, extra });
      nav.breaching = !!p;
    }
    nav.goalX = gx;
    nav.goalY = gy;
    nav.mover = mover;
    nav.at = s.tick;
    nav.failed = !p;
    nav.path = p ?? [];
    nav.idx = 0;
  }
  const W = s.world.W;
  nav.blocker = -1;
  void W;
  // Skip waypoints we're already on top of.
  while (nav.idx < nav.path.length) {
    const i = nav.path[nav.idx];
    const wx = ((i % W) + 0.5) * TILE;
    const wy = (Math.floor(i / W) + 0.5) * TILE;
    if (dist(v.x, v.y, wx, wy) < TILE * 0.45) nav.idx++;
    else break;
  }
  if (nav.idx >= nav.path.length) return unit(gx - v.x, gy - v.y);
  const i = nav.path[nav.idx];
  const b = s.world.block[i];
  if (b) {
    if (s.structs[b - 1].alive) nav.blocker = s.structs[b - 1].id;
  }
  const wx = ((i % W) + 0.5) * TILE;
  const wy = (Math.floor(i / W) + 0.5) * TILE;
  return unit(wx - v.x, wy - v.y);
}

export function unit(dx: number, dy: number): MoveIntent {
  const m = Math.hypot(dx, dy);
  return m < 1e-6 ? { x: 0, y: 0 } : { x: dx / m, y: dy / m };
}

/**
 * Safety reflex: a tank or launcher about to roll into the sea turns in place
 * instead (toward the side it wanted to go). Mutates `it.move`.
 */
export function guardWater(s: GameState, v: Vehicle, it: Intent) {
  if (v.type === 'jeep' || VEHICLES[v.type].fly) return;
  if (Math.hypot(it.move.x, it.move.y) <= PLAYER.deadzone) return;
  const want = Math.atan2(it.move.y, it.move.x);
  const w = s.world;
  const wet = (a: number, r: number) => {
    const tx = Math.floor((v.x + Math.cos(a) * r) / TILE);
    const ty = Math.floor((v.y + Math.sin(a) * r) / TILE);
    return tx < 0 || ty < 0 || tx >= w.W || ty >= w.H || w.tiles[ty * w.W + tx] === Tile.Water;
  };
  // The hull turns toward `want` but only advances along its heading.
  const turn = clamp(adiff(want, v.a), -0.25, 0.25);
  if (wet(v.a + turn, 16) || wet(v.a + turn, 24)) {
    const side = adiff(want, v.a) >= 0 ? 1 : -1;
    const a = v.a + side * (Math.PI / 2 + 0.2);
    it.move = { x: Math.cos(a), y: Math.sin(a) };
  }
}
