// AI commander: plays one side under exactly the player's rules. It sees the
// same things a player sees (map, structures, both vehicles, revealed flags)
// and never reads which tower hides a flag. It only acts through Intents.
//
// Difficulty changes reaction time (intent latency) and aim, not rules.

import { idleIntent, otherSide, type GameState, type Intent, type Side, type Structure, type Vehicle } from '../entities';
import { adiff, clamp, dist } from '../math';
import { makeRng, rand, type RngHolder } from '../rng';
import { PLAYER, VEHICLES, type VehicleType } from '../tuning';
import { guardWater, newNav, steerTo, type NavMemory } from './nav';

export type Difficulty = 'easy' | 'medium' | 'hard';

export interface DifficultySpec {
  /** Intent latency in ticks (reaction time). */
  latency: number;
  /** Amplitude (radians) of the slowly wandering aim error for hull-mounted weapons. */
  aimError: number;
  /** Max heading error (radians) at which it pulls the trigger. */
  fireTol: number;
  /** Seconds between strategic re-evaluations. */
  think: number;
}

export const DIFFICULTY: Record<Difficulty, DifficultySpec> = {
  easy: { latency: 60, aimError: 0.6, fireTol: 0.55, think: 3 },
  medium: { latency: 18, aimError: 0.12, fireTol: 0.2, think: 0.6 },
  hard: { latency: 6, aimError: 0.03, fireTol: 0.12, think: 0.3 },
};

type Mode = 'attack' | 'clear' | 'grab' | 'carry' | 'defend' | 'home';

/** Weapon envelope per vehicle: where to hold when shooting a fixed target. */
const ENGAGE: Record<VehicleType, { hold: number; reach: number }> = {
  tank: { hold: 165, reach: 250 },
  launcher: { hold: 225, reach: 400 },
  heli: { hold: 160, reach: 245 },
  jeep: { hold: 125, reach: 180 },
};

export interface AiDebug {
  mode: Mode | 'idle';
  /** True while the AI is trying to move somewhere (used by the stuck test). */
  hasDestination: boolean;
  target: number;
}

export class AiCommander {
  readonly side: Side;
  readonly difficulty: Difficulty;
  private spec: DifficultySpec;
  private rng: RngHolder;
  private queue: Intent[] = [];
  private nav: NavMemory = newNav();
  private vid = -1;
  private mode: Mode = 'attack';
  private target = -1;
  private thinkT = 0;
  private aimErr = 0;
  private aimDrift = 0;
  private lastPos = { x: 0, y: 0, t: 0 };
  private unstickT = 0;
  private unstickDir = 1;
  /** Sorties against a target that ended in retreat. Makes the AI try another tower. */
  private failures = new Map<number, number>();
  debug: AiDebug = { mode: 'idle', hasDestination: false, target: -1 };

  constructor(side: Side, difficulty: Difficulty = 'medium', seed = 1) {
    this.side = side;
    this.difficulty = difficulty;
    this.spec = DIFFICULTY[difficulty];
    this.rng = makeRng((seed * 7919) ^ (side ? 0x51ed : 0x2a1f));
  }

  /** Intent for this tick. Decisions are made on the current state and delivered after the latency. */
  intent(s: GameState): Intent {
    const fresh = this.decide(s);
    this.queue.push(fresh);
    if (this.queue.length <= this.spec.latency) {
      // Selections and edge actions do not wait: a human clicks the bay immediately.
      const it = idleIntent();
      it.select = fresh.select;
      return it;
    }
    const out = this.queue.shift()!;
    // Reflexes act on the present, not on the delayed decision: never drive into the sea.
    const v = s.sides[this.side].vehicle;
    if (v) this.guardWater(s, v, out);
    return out;
  }

  // ---------------------------------------------------------------- knowledge

  private foeFlag(s: GameState) {
    const f = s.flags[otherSide(this.side)];
    // Hidden flags are unknown: never look at towerId or hasFlag.
    return f.state === 'hidden' ? null : f;
  }

  private ownFlag(s: GameState) {
    const f = s.flags[this.side];
    return f.state === 'hidden' ? null : f;
  }

  private enemyVehicle(s: GameState) {
    return s.sides[otherSide(this.side)].vehicle;
  }

