// Autonomous defenders: patrol tanks guard their island, drones hunt flag thieves.

import { otherSide, type Unit } from '../entities';
import type { Ctx } from '../events';
import { adiff, clamp, dist, turnToward } from '../math';
import { rand } from '../rng';
import { DEFENCE, HEIGHT } from '../tuning';
import { isFlying, shoot, targetHeight } from './combat';
import { canStand } from './movement';

const G = HEIGHT.ground;
const FH = HEIGHT.fly;

export function updateUnits(c: Ctx) {
  const s = c.s;
  for (const u of s.units) {
    if (u.hp <= 0) continue;
    if (u.kind === 'ptank') patrolTank(c, u);
    else drone(c, u);
  }
  const dead = s.units.filter((u) => u.hp <= 0);
  if (dead.length) {
    for (const u of dead) c.ev.push({ type: 'unitDestroyed', id: u.id, kind: u.kind, side: u.side, x: u.x, y: u.y, a: u.a, ta: u.ta });
    s.units = s.units.filter((u) => u.hp > 0);
  }
}

function patrolTank(c: Ctx, e: Unit) {
  const s = c.s;
  const dt = c.dt;
  const P = DEFENCE.patrolTank;
  const v = s.sides[otherSide(e.side)].vehicle;
  const d = v ? dist(v.x, v.y, e.x, e.y) : Infinity;
  const far = dist(e.x, e.y, e.hx, e.hy) > P.leash;
  const see = !!v && v.sink === 0 && !isFlying(v) && d < P.sight && !far;
  let gx: number;
  let gy: number;
  if (see && v) {
    gx = v.x;
    gy = v.y;
    const df = adiff(Math.atan2(v.y - e.y, v.x - e.x), e.ta);
    e.ta += clamp(df, -P.turretTurn * dt, P.turretTurn * dt);
    e.cool -= dt;
    if (d < P.range && e.cool <= 0 && Math.abs(df) < P.aimTol) {
      e.cool = P.rate;
      const ca = Math.cos(e.ta);
      const sa = Math.sin(e.ta);
      shoot(c, {
        side: e.side, kind: 'shell', x: e.x + ca * P.muzzle, y: e.y + sa * P.muzzle, h0: G + 14, h1: G + 14,
        vx: ca * P.shellSpeed, vy: sa * P.shellSpeed, a: e.ta, sp: P.shellSpeed, turn: 0, target: -1,
        life: P.life, dmg: P.dmg, air: false, big: 0.5, byVehicle: false,
      });
      c.ev.push({ type: 'shot', side: e.side, weapon: 'shell', x: e.x + ca * 24, y: e.y + sa * 24, h: G + 15, a: e.ta, byVehicle: false });
    }
  } else {
    e.ta = turnToward(e.ta, e.a, P.idleTurretTurn * dt);
    e.wt -= dt;
    if (e.wt <= 0 || dist(e.wx, e.wy, e.x, e.y) < 20) {
      e.wt = P.wanderMin + rand(s) * P.wanderVar;
      e.wx = e.hx + (rand(s) - 0.5) * P.wanderBox;
      e.wy = e.hy + (rand(s) - 0.5) * P.wanderBox;
    }
    gx = e.wx;
    gy = e.wy;
  }
  if (!(see && d < P.holdDist)) {
    const df = adiff(Math.atan2(gy - e.y, gx - e.x), e.a);
    e.a += clamp(df, -P.turn * dt, P.turn * dt);
    const f = Math.max(0, Math.cos(df)) * P.speed * dt;
    const nx = e.x + Math.cos(e.a) * f;
    const ny = e.y + Math.sin(e.a) * f;
    let moved = false;
    if (canStand(c, nx, e.y, P.radius, 'ptank')) {
      e.x = nx;
      moved = true;
    }
    if (canStand(c, e.x, ny, P.radius, 'ptank')) {
      e.y = ny;
      moved = true;
    }
    if (!moved && !see) e.wt = 0;
  }
}

function drone(c: Ctx, e: Unit) {
  const s = c.s;
  const dt = c.dt;
  const D = DEFENCE.drone;
  const v = s.sides[otherSide(e.side)].vehicle;
  if (v && v.sink === 0) {
    const d = dist(v.x, v.y, e.x, e.y);
    const df = adiff(Math.atan2(v.y - e.y, v.x - e.x), e.a);
    e.a += clamp(df, -D.turn * dt, D.turn * dt);
    if (d > D.holdDist) {
      e.x += Math.cos(e.a) * D.speed * dt;
      e.y += Math.sin(e.a) * D.speed * dt;
    }
    e.cool -= dt;
    if (d < D.range && e.cool <= 0 && Math.abs(df) < D.aimTol) {
      e.cool = D.rate;
      shoot(c, {
        side: e.side, kind: 'bullet', x: e.x, y: e.y, h0: G + FH - 4, h1: targetHeight({ k: 'vehicle', e: v }),
        vx: Math.cos(e.a) * D.bulletSpeed, vy: Math.sin(e.a) * D.bulletSpeed, a: e.a, sp: D.bulletSpeed, turn: 0,
        target: -1, life: D.life, dmg: D.dmg, air: true, big: 0, byVehicle: false,
      });
      c.ev.push({ type: 'shot', side: e.side, weapon: 'gun', x: e.x, y: e.y, h: G + FH - 4, a: e.a, byVehicle: false });
    }
  } else {
    e.a += dt;
    e.x += Math.cos(e.a) * D.idleSpeed * dt;
    e.y += Math.sin(e.a) * D.idleSpeed * dt;
  }
  e.ta = e.a;
}
