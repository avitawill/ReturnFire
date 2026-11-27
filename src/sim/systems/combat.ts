// Targeting, damage, defensive structures and projectiles.

import { Tile, otherSide, type GameState, type Projectile, type Side, type Structure, type Unit, type Vehicle } from '../entities';
import type { Ctx } from '../events';
import { adiff, clamp, dist, turnToward } from '../math';
import { rand } from '../rng';
import { DEFENCE, FPV, HEIGHT, PLAYER, PROJECTILE, TILE, VEHICLES } from '../tuning';
import { structAt, tileAt } from '../world';
import { loseVehicle } from './rules';

const G = HEIGHT.ground;
const FH = HEIGHT.fly;

/** Anything that can be shot at. */
export type Target =
  | { k: 'vehicle'; e: Vehicle }
  | { k: 'unit'; e: Unit }
  | { k: 'struct'; e: Structure };

export const isFlying = (v: Vehicle) => VEHICLES[v.type].fly;
export const vehicleHeight = (v: Vehicle) => {
  const spec = VEHICLES[v.type];
  if (!spec.fly) return G + 10;
  // A diving drone drops from cruising height to the ground.
  const k = v.dive > 0 ? Math.max(0, 1 - v.dive / FPV.diveTime) : 1;
  return G + spec.alt * k;
};

export function findEntity(s: GameState, id: number): Target | null {
  for (const sd of s.sides) if (sd.vehicle && sd.vehicle.id === id) return { k: 'vehicle', e: sd.vehicle };
  for (const u of s.units) if (u.id === id) return u.hp > 0 ? { k: 'unit', e: u } : null;
  const st = s.structs[id - 1];
  if (st && st.id === id) return st.alive ? { k: 'struct', e: st } : null;
  return null;
}

/**
 * Nearest hostile thing a vehicle's weapon should aim at: enemy vehicles and
 * units (air ones only if `air`), and enemy gun/AA sites.
 */
export function nearestTarget(s: GameState, side: Side, x: number, y: number, range: number, air: boolean): Target | null {
  let best: Target | null = null;
  let bd = range;
  const foe = otherSide(side);
  const fv = s.sides[foe].vehicle;
  if (fv && fv.sink === 0 && (air || !isFlying(fv))) {
    const d = dist(fv.x, fv.y, x, y);
    if (d < bd) {
      bd = d;
      best = { k: 'vehicle', e: fv };
    }
  }
  for (const u of s.units) {
    if (u.side !== foe || u.hp <= 0 || (u.kind === 'drone' && !air)) continue;
    const d = dist(u.x, u.y, x, y);
    if (d < bd) {
      bd = d;
      best = { k: 'unit', e: u };
    }
  }
  for (const st of s.structs) {
    if (st.side !== foe || !st.alive || (st.kind !== 'turret' && st.kind !== 'aa')) continue;
    const d = dist(st.x, st.y, x, y);
    if (d < bd) {
      bd = d;
      best = { k: 'struct', e: st };
    }
  }
  return best;
}

export function targetHeight(t: Target): number {
  if (t.k === 'vehicle') return vehicleHeight(t.e);
  if (t.k === 'unit') return t.e.kind === 'drone' ? G + FH : G + 12;
  return G + 12;
}

export function explode(c: Ctx, x: number, y: number, size: number, h: number, quiet = false) {
  c.ev.push({ type: 'explosion', x, y, h, size, quiet });
}

export function shoot(c: Ctx, p: Omit<Projectile, 'id' | 'h'> & { h0: number }) {
  const { h0, ...rest } = p;
  c.s.projectiles.push({ ...rest, id: c.s.nextId++, h: h0 });
}

// ---------------------------------------------------------------- damage