  /** Our flag is in danger: carried, or exposed while an enemy jeep is out. */
  private mustDefend(s: GameState) {
    const own = this.ownFlag(s);
    if (!own || own.state === 'captured') return false;
    if (own.state === 'carried') return true;
    const ev = this.enemyVehicle(s);
    return !!ev && ev.type === 'jeep';
  }

  private threatNear(s: GameState, x: number, y: number, forHeli: boolean, r = 240): number {
    const foe = otherSide(this.side);
    let n = 0;
    for (const st of s.structs) {
      if (!st.alive || st.side !== foe) continue;
      if (st.kind === 'turret' && dist(st.x, st.y, x, y) < r) n++;
      if (forHeli && st.kind === 'aa' && dist(st.x, st.y, x, y) < r + 120) n += 1.5;
    }
    for (const u of s.units) if (u.side === foe && u.kind === 'ptank' && !forHeli && dist(u.x, u.y, x, y) < r + 60) n += 1.2;
    return n;
  }

  // ---------------------------------------------------------------- vehicle choice

  private choose(s: GameState): VehicleType | null {
    const st = s.sides[this.side].stock;
    const has = (t: VehicleType) => st[t] > 0;
    const pick = (...ts: VehicleType[]) => ts.find(has) ?? null;
    const flag = this.foeFlag(s);
    if (this.mustDefend(s)) return pick('heli', 'launcher', 'tank', 'jeep');
    if (flag && flag.state === 'ground') {
      if (this.threatNear(s, flag.x, flag.y, false, 230) >= 1 && (has('tank') || has('launcher') || has('heli'))) return pick('launcher', 'tank', 'heli');
      return pick('jeep');
    }
    // Searching: breach with armour; helicopters go for lightly defended towers.
    const keepJeep = st.jeep <= 1;
    const attackers: VehicleType[] = ['tank', 'launcher', 'heli'];
    const avail = attackers.filter(has);
    if (avail.length) {
      if (has('heli') && this.cheapestTower(s, true)?.threat === 0 && (!has('tank') || this.rngInt(3) === 0)) return 'heli';
      return avail[0];
    }
    return keepJeep ? (st.jeep > 0 ? 'jeep' : null) : 'jeep';
  }

  private rngInt(n: number) {
    return Math.floor(rand(this.rng) * n);
  }

  private cheapestTower(s: GameState, heli: boolean, from?: { x: number; y: number }) {
    const foe = otherSide(this.side);
    const origin = from ?? { x: s.sides[this.side].padX, y: s.sides[this.side].padY };
    let best: { st: Structure; cost: number; threat: number } | null = null;
    for (const st of s.structs) {
      if (st.kind !== 'tower' || st.side !== foe || !st.alive) continue;
      const threat = this.threatNear(s, st.x, st.y, heli);
      const cost = dist(origin.x, origin.y, st.x, st.y) + threat * 220 + (this.failures.get(st.id) ?? 0) * 300;
      if (!best || cost < best.cost) best = { st, cost, threat };
    }
    return best;
  }

  // ---------------------------------------------------------------- per tick

  private decide(s: GameState): Intent {
    const it = idleIntent();
    const sd = s.sides[this.side];
    const v = sd.vehicle;
    this.debug.hasDestination = false;
    if (s.winner !== -1) return it;
    if (!v) {
      this.debug.mode = 'idle';
      if (sd.respawn <= 0) it.select = this.choose(s);
      return it;
    }
    if (v.id !== this.vid) {
      this.vid = v.id;
      this.nav = newNav();
      this.target = -1;
      this.thinkT = 0;
      this.lastPos = { x: v.x, y: v.y, t: s.time };
      this.unstickT = 0;
    }
    // Slowly wandering aim error.
    this.aimDrift = clamp(this.aimDrift + (rand(this.rng) - 0.5) * 0.4, -1, 1);
    this.aimErr = this.aimDrift * this.spec.aimError;

    this.thinkT -= 1 / 60;
    if (this.thinkT <= 0) {
      this.thinkT = this.spec.think;
      const before = this.mode;
      const target = this.target;
      this.plan(s, v);
      // Retreating from a tower that still stands counts against it next time.
      if (before === 'attack' && this.mode === 'home' && target > 0 && s.structs[target - 1]?.alive)
        this.failures.set(target, (this.failures.get(target) ?? 0) + 1);
    }
    this.debug.mode = this.mode;
    this.debug.target = this.target;
    this.act(s, v, it);
    this.guardWater(s, v, it);
    this.watchdog(s, v, it);
    return it;
  }

