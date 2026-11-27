// Ground passability, tree crushing and commander-vehicle movement.

import { Tile, type Intent, type Vehicle } from '../entities';
import type { Ctx } from '../events';
import { adiff, clamp } from '../math';
import { FPV, PLAYER, TILE, VEHICLES } from '../tuning';
import { tileAt, type Mover } from '../world';
import { detonate, diveContact, explode, vehicleHeight } from './combat';
import { loseVehicle } from './rules';

/**
 * Can a mover occupy this point? Heavy movers crush trees as a side effect
 * (as in the prototype, a blocked move can still flatten the tree it touched).
 */
export function pass(c: Ctx, x: number, y: number, mover: Mover): boolean {
  const w = c.s.world;
  const tx = Math.floor(x / TILE);
  const ty = Math.floor(y / TILE);
  if (tx < 0 || ty < 0 || tx >= w.W || ty >= w.H) return false;
  const i = ty * w.W + tx;
  if (w.block[i]) return false;
  const t = w.tiles[i];
  if (t === Tile.Water) return mover !== 'ptank';
  if (t === Tile.Tree) {
    if (mover === 'jeep') return false;
    w.tiles[i] = Tile.Grass;
    c.ev.push({ type: 'treeCrushed', tile: i, x: (tx + 0.5) * TILE, y: (ty + 0.5) * TILE });
  }
  return true;
}

export function canStand(c: Ctx, x: number, y: number, r: number, mover: Mover): boolean {
  const q = r * 0.75;
  return pass(c, x - q, y - q, mover) && pass(c, x + q, y - q, mover) && pass(c, x - q, y + q, mover) && pass(c, x + q, y + q, mover);
}

export const moverFor = (v: Vehicle): Mover => (v.type === 'jeep' ? 'jeep' : 'heavy');

/** Moves a commander vehicle. Returns false if the vehicle was lost this tick. */
export function moveVehicle(c: Ctx, v: Vehicle, intent: Intent): boolean {
  const s = c.s;
  const dt = c.dt;
  const spec = VEHICLES[v.type];
  if (v.dive > 0) {
    // Diving drone: straight down onto whatever is ahead, a little steering allowed.
    v.dive += dt;
    const ix = Number.isFinite(intent.move.x) ? intent.move.x : 0;
    const iy = Number.isFinite(intent.move.y) ? intent.move.y : 0;
    if (Math.hypot(ix, iy) > PLAYER.deadzone) {
      const d = adiff(Math.atan2(iy, ix), v.a);
      const k = spec.turn * FPV.diveTurn * dt;
      v.a += clamp(d, -k, k);
    }
    v.x = clamp(v.x + Math.cos(v.a) * FPV.diveSpeed * dt, 20, s.world.W * TILE - 20);
    v.y = clamp(v.y + Math.sin(v.a) * FPV.diveSpeed * dt, 20, s.world.H * TILE - 20);
    v.ta = v.a;
    if (v.dive >= FPV.diveTime || diveContact(s, v)) {
      detonate(c, v);
      return false;
    }
    return true;
  }
  if (v.sink > 0) {
    v.sink += dt;
    if (v.sink > PLAYER.sinkTime) {
      loseVehicle(c, v.side, 'drowned');
      return false;
    }
    return true;
  }
  let ix = Number.isFinite(intent.move.x) ? intent.move.x : 0;
  let iy = Number.isFinite(intent.move.y) ? intent.move.y : 0;
  let m = Math.hypot(ix, iy);
  if (m > 1) {
    ix /= m;
    iy /= m;
    m = 1;
  }
  v.fuel -= dt;
  let sp = spec.speed;
  if (!v.fuelWarned && v.fuel < spec.fuel * PLAYER.fuelWarn) {
    v.fuelWarned = true;
    c.ev.push({ type: 'fuelLow', side: v.side });
  }
  if (v.fuel <= 0) {
    v.fuel = 0;
    if (spec.fly) {
      explode(c, v.x, v.y, 1.6, vehicleHeight(v));
      loseVehicle(c, v.side, 'fuel');
      return false;
    }
    sp *= PLAYER.noFuelSpeed;
  }
  v.wet = !spec.fly && tileAt(s.world, v.x, v.y) === Tile.Water;
  if (v.wet) sp *= PLAYER.waterSpeed;
  if (v.wet && v.type !== 'jeep') {
    v.sink = dt;
    c.ev.push({ type: 'sinking', side: v.side, vehicle: v.type });
    return true;
  }
  if (m > PLAYER.deadzone) {
    const d = adiff(Math.atan2(iy, ix), v.a);
    v.a += clamp(d, -spec.turn * dt, spec.turn * dt);
    const f = Math.max(0, Math.cos(d)) * m * sp * dt;
    const nx = v.x + Math.cos(v.a) * f;
    const ny = v.y + Math.sin(v.a) * f;
    if (spec.fly) {
      v.x = clamp(nx, 20, s.world.W * TILE - 20);
      v.y = clamp(ny, 20, s.world.H * TILE - 20);
    } else {
      const mv = moverFor(v);
      if (canStand(c, nx, v.y, spec.radius, mv)) v.x = nx;
      if (canStand(c, v.x, ny, spec.radius, mv)) v.y = ny;
    }
    v.steer = clamp(d * 1.5, -1, 1);
    v.throttle = m;
  } else {
    v.steer = 0;
    v.throttle = 0;
  }
  return true;
}
