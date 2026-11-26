// Alarm response: once a side's flag is taken, its bunker scrambles drones
// against the thief every few seconds (prototype: "enemy drones on the way").
// Offensive raids are no longer scripted; the AI commander (systems/ai.ts)
// plays the opponent under the same rules as a human.

import { SIDES } from '../entities';
import type { Ctx } from '../events';
import { DEFENCE } from '../tuning';

export function updateRaids(c: Ctx) {
  const s = c.s;
  const D = DEFENCE.drone;
  for (const side of SIDES) {
    const sd = s.sides[side];
    if (!sd.alarm) continue;
    sd.droneT -= c.dt;
    if (sd.droneT > 0) continue;
    sd.droneT = D.interval;
    const alive = s.units.filter((u) => u.side === side && u.kind === 'drone').length;
    if (alive >= D.maxAlive) continue;
    const bunker = s.structs[sd.bunkerId - 1];
    const id = s.nextId++;
    s.units.push({
      id, side, kind: 'drone', x: bunker.x, y: bunker.y, a: sd.spawnA, ta: sd.spawnA,
      hp: D.hp, max: D.hp, cool: 1, hx: bunker.x, hy: bunker.y, wx: bunker.x, wy: bunker.y, wt: 0,
    });
    c.ev.push({ type: 'droneLaunched', side, id });
  }
}