export function damageStruct(c: Ctx, st: Structure, d: number) {
  if (!st.alive || st.indestructible) return;
  st.hp -= d;
  if (st.hp > 0) {
    c.ev.push({ type: 'structureDamaged', id: st.id, hp: st.hp, max: st.max });
    return;
  }
  st.alive = false;
  st.hp = 0;
  const w = c.s.world;
  for (let y = st.ty; y < st.ty + st.h; y++)
    for (let x = st.tx; x < st.tx + st.w; x++) {
      w.block[y * w.W + x] = 0;
      w.tiles[y * w.W + x] = Tile.Rubble;
    }
  c.ev.push({ type: 'structureDestroyed', id: st.id, kind: st.kind, side: st.side, x: st.x, y: st.y });
  explode(c, st.x, st.y, st.kind === 'tower' ? 1.8 : 1, G + 14);
  if (st.kind === 'tower') {
    const sd = c.s.sides[st.side];
    sd.towersLeft--;
    const fl = c.s.flags[st.side];
    if (st.hasFlag) {
      fl.state = 'ground';
      fl.x = st.x;
      fl.y = st.y;
      c.ev.push({ type: 'flagRevealed', side: st.side, x: st.x, y: st.y });
    } else if (fl.state === 'hidden') {
      c.ev.push({ type: 'towerEmpty', side: st.side, towersLeft: sd.towersLeft });
    }
  }
}

export function damageUnit(c: Ctx, u: Unit, d: number) {
  if (u.hp <= 0) return;
  u.hp -= d;
  if (u.hp <= 0) explode(c, u.x, u.y, 1.1, u.kind === 'drone' ? G + FH : G + 6);
}

export function damageVehicle(c: Ctx, v: Vehicle, d: number) {
  if (v.hp <= 0) return;
  v.hp -= d;
  c.ev.push({ type: 'vehicleHit', side: v.side, hp: v.hp });
  if (v.hp > 0) return;
  explode(c, v.x, v.y, 1.6, vehicleHeight(v));
  loseVehicle(c, v.side, 'destroyed');
}

function damageTarget(c: Ctx, t: Target, d: number) {
  if (t.k === 'vehicle') damageVehicle(c, t.e, d);
  else if (t.k === 'unit') damageUnit(c, t.e, d);
  else damageStruct(c, t.e, d);
}

// ---------------------------------------------------------------- vehicle weapons

export function vehicleWeapons(c: Ctx, v: Vehicle, fire: boolean, secondary: boolean) {
  const s = c.s;
  const dt = c.dt;
  if (v.type === 'tank') {
    const tg = nearestTarget(s, v.side, v.x, v.y, PLAYER.tankAimRange, false);
    const want = tg ? Math.atan2(tg.e.y - v.y, tg.e.x - v.x) : v.a;
    v.ta = turnToward(v.ta, want, PLAYER.tankTurretTurn * dt);
  } else v.ta = v.a;
  v.cool -= dt;
  if (v.type === 'fpv') {
    // The drone's only weapon is itself.
    if (fire && v.dive === 0 && v.ammo > 0) {
      v.ammo--;
      v.dive = 1e-6;
      c.ev.push({ type: 'shot', side: v.side, weapon: 'dive', x: v.x, y: v.y, h: vehicleHeight(v), a: v.a, byVehicle: true });
    }
    v.prevSecondary = secondary;
    return;
  }
  if (fire && v.cool <= 0 && v.ammo > 0) {
    v.cool = VEHICLES[v.type].rate;
    v.ammo--;
    const ca = Math.cos(v.ta);
    const sa = Math.sin(v.ta);
    if (v.type === 'heli' || v.type === 'jeep') {
      const heli = v.type === 'heli';
      const g = heli ? PLAYER.heliGun : PLAYER.jeepGun;
      const a = v.a + (rand(s) - 0.5) * g.spread;
      const h0 = heli ? G + FH - 4 : G + 10;
      shoot(c, {
        side: v.side, kind: 'bullet', x: v.x + ca * g.muzzle, y: v.y + sa * g.muzzle, h0, h1: G + 8,
        vx: Math.cos(a) * g.speed, vy: Math.sin(a) * g.speed, a, sp: g.speed, turn: 0, target: -1,
        life: g.life, dmg: g.dmg, air: true, big: 0, byVehicle: true,
      });
      c.ev.push({ type: 'shot', side: v.side, weapon: 'gun', x: v.x, y: v.y, h: h0, a, byVehicle: true });
    } else if (v.type === 'tank') {
      const g = PLAYER.tankShell;
      shoot(c, {
        side: v.side, kind: 'shell', x: v.x + ca * g.muzzle, y: v.y + sa * g.muzzle, h0: G + 14, h1: G + 14,
        vx: ca * g.speed, vy: sa * g.speed, a: v.ta, sp: g.speed, turn: 0, target: -1,
        life: g.life, dmg: g.dmg, air: false, big: 0.6, byVehicle: true,
      });
      c.ev.push({ type: 'shot', side: v.side, weapon: 'shell', x: v.x + ca * (g.muzzle + 4), y: v.y + sa * (g.muzzle + 4), h: G + 15, a: v.ta, byVehicle: true });
    } else {
      const g = PLAYER.rocket;
      const tg = nearestTarget(s, v.side, v.x, v.y, g.range, true);
      shoot(c, {
        side: v.side, kind: 'rocket', x: v.x + ca * g.muzzle, y: v.y + sa * g.muzzle, h0: G + 20,
        h1: tg ? targetHeight(tg) : G + 12, vx: 0, vy: 0, a: v.a, sp: g.speed, turn: g.turn,
        target: tg ? tg.e.id : -1, life: g.life, dmg: g.dmg, air: true, big: 0.9, byVehicle: true,
      });
      c.ev.push({ type: 'shot', side: v.side, weapon: 'rocket', x: v.x, y: v.y, h: G + 20, a: v.a, byVehicle: true });
    }
  }
  if (secondary && !v.prevSecondary && v.type === 'launcher' && v.mines > 0) {
    v.mines--;
    const m = { id: s.nextId++, side: v.side, x: v.x - Math.cos(v.a) * PLAYER.mine.dropBehind, y: v.y - Math.sin(v.a) * PLAYER.mine.dropBehind };
    s.mines.push(m);
    c.ev.push({ type: 'mineLaid', side: v.side, id: m.id, x: m.x, y: m.y });
  }
  v.prevSecondary = secondary;
}

