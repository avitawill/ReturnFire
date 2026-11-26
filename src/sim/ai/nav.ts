// Path following on the tile grid. Pure; used by the AI commander and by
// scripted test players.

import type { GameState, MoveIntent, Vehicle } from '../entities';
import { dist } from '../math';
import { TILE, VEHICLES } from '../tuning';
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
    let p = findPath(s.world, v.x, v.y, gx, gy, mover);
    nav.breaching = false;
    if (!p) {
      const breach = (k: number) => {
        const st = s.structs[k];
        return st.side !== v.side && !st.indestructible;
      };
      p = findPath(s.world, v.x, v.y, gx, gy, mover, { breach });
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
