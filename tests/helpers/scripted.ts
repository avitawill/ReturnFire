// A scripted "competent" player used by tests. It knows where the enemy flag
// is (it reads the state), so it is a test fixture, not an AI. Beyond that it
// plays sensibly: it repairs at the bunker before a vehicle is lost, clears
// guns around the flag, and only sends the jeep when no enemy vehicle is near.

import { idleIntent, otherSide, type GameState, type Intent, type Side } from '../../src/sim';
import { guardWater, newNav, steerTo, type NavMemory } from '../../src/sim/ai/nav';
import { dist } from '../../src/sim/math';
import { nearestTarget } from '../../src/sim/systems/combat';
import { VEHICLES, type VehicleType } from '../../src/sim/tuning';

export interface ScriptMemory {
  nav: NavMemory;
  vid: number;
  retreat: boolean;
}

export const newScript = (): ScriptMemory => ({ nav: newNav(), vid: -1, retreat: false });

/** Enemy commander vehicle that could kill a jeep near (x, y). */
function enemyNear(s: GameState, side: Side, x: number, y: number, r: number) {
  const ev = s.sides[otherSide(side)].vehicle;
  return !!ev && ev.type !== 'jeep' && dist(ev.x, ev.y, x, y) < r;
}

export function scriptedIntent(s: GameState, side: Side, mem: ScriptMemory): Intent {
  const it = decide(s, side, mem);
  const v = s.sides[side].vehicle;
  if (v) guardWater(s, v, it);
  return it;
}

function decide(s: GameState, side: Side, mem: ScriptMemory): Intent {
  const it = idleIntent();
  const sd = s.sides[side];
  const foeFlag = s.flags[otherSide(side)];
  const v = sd.vehicle;
  if (!v) {
    let order: VehicleType[];
    if (foeFlag.state === 'ground') {
      // Wait for an opening before sending the jeep, unless only jeeps are left.
      const combat = sd.stock.tank + sd.stock.launcher + sd.stock.heli > 0;
      const guarded = nearbyGuns(s, side, foeFlag.x, foeFlag.y) > 0;
      const ev = s.sides[otherSide(side)].vehicle;
      const hunter = ev && ev.type !== 'jeep' && (sd.stock.launcher > 0 || (ev.type !== 'heli' && sd.stock.tank > 0));
      if (guarded && combat) order = ['launcher', 'tank', 'heli'];
      else if (hunter) order = ev!.type === 'heli' ? ['launcher'] : ['launcher', 'tank'];
      else if (enemyNear(s, side, foeFlag.x, foeFlag.y, 700) && combat && s.time % 30 < 25) return it;
      else order = ['jeep'];
    } else order = ['launcher', 'tank', 'heli', 'jeep'];
    it.select = order.find((t) => sd.stock[t] > 0) ?? null;
    return it;
  }
  if (v.id !== mem.vid) {
    mem.vid = v.id;
    mem.nav = newNav();
    mem.retreat = false;
  }
  const spec = VEHICLES[v.type];
  const home = () => steerTo(s, v, mem.nav, sd.padX, sd.padY, 4);
  const homeDist = dist(v.x, v.y, sd.padX, sd.padY);
  if (v.hp < spec.hp * 0.4 || (spec.fly && v.fuel < (homeDist / spec.speed) * 1.5 + 6) || v.ammo === 0) mem.retreat = true;
  const threat = nearestTarget(s, side, v.x, v.y, v.type === 'jeep' ? 180 : 230, v.type !== 'tank');
  if (v.type === 'jeep') {
    if (v.carrying || foeFlag.state !== 'ground') it.move = home();
    else it.move = steerTo(s, v, mem.nav, foeFlag.x, foeFlag.y, 4);
    it.fire = !!threat;
    return it;
  }
  // Hunt the enemy's vehicle while our flag-runner would be exposed to it.
  const ev = s.sides[otherSide(side)].vehicle;
  if (!mem.retreat && foeFlag.state === 'ground' && ev && ev.type !== 'jeep' && (v.type === 'launcher' || (v.type === 'tank' && ev.type !== 'heli'))) {
    const d = dist(v.x, v.y, ev.x, ev.y);
    it.move = d > 300 ? steerTo(s, v, mem.nav, ev.x, ev.y, 250) : { x: 0, y: 0 };
    it.fire = d < 400;
    return it;
  }
  if (mem.retreat || (foeFlag.state !== 'hidden' && nearbyGuns(s, side, foeFlag.x, foeFlag.y) === 0)) {
    it.move = home();
    it.fire = !!threat;
    return it;
  }
  // Siege: first every gun covering the flag tower, from just outside its reach; then the tower.
  const fx = foeFlag.state === 'hidden' ? s.structs[foeFlag.towerId - 1].x : foeFlag.x;
  const fy = foeFlag.state === 'hidden' ? s.structs[foeFlag.towerId - 1].y : foeFlag.y;
  const gun = nearestDefence(s, side, fx, fy, 330, v.x, v.y);
  let tx = fx;
  let ty = fy;
  let hold = 150;
  if (gun) {
    tx = gun.x;
    ty = gun.y;
    hold = v.type === 'launcher' ? 330 : v.type === 'tank' ? 226 : 200;
  }
  const d = dist(v.x, v.y, tx, ty);
  if (d > hold) {
    it.move = steerTo(s, v, mem.nav, tx, ty, 0);
    it.fire = !!threat || mem.nav.blocker >= 0;
  } else {
    // Hold and shoot: the tank turret and homing rockets aim themselves; others face the target.
    const m = Math.hypot(tx - v.x, ty - v.y);
    const a = Math.atan2(ty - v.y, tx - v.x);
    const off = Math.abs(((a - v.a + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
    it.move = off > 0.4 ? { x: (tx - v.x) / m, y: (ty - v.y) / m } : { x: ((tx - v.x) / m) * 0.16, y: ((ty - v.y) / m) * 0.16 };
    if (gun && d < hold - 30) it.move = { x: 0, y: 0 };
    it.fire = true;
  }
  return it;
}

/** Nearest enemy gun or patrol tank covering (x, y). */
function nearestGun(s: GameState, side: Side, x: number, y: number): { x: number; y: number } | null {
  let best: { x: number; y: number } | null = null;
  let bd = 230;
  for (const st of s.structs)
    if (st.alive && st.side !== side && st.kind === 'turret') {
      const d = dist(st.x, st.y, x, y);
      if (d < bd) {
        bd = d;
        best = st;
      }
    }
  for (const u of s.units)
    if (u.side !== side && u.kind === 'ptank') {
      const d = dist(u.x, u.y, x, y) - 70;
      if (d < bd) {
        bd = d;
        best = u;
      }
    }
  return best;
}

/** The enemy defence within `r` of (x, y) closest to the vehicle at (vx, vy). */
function nearestDefence(s: GameState, side: Side, x: number, y: number, r: number, vx: number, vy: number) {
  let best: { x: number; y: number } | null = null;
  let bd = Infinity;
  for (const st of s.structs)
    if (st.alive && st.side !== side && (st.kind === 'turret' || st.kind === 'aa') && dist(st.x, st.y, x, y) < r) {
      const d = dist(st.x, st.y, vx, vy);
      if (d < bd) {
        bd = d;
        best = st;
      }
    }
  return best;
}

function nearbyGuns(s: GameState, side: Side, x: number, y: number) {
  return nearestGun(s, side, x, y) ? 1 : 0;
}