// ---------------------------------------------------------------- defences

/** Nearest hostile commander vehicle (optionally flying-only / ground-only) in range. */
function hostileVehicleInRange(s: GameState, side: Side, x: number, y: number, range: number, filter: 'any' | 'air' | 'ground') {
  const v = s.sides[otherSide(side)].vehicle;
  if (!v || v.sink > 0) return null;
  const fly = isFlying(v);
  if ((filter === 'air' && !fly) || (filter === 'ground' && fly)) return null;
  const d = dist(v.x, v.y, x, y);
  return d <= range ? { v, d } : null;
}

export function updateStructures(c: Ctx) {
  const s = c.s;
  const dt = c.dt;
  for (const st of s.structs) {
    if (!st.alive) continue;
    if (st.kind === 'guard') updateGuard(c, st);
    else if (st.kind === 'turret') {
      const T = DEFENCE.turret;
      let tg: Target | null = null;
      let bd: number = T.range;
      const hv = hostileVehicleInRange(s, st.side, st.x, st.y, T.range, 'any');
      if (hv) {
        tg = { k: 'vehicle', e: hv.v };
        bd = hv.d;
      }
      for (const u of s.units)
        if (u.side !== st.side && u.kind === 'drone' && u.hp > 0) {
          const d = dist(u.x, u.y, st.x, st.y);
          if (d < bd) {
            bd = d;
            tg = { k: 'unit', e: u };
          }
        }
      if (!tg) continue;
      const ta = Math.atan2(tg.e.y - st.y, tg.e.x - st.x);
      const df = adiff(ta, st.a);
      st.a += clamp(df, -T.turn * dt, T.turn * dt);
      st.cool -= dt;
      if (st.cool <= 0 && Math.abs(df) < T.aimTol) {
        st.cool = T.rate;
        shoot(c, {
          side: st.side, kind: 'bullet', x: st.x + Math.cos(st.a) * T.muzzle, y: st.y + Math.sin(st.a) * T.muzzle,
          h0: G + 16, h1: targetHeight(tg), vx: Math.cos(st.a) * T.speed, vy: Math.sin(st.a) * T.speed, a: st.a,
          sp: T.speed, turn: 0, target: -1, life: T.life, dmg: T.dmg, air: true, big: 0, byVehicle: false,
        });
        c.ev.push({ type: 'shot', side: st.side, weapon: 'gun', x: st.x, y: st.y, h: G + 16, a: st.a, byVehicle: false });
      }
    } else if (st.kind === 'aa') {
      const A = DEFENCE.aa;
      const hv = hostileVehicleInRange(s, st.side, st.x, st.y, A.range, 'air');
      if (!hv) continue;
      const ta = Math.atan2(hv.v.y - st.y, hv.v.x - st.x);
      st.a = turnToward(st.a, ta, A.turn * dt);
      st.cool -= dt;
      if (st.cool <= 0) {
        st.cool = A.rate;
        shoot(c, {
          side: st.side, kind: 'rocket', x: st.x, y: st.y, h0: G + 18, h1: G + FH, vx: 0, vy: 0, a: st.a,
          sp: A.speed, turn: A.rocketTurn, target: hv.v.id, life: A.life, dmg: A.dmg, air: true, big: 0.6, byVehicle: false,
        });
        c.ev.push({ type: 'shot', side: st.side, weapon: 'aaRocket', x: st.x, y: st.y, h: G + 18, a: st.a, byVehicle: false });
      }
    }
  }
}