  /** Strategic choice of mode and target. */
  private plan(s: GameState, v: Vehicle) {
    const sd = s.sides[this.side];
    const spec = VEHICLES[v.type];
    const flag = this.foeFlag(s);
    const home = dist(v.x, v.y, sd.padX, sd.padY);
    if (v.carrying) {
      this.mode = 'carry';
      return;
    }
    const fuelNeed = (home / (spec.speed * (spec.fly ? 1 : 0.8))) * 1.5 + 6;
    const lowFuel = v.fuel < fuelNeed && (spec.fly || v.fuel < spec.fuel * 0.15);
    if (v.hp < spec.hp * 0.3 || lowFuel || (v.ammo <= 0 && v.type !== 'jeep')) {
      this.mode = 'home';
      return;
    }
    if (this.mustDefend(s) && v.type !== 'jeep') {
      this.mode = 'defend';
      return;
    }
    if (v.type === 'jeep') {
      if (flag && flag.state === 'ground') this.mode = 'grab';
      else if (this.mustDefend(s)) this.mode = 'defend';
      else if (s.sides[this.side].stock.tank + s.sides[this.side].stock.launcher + s.sides[this.side].stock.heli > 0) this.mode = 'home';
      else this.mode = 'attack';
      if (this.mode === 'attack') this.pickTower(s, v);
      return;
    }
    if (flag && flag.state === 'ground') {
      // Clear the guns around the flag, then go home for a jeep.
      const g = this.nearestDefender(s, flag.x, flag.y, 240);
      const u = this.nearestPatrol(s, flag.x, flag.y, 290);
      if (g) {
        this.mode = 'clear';
        this.target = g.id;
      } else if (u) {
        this.mode = 'clear';
        this.target = u.id;
      } else this.mode = 'home';
      return;
    }
    this.mode = 'attack';
    const cur = this.target >= 0 ? s.structs[this.target - 1] : null;
    if (!cur || !cur.alive || cur.kind !== 'tower') this.pickTower(s, v);
  }

  private pickTower(s: GameState, v: Vehicle) {
    const best = this.cheapestTower(s, v.type === 'heli', v);
    this.target = best ? best.st.id : -1;
  }

  private nearestPatrol(s: GameState, x: number, y: number, r: number) {
    const foe = otherSide(this.side);
    let best = null;
    let bd = r;
    for (const u of s.units)
      if (u.side === foe && u.kind === 'ptank' && u.hp > 0) {
        const d = dist(u.x, u.y, x, y);
        if (d < bd) {
          bd = d;
          best = u;
        }
      }
    return best;
  }

  private nearestDefender(s: GameState, x: number, y: number, r: number): Structure | null {
    const foe = otherSide(this.side);
    let best: Structure | null = null;
    let bd = r;
    for (const st of s.structs) {
      if (!st.alive || st.side !== foe || st.kind !== 'turret') continue;
      const d = dist(st.x, st.y, x, y);
      if (d < bd) {
        bd = d;
        best = st;
      }
    }
    return best;
  }

