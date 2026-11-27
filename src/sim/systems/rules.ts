// Vehicle launch and docking, flag handling, and win/lose.

import { Tile, otherSide, type EndReason, type Intent, type Side, type Vehicle } from '../entities';
import type { Ctx } from '../events';
import { dist } from '../math';
import { DEFENCE, FLAG_CARRIERS, FPV, PLAYER, VEHICLES } from '../tuning';
import type { LossCause } from '../events';
import { tileAt } from '../world';

export function endGame(c: Ctx, winner: Side, reason: EndReason) {
  if (c.s.winner !== -1) return;
  c.s.winner = winner;
  c.s.endReason = reason;
  c.ev.push({ type: 'gameOver', winner, reason });
}

/** Launch a vehicle from the pad if the side has none in the field. */
export function trySpawn(c: Ctx, side: Side, intent: Intent) {
  const sd = c.s.sides[side];
  if (sd.vehicle || sd.respawn > 0 || !intent.select) return;
  const type = intent.select;
  if (sd.stock[type] < 1) return;
  sd.stock[type]--;
  const spec = VEHICLES[type];
  const v: Vehicle = {
    id: c.s.nextId++, side, type, x: sd.padX, y: sd.padY, a: sd.spawnA, ta: sd.spawnA,
    hp: spec.hp, fuel: spec.fuel, ammo: spec.ammo, mines: spec.mines, cool: 0,
    carrying: false, left: false, wet: false, sink: 0, fuelWarned: false, steer: 0, throttle: 0,
    prevSecondary: intent.secondary,
    dive: 0,
  };
  sd.vehicle = v;
  c.ev.push({ type: 'vehicleSpawned', side, vehicle: type, id: v.id });
}

/** Removes the side's vehicle from play (destroyed, drowned, crashed). */
export function loseVehicle(c: Ctx, side: Side, cause: LossCause) {
  const s = c.s;
  const sd = s.sides[side];
  const v = sd.vehicle;
  if (!v) return;
  v.hp = Math.min(v.hp, 0);
  sd.vehicle = null;
  sd.respawn = cause === 'drowned' ? PLAYER.respawnDelay * 0.5 : cause === 'expended' ? FPV.respawn : PLAYER.respawnDelay;
  sd.vehiclesLost++;
  c.ev.push({ type: 'vehicleLost', side, vehicle: v.type, cause, x: v.x, y: v.y, a: v.a, ta: v.ta });
  if (v.carrying) {
    const fl = s.flags[otherSide(side)];
    const atSea = tileAt(s.world, v.x, v.y) === Tile.Water;
    fl.state = 'ground';
    fl.carrier = -1;
    if (atSea) {
      fl.x = fl.hx;
      fl.y = fl.hy;
    } else {
      fl.x = v.x;
      fl.y = v.y;
    }
    c.ev.push({ type: 'flagDropped', side: fl.side, x: fl.x, y: fl.y, atSea });
  }
  if (v.type === 'jeep' && sd.stock.jeep < 1) endGame(c, otherSide(side), 'noJeeps');
}

/** Flag pickup, leaving the pad, docking. */
export function vehicleRules(c: Ctx, v: Vehicle) {
  const s = c.s;
  const sd = s.sides[v.side];
  const foe = otherSide(v.side);
  const fl = s.flags[foe];
  if (FLAG_CARRIERS.includes(v.type) && !v.carrying && fl.state === 'ground' && dist(fl.x, fl.y, v.x, v.y) < PLAYER.flagPickupDist) {
    v.carrying = true;
    fl.state = 'carried';
    fl.carrier = v.id;
    c.ev.push({ type: 'flagTaken', side: foe, by: v.side });
    const fsd = s.sides[foe];
    if (!fsd.alarm) {
      fsd.alarm = true;
      fsd.droneT = DEFENCE.drone.firstDelay;
    }
  }
  if (v.carrying) {
    fl.x = v.x;
    fl.y = v.y;
  }
  const d = dist(v.x, v.y, sd.padX, sd.padY);
  if (!v.left) {
    if (d > PLAYER.leaveDist) v.left = true;
  } else if (d < PLAYER.dockDist && v.sink === 0) dock(c, v);
}

function dock(c: Ctx, v: Vehicle) {
  const s = c.s;
  const sd = s.sides[v.side];
  sd.vehicle = null;
  sd.respawn = 0;
  c.ev.push({ type: 'vehicleDocked', side: v.side, vehicle: v.type });
  if (v.carrying) {
    const fl = s.flags[otherSide(v.side)];
    fl.state = 'captured';
    fl.carrier = -1;
    fl.x = sd.padX;
    fl.y = sd.padY;
    sd.stock[v.type]++;
    endGame(c, v.side, 'flagCaptured');
  } else sd.stock[v.type]++;
}
