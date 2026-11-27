// Read-only aim prediction for the HUD reticle: where a drone's dive would
// end, or where the helicopter's guns would hit. Uses the same contact rules
// as the real thing (diveContact, projectile hits) so the reticle never lies.

import { otherSide, type GameState, type Vehicle } from '../entities';
import { dist } from '../math';
import { FPV, PLAYER, PROJECTILE, VEHICLES } from '../tuning';
import { structAt } from '../world';

export interface AimPoint {
  x: number;
  y: number;
  /** Something hostile is in the way (the shot or dive would hit it). */
  locked: boolean;
  /** Path from the vehicle to the point, for drawing a guide line. */
  fromX: number;
  fromY: number;
}

const STEP = 6;

/** Reticle for vehicles that aim with their nose: the drone and the helicopter. */
export function aimPoint(s: GameState, v: Vehicle): AimPoint | null {
  if (v.type === 'fpv') return fpvAim(s, v);
  if (v.type === 'heli') return gunAim(s, v);
  return null;
}

function fpvAim(s: GameState, v: Vehicle): AimPoint {
  const foe = otherSide(v.side);
  // Distance the dive still covers (all of it, if it has not started yet).
  const left = FPV.diveSpeed * Math.max(0, FPV.diveTime - v.dive);
  const ca = Math.cos(v.a);
  const sa = Math.sin(v.a);
  const ev = s.sides[foe].vehicle;
  for (let d = 0; d <= left; d += STEP) {
    const x = v.x + ca * d;
    const y = v.y + sa * d;
    const st = structAt(s, x, y);
    if (st && st.alive && st.side === foe) return { x, y, locked: true, fromX: v.x, fromY: v.y };
    for (const u of s.units) if (u.side === foe && u.hp > 0 && dist(u.x, u.y, x, y) < 18) return { x, y, locked: true, fromX: v.x, fromY: v.y };
    if (ev && ev.sink === 0 && dist(ev.x, ev.y, x, y) < VEHICLES[ev.type].radius + 10) return { x, y, locked: true, fromX: v.x, fromY: v.y };
  }
  return { x: v.x + ca * left, y: v.y + sa * left, locked: false, fromX: v.x, fromY: v.y };
}

function gunAim(s: GameState, v: Vehicle): AimPoint {
  const foe = otherSide(v.side);
  const g = PLAYER.heliGun;
  const range = g.speed * g.life;
  const ca = Math.cos(v.a);
  const sa = Math.sin(v.a);
  const ev = s.sides[foe].vehicle;
  const x0 = v.x + ca * g.muzzle;
  const y0 = v.y + sa * g.muzzle;
  for (let d = 0; d <= range; d += STEP) {
    const x = x0 + ca * d;
    const y = y0 + sa * d;
    for (const u of s.units)
      if (u.side === foe && u.hp > 0 && dist(u.x, u.y, x, y) < PROJECTILE.hitRadius) return { x, y, locked: true, fromX: v.x, fromY: v.y };
    if (ev && ev.sink === 0 && dist(ev.x, ev.y, x, y) < VEHICLES[ev.type].radius + 4)
      return { x, y, locked: true, fromX: v.x, fromY: v.y };
    const st = structAt(s, x, y);
    if (st && st.alive && st.side === foe) return { x, y, locked: true, fromX: v.x, fromY: v.y };
  }
  return { x: x0 + ca * range, y: y0 + sa * range, locked: false, fromX: v.x, fromY: v.y };
}