/** Bunker guard: indestructible, shoots any hostile vehicle or unit in range. */
function updateGuard(c: Ctx, st: Structure) {
  const s = c.s;
  const dt = c.dt;
  const T = DEFENCE.guard;
  let tg: Target | null = null;
  let bd: number = T.range;
  const hv = hostileVehicleInRange(s, st.side, st.x, st.y, T.range, 'any');
  if (hv) {
    tg = { k: 'vehicle', e: hv.v };
    bd = hv.d;
  }
  for (const u of s.units) {
    if (u.side === st.side || u.hp <= 0) continue;
    const d = dist(u.x, u.y, st.x, st.y);
    if (d < bd) {
      bd = d;
      tg = { k: 'unit', e: u };
    }
  }
  if (!tg) return;
  const df = adiff(Math.atan2(tg.e.y - st.y, tg.e.x - st.x), st.a);
  st.a += clamp(df, -T.turn * dt, T.turn * dt);
  st.cool -= dt;
  if (st.cool <= 0 && Math.abs(df) < T.aimTol) {
    st.cool = T.rate;
    shoot(c, {
      side: st.side, kind: 'bullet', x: st.x + Math.cos(st.a) * T.muzzle, y: st.y + Math.sin(st.a) * T.muzzle,
      h0: G + 16, h1: targetHeight(tg), vx: Math.cos(st.a) * T.speed, vy: Math.sin(st.a) * T.speed, a: st.a,
      sp: T.speed, turn: 0, target: -1, life: T.life, dmg: T.dmg, air: true, big: 0, byVehicle: false,
    });
    c.ev.push({ type: 'shot', side: st.side, weapon: 'gun', x: st.x, y: st.y, h: G + 16, a: st.a, byVehicle: false });
  }
}

// ---------------------------------------------------------------- projectiles

