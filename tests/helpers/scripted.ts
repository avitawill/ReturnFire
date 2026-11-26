// A scripted "competent" player used by tests. It knows where the enemy flag
// is (it reads the state), so it is a test fixture, not an AI.

import { idleIntent, otherSide, type GameState, type Intent, type Side } from '../../src/sim';
import { newNav, steerTo, type NavMemory } from '../../src/sim/ai/nav';
import { dist } from '../../src/sim/math';
import { nearestTarget } from '../../src/sim/systems/combat';
import type { VehicleType } from '../../src/sim/tuning';

export interface ScriptMemory {
  nav: NavMemory;
  vid: number;
}

export const newScript = (): ScriptMemory => ({ nav: newNav(), vid: -1 });

export function scriptedIntent(s: GameState, side: Side, mem: ScriptMemory): Intent {
  const it = idleIntent();
  const sd = s.sides[side];
  const foeFlag = s.flags[otherSide(side)];
  const v = sd.vehicle;
  if (!v) {
    const order: VehicleType[] = foeFlag.state === 'ground' ? ['jeep'] : ['tank', 'launcher', 'heli', 'jeep'];
    it.select = order.find((t) => sd.stock[t] > 0) ?? null;
    return it;
  }
  if (v.id !== mem.vid) {
    mem.vid = v.id;
    mem.nav = newNav();
  }
  const home = () => steerTo(s, v, mem.nav, sd.padX, sd.padY, 4);
  if (v.type === 'jeep') {
    if (v.carrying || foeFlag.state !== 'ground') it.move = home();
    else it.move = steerTo(s, v, mem.nav, foeFlag.x, foeFlag.y, 4);
    it.fire = !!nearestTarget(s, side, v.x, v.y, 200, true);
    return it;
  }
  if (foeFlag.state !== 'hidden') {
    it.move = home();
    return it;
  }
  const tower = s.structs[foeFlag.towerId - 1];
  const d = dist(v.x, v.y, tower.x, tower.y);
  const threat = nearestTarget(s, side, v.x, v.y, 220, false);
  if (d > 150) {
    it.move = steerTo(s, v, mem.nav, tower.x, tower.y, 0);
    it.fire = !!threat || mem.nav.blocker >= 0;
  } else {
    // Face the tower and shoot it; the tank turret prefers nearby guns on its own.
    const dx = tower.x - v.x;
    const dy = tower.y - v.y;
    const m = Math.hypot(dx, dy);
    it.move = { x: (dx / m) * 0.16, y: (dy / m) * 0.16 };
    it.fire = true;
  }
  return it;
}