  /** Tactical execution of the current mode. */
  private act(s: GameState, v: Vehicle, it: Intent) {
    const sd = s.sides[this.side];
    const goHome = () => {
      if (!v.left) {
        // Still on the pad: a vehicle has to drive off before it can dock again.
        it.move = this.travel(s, v, sd.padX + Math.cos(sd.spawnA) * 100, sd.padY + Math.sin(sd.spawnA) * 100, 10);
        return;
      }
      it.move = this.travel(s, v, sd.padX, sd.padY, 4);
      it.fire = this.opportunistic(s, v);
    };
    switch (this.mode) {
      case 'home':
      case 'carry':
        goHome();
        return;
      case 'grab': {
        const f = this.foeFlag(s);
        if (!f || f.state !== 'ground') return goHome();
        it.move = this.travel(s, v, f.x, f.y, 4);
        it.fire = this.opportunistic(s, v);
        return;
      }
      case 'defend': {
        const ev = this.enemyVehicle(s);
        const own = s.flags[this.side];
        if (!ev) {
          // Nobody to stop: wait by our exposed flag.
          it.move = this.travel(s, v, own.x, own.y, 90);
          it.fire = this.opportunistic(s, v);
          return;
        }
        this.engage(s, v, it, ev.x, ev.y, VEHICLES[ev.type].fly, true);
        if (v.type === 'launcher' && v.mines > 0 && own.state === 'ground' && dist(v.x, v.y, own.x, own.y) < 120) it.secondary = (s.tick & 31) === 0;
        return;
      }
      case 'clear':
      case 'attack': {
        const unit = this.mode === 'clear' ? s.units.find((u) => u.id === this.target) : undefined;
        if (unit) return this.engage(s, v, it, unit.x, unit.y, false, true);
        const t = this.target >= 0 && this.target <= s.structs.length ? s.structs[this.target - 1] : null;
        if (!t || !t.alive) {
          this.thinkT = 0;
          return goHome();
        }
        // Helicopters take out anti-air on the way; others let the guns sort themselves out.
        if (v.type === 'heli') {
          const aa = this.nearestOf(s, v, 'aa', 330);
          if (aa) return this.engage(s, v, it, aa.x, aa.y, false, false);
        }
        if (v.type === 'jeep' || v.type === 'heli') {
          const gun = this.nearestOf(s, v, 'turret', v.type === 'heli' ? 230 : 200);
          if (gun && gun !== t) return this.engage(s, v, it, gun.x, gun.y, false, false);
        }
        // Armour besieges: knock out each gun covering the target from just beyond its reach.
        if (v.type === 'tank' || v.type === 'launcher') {
          const gun = this.coveringGun(s, v, t.x, t.y);
          if (gun) {
            const hold = v.type === 'launcher' ? 330 : 226;
            const d = dist(v.x, v.y, gun.x, gun.y);
            if (d > hold) {
              it.move = this.travel(s, v, gun.x, gun.y, hold - 4);
              it.fire = this.opportunistic(s, v) || this.nav.blocker >= 0;
            } else {
              const a = Math.atan2(gun.y - v.y, gun.x - v.x);
              it.move = Math.abs(adiff(a, v.a)) > 0.4 ? { x: Math.cos(a), y: Math.sin(a) } : { x: 0, y: 0 };
              it.fire = true;
            }
            return;
          }
        }
        this.engage(s, v, it, t.x, t.y, false, false);
        return;
      }
    }
  }

  /** Enemy gun or AA site within 330 of (x, y), nearest to the vehicle. */
  private coveringGun(s: GameState, v: Vehicle, x: number, y: number): Structure | null {
    const foe = otherSide(this.side);
    let best: Structure | null = null;
    let bd = Infinity;
    for (const st of s.structs) {
      if (!st.alive || st.side !== foe || (st.kind !== 'turret' && st.kind !== 'aa') || dist(st.x, st.y, x, y) > 330) continue;
      const d = dist(st.x, st.y, v.x, v.y);
      if (d < bd) {
        bd = d;
        best = st;
      }
    }
    return best;
  }

  private nearestOf(s: GameState, v: Vehicle, kind: Structure['kind'], r: number): Structure | null {
    const foe = otherSide(this.side);
    let best: Structure | null = null;
    let bd = r;
    for (const st of s.structs) {
      if (!st.alive || st.side !== foe || st.kind !== kind) continue;
      const d = dist(st.x, st.y, v.x, v.y);
      if (d < bd) {
        bd = d;
        best = st;
      }
    }
    return best;
  }

  /**
   * Close to weapon range of (tx, ty), face it and fire. Hull weapons get the
   * difficulty's aim error; the tank turret and homing rockets aim themselves.
   */
  private engage(s: GameState, v: Vehicle, it: Intent, tx: number, ty: number, targetFlies: boolean, chase: boolean) {
    const env = ENGAGE[v.type];
    const d = dist(v.x, v.y, tx, ty);
    const canHit = !(targetFlies && v.type === 'tank');
    const want = Math.atan2(ty - v.y, tx - v.x) + this.aimErr;
    const err = Math.abs(adiff(want, v.a));
    if (d > env.hold || (chase && d > env.hold * 0.7)) {
      it.move = this.travel(s, v, tx, ty, chase ? 40 : env.hold * 0.9);
      it.fire = this.opportunistic(s, v) || (canHit && d < env.reach && err < this.spec.fireTol);
      if (this.nav.blocker >= 0) it.fire = true;
      return;
    }
    // In range: turn to face (creeping, so a tank can turn in place) and shoot.
    it.move = { x: Math.cos(want) * 0.17, y: Math.sin(want) * 0.17 };
    if (err > 0.5) it.move = { x: Math.cos(want), y: Math.sin(want) };
    const facing = err < this.spec.fireTol;
    it.fire = canHit && (facing || v.type === 'tank' || (v.type === 'launcher' && this.homingTarget(s, v)));
  }