export function updateProjectiles(c: Ctx) {
  const s = c.s;
  const dt = c.dt;
  const Wpx = s.world.W * TILE;
  const Hpx = s.world.H * TILE;
  const keep: Projectile[] = [];
  for (const b of s.projectiles) {
    if (b.target >= 0 || b.turn > 0) {
      const t = b.target >= 0 ? findEntity(s, b.target) : null;
      if (t) b.a = turnToward(b.a, Math.atan2(t.e.y - b.y, t.e.x - b.x), b.turn * dt);
      b.vx = Math.cos(b.a) * b.sp;
      b.vy = Math.sin(b.a) * b.sp;
    }
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.h += clamp(b.h1 - b.h, -PROJECTILE.climb * dt, PROJECTILE.climb * dt);
    b.life -= dt;
    let hit = false;
    const foe = otherSide(b.side);
    for (const u of s.units) {
      if (u.side !== foe || u.hp <= 0 || (u.kind === 'drone' && !b.air)) continue;
      if (dist(u.x, u.y, b.x, b.y) < PROJECTILE.hitRadius) {
        damageUnit(c, u, b.dmg);
        hit = true;
        break;
      }
    }
    if (!hit) {
      const v = s.sides[foe].vehicle;
      if (v && v.sink === 0 && (b.air || !isFlying(v)) && dist(v.x, v.y, b.x, b.y) < VEHICLES[v.type].radius + 4) {
        damageVehicle(c, v, b.dmg);
        hit = true;
      }
    }
    if (!hit && b.byVehicle) {
      const st = structAt(s, b.x, b.y);
      if (st && st.alive && st.side === foe) {
        damageStruct(c, st, b.dmg);
        hit = true;
      }
    }
    const out = b.x < 0 || b.y < 0 || b.x > Wpx || b.y > Hpx;
    if (hit || b.life <= 0 || out) {
      if (hit || b.big) explode(c, b.x, b.y, hit ? b.big || 0.3 : 0.3, b.h, !hit && !b.big);
      continue;
    }
    keep.push(b);
  }
  s.projectiles = keep;
}

/** Mines go off under hostile ground vehicles and patrol tanks. */
export function updateMines(c: Ctx) {
  const s = c.s;
  if (!s.mines.length) return;
  const R = PLAYER.mine.triggerDist;
  s.mines = s.mines.filter((m) => {
    const foe = otherSide(m.side);
    let victim: Target | null = null;
    const v = s.sides[foe].vehicle;
    if (v && !isFlying(v) && v.sink === 0 && dist(v.x, v.y, m.x, m.y) < R) victim = { k: 'vehicle', e: v };
    if (!victim)
      for (const u of s.units)
        if (u.side === foe && u.kind === 'ptank' && u.hp > 0 && dist(u.x, u.y, m.x, m.y) < R) {
          victim = { k: 'unit', e: u };
          break;
        }
    if (!victim) return true;
    c.ev.push({ type: 'mineTriggered', id: m.id, x: m.x, y: m.y });
    explode(c, m.x, m.y, 1.2, G);
    damageTarget(c, victim, PLAYER.mine.dmg);
    return false;
  });
}

export const onWater = (s: GameState, x: number, y: number) => tileAt(s.world, x, y) === Tile.Water;

/** Detonates a diving drone: heavy damage to everything hostile in the blast, then the drone is spent. */
export function detonate(c: Ctx, v: Vehicle) {
  const s = c.s;
  const foe = otherSide(v.side);
  const R = FPV.blast;
  for (const st of s.structs) {
    if (!st.alive || st.side !== foe) continue;
    // Distance from the blast to the nearest point of the structure's footprint.
    const x0 = st.tx * TILE;
    const y0 = st.ty * TILE;
    const nx = Math.max(x0, Math.min(v.x, x0 + st.w * TILE));
    const ny = Math.max(y0, Math.min(v.y, y0 + st.h * TILE));
    if (dist(nx, ny, v.x, v.y) < R * 0.6) damageStruct(c, st, FPV.dmg);
  }
  for (const u of s.units) if (u.side === foe && u.hp > 0 && dist(u.x, u.y, v.x, v.y) < R) damageUnit(c, u, FPV.dmg);
  const ev = s.sides[foe].vehicle;
  if (ev && ev.sink === 0 && dist(ev.x, ev.y, v.x, v.y) < R + VEHICLES[ev.type].radius) damageVehicle(c, ev, FPV.dmg);
  explode(c, v.x, v.y, 1.5, vehicleHeight(v));
  loseVehicle(c, v.side, 'expended');
}

/** True if the diving drone has flown into something hostile. */
export function diveContact(s: GameState, v: Vehicle): boolean {
  const foe = otherSide(v.side);
  const st = structAt(s, v.x, v.y);
  if (st && st.alive && st.side === foe) return true;
  for (const u of s.units) if (u.side === foe && u.hp > 0 && dist(u.x, u.y, v.x, v.y) < 18) return true;
  const ev = s.sides[foe].vehicle;
  return !!ev && ev.sink === 0 && dist(ev.x, ev.y, v.x, v.y) < VEHICLES[ev.type].radius + 10;
}