  private homingTarget(s: GameState, v: Vehicle) {
    const foe = otherSide(this.side);
    const R = PLAYER.rocket.range;
    for (const st of s.structs) if (st.alive && st.side === foe && (st.kind === 'turret' || st.kind === 'aa') && dist(st.x, st.y, v.x, v.y) < R) return true;
    for (const u of s.units) if (u.side === foe && dist(u.x, u.y, v.x, v.y) < R) return true;
    const ev = this.enemyVehicle(s);
    return !!ev && dist(ev.x, ev.y, v.x, v.y) < R;
  }

  /** Fire at whatever the weapon can reach on the move. */
  private opportunistic(s: GameState, v: Vehicle): boolean {
    if (v.ammo <= 0) return false;
    if (v.type === 'tank') {
      const foe = otherSide(this.side);
      for (const st of s.structs) if (st.alive && st.side === foe && (st.kind === 'turret' || st.kind === 'aa') && dist(st.x, st.y, v.x, v.y) < PLAYER.tankAimRange) return true;
      for (const u of s.units) if (u.side === foe && u.kind === 'ptank' && dist(u.x, u.y, v.x, v.y) < PLAYER.tankAimRange) return true;
      const ev = this.enemyVehicle(s);
      return !!ev && !VEHICLES[ev.type].fly && dist(ev.x, ev.y, v.x, v.y) < PLAYER.tankAimRange;
    }
    if (v.type === 'launcher') return this.homingTarget(s, v) && this.rngInt(4) === 0;
    // Guns fire along the hull: only if something hostile is roughly ahead.
    const foe = otherSide(this.side);
    const reach = ENGAGE[v.type].reach;
    const ahead = (x: number, y: number) => {
      const d = dist(x, y, v.x, v.y);
      return d < reach && Math.abs(adiff(Math.atan2(y - v.y, x - v.x), v.a)) < this.spec.fireTol;
    };
    for (const u of s.units) if (u.side === foe && ahead(u.x, u.y)) return true;
    for (const st of s.structs) if (st.alive && st.side === foe && st.kind !== 'wall' && ahead(st.x, st.y)) return true;
    const ev = this.enemyVehicle(s);
    return !!ev && ahead(ev.x, ev.y);
  }

  /** Path-following move toward a point; records that we have a destination. */
  private travel(s: GameState, v: Vehicle, x: number, y: number, arrive: number) {
    const m = steerTo(s, v, this.nav, x, y, arrive);
    if (m.x !== 0 || m.y !== 0) this.debug.hasDestination = true;
    if (this.unstickT > 0) {
      this.unstickT -= 1 / 60;
      const a = v.a + this.unstickDir * 2.4;
      return { x: Math.cos(a), y: Math.sin(a) };
    }
    if (!VEHICLES[v.type].fly) {
      // Heavy vehicles turn nearly in place before driving off, so they hug the path.
      const d = Math.abs(adiff(Math.atan2(m.y, m.x), v.a));
      if (d > 0.7) return { x: m.x * 0.2, y: m.y * 0.2 };
    }
    return m;
  }

  /** Ground vehicles other than the jeep never drive into the sea. */
  private guardWater(s: GameState, v: Vehicle, it: Intent) {
    guardWater(s, v, it);
  }

  /** Detects lack of progress and turns away to break free, then replans. */
  private watchdog(s: GameState, v: Vehicle, it: Intent) {
    if (VEHICLES[v.type].fly) return;
    const moving = Math.hypot(it.move.x, it.move.y) > 0.5 && this.debug.hasDestination;
    const moved = dist(v.x, v.y, this.lastPos.x, this.lastPos.y);
    if (!moving || moved > 10) {
      this.lastPos = { x: v.x, y: v.y, t: s.time };
      return;
    }
    if (s.time - this.lastPos.t > 1.6 && this.nav.blocker < 0) {
      this.unstickT = 0.7;
      this.unstickDir = this.rngInt(2) ? 1 : -1;
      this.nav.at = -1e9;
      this.lastPos = { x: v.x, y: v.y, t: s.time };
    }
  }
}

