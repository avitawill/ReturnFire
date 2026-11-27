import { describe, expect, it } from 'vitest';
import { createGame, idleIntent, step, DT, Tile, type GameState, type Intent, type SimEvent } from '../src/sim';
import { TILE, VEHICLES, type VehicleType } from '../src/sim/tuning';

const idle = (): [Intent, Intent] => [idleIntent(), idleIntent()];

function launch(s: GameState, type: VehicleType, side: 0 | 1 = 0) {
  const it = idle();
  it[side].select = type;
  step(s, it);
  const v = s.sides[side].vehicle!;
  expect(v.type).toBe(type);
  return v;
}

function run(s: GameState, seconds: number, intents: () => [Intent, Intent] = idle): SimEvent[] {
  const ev: SimEvent[] = [];
  for (let i = 0; i < seconds / DT && s.winner === -1; i++) ev.push(...step(s, intents()));
  return ev;
}

/** Finds a tile of the given type far from every structure. */
function findTile(s: GameState, t: number, nearX = 48): [number, number] {
  const { W, H, tiles } = s.world;
  let best: [number, number] = [0, 0];
  let bd = Infinity;
  for (let y = 2; y < H - 2; y++)
    for (let x = 2; x < W - 2; x++) {
      if (tiles[y * W + x] !== t) continue;
      const d = Math.abs(x - nearX) + Math.abs(y - H / 2) * 0.1;
      if (d < bd) {
        bd = d;
        best = [(x + 0.5) * TILE, (y + 0.5) * TILE];
      }
    }
  return best;
}

describe('rules', () => {
  it('a tank driven into the sea sinks and is lost; the jeep floats', () => {
    const s = createGame({ seed: 3 });
    const v = launch(s, 'tank');
    [v.x, v.y] = findTile(s, Tile.Water);
    const ev = run(s, 3);
    expect(ev.some((e) => e.type === 'vehicleLost' && e.cause === 'drowned')).toBe(true);
    expect(s.sides[0].stock.tank).toBe(2);

    const j = launch(s, 'jeep');
    [j.x, j.y] = findTile(s, Tile.Water);
    run(s, 3);
    expect(s.sides[0].vehicle?.id).toBe(j.id);
    expect(j.wet).toBe(true);
  });

  it('a helicopter that runs out of fuel crashes', () => {
    const s = createGame({ seed: 3 });
    const h = launch(s, 'heli');
    h.fuel = 0.5;
    const ev = run(s, 1);
    expect(ev.some((e) => e.type === 'vehicleLost' && e.cause === 'fuel')).toBe(true);
  });

  it('losing the last jeep loses the game', () => {
    const s = createGame({ seed: 3 });
    s.sides[0].stock.jeep = 1;
    const j = launch(s, 'jeep');
    j.hp = 1;
    // Park it next to an enemy patrol tank so something shoots it.
    const pt = s.units.find((u) => u.side === 1 && u.kind === 'ptank')!;
    j.x = pt.x + 60;
    j.y = pt.y;
    const ev = run(s, 20);
    expect(ev.some((e) => e.type === 'gameOver')).toBe(true);
    expect(s.winner).toBe(1);
    expect(s.endReason).toBe('noJeeps');
  });

  it('docking returns the vehicle to stock', () => {
    const s = createGame({ seed: 3 });
    const v = launch(s, 'jeep');
    expect(s.sides[0].stock.jeep).toBe(2);
    v.left = true;
    const ev = run(s, 0.1);
    expect(ev.some((e) => e.type === 'vehicleDocked')).toBe(true);
    expect(s.sides[0].vehicle).toBeNull();
    expect(s.sides[0].stock.jeep).toBe(3);
  });

  it('anti-air sites ignore ground vehicles and fire at helicopters', () => {
    const s = createGame({ seed: 3 });
    const aa = s.structs.find((t) => t.kind === 'aa' && t.side === 1)!;
    // Remove everything else that shoots so only the AA site can react.
    for (const t of s.structs) if (t !== aa && (t.kind === 'turret' || t.kind === 'guard')) t.alive = false;
    s.units = [];
    const tank = launch(s, 'tank');
    tank.x = aa.x + 100;
    tank.y = aa.y;
    tank.left = true;
    let ev = run(s, 4);
    expect(ev.filter((e) => e.type === 'shot' && e.side === 1).length).toBe(0);
    s.sides[0].vehicle = null;
    const heli = launch(s, 'heli');
    heli.x = aa.x + 100;
    heli.y = aa.y;
    heli.left = true;
    ev = run(s, 4);
    expect(ev.some((e) => e.type === 'shot' && e.side === 1 && e.weapon === 'aaRocket')).toBe(true);
  });

  it('heavy vehicles crush trees; the jeep is blocked by them', () => {
    const s = createGame({ seed: 3 });
    const [tx, ty] = findTile(s, Tile.Tree, 10);
    const tank = launch(s, 'tank');
    tank.x = tx - 40;
    tank.y = ty;
    tank.a = 0;
    tank.left = true;
    const ev = run(s, 1.5, () => {
      const it = idle();
      it[0].move = { x: 1, y: 0 };
      return it;
    });
    expect(ev.some((e) => e.type === 'treeCrushed')).toBe(true);
    expect(s.world.tiles[Math.floor(ty / TILE) * s.world.W + Math.floor(tx / TILE)]).toBe(Tile.Grass);
  });

  it('vehicle specs match the prototype V table', () => {
    expect(VEHICLES.heli).toMatchObject({ hp: 60, speed: 200, turn: 5, fuel: 70, ammo: 240, rate: 0.1 });
    expect(VEHICLES.tank).toMatchObject({ hp: 160, speed: 82, turn: 3.2, fuel: 200, ammo: 40, rate: 0.9 });
    expect(VEHICLES.launcher).toMatchObject({ hp: 200, speed: 62, turn: 2.6, fuel: 200, ammo: 20, mines: 5, rate: 1.5 });
    expect(VEHICLES.jeep).toMatchObject({ hp: 45, speed: 150, turn: 5.5, fuel: 150, ammo: 150, rate: 0.16 });
  });

  it('the map is point-symmetric', () => {
    const s = createGame({ seed: 9 });
    const { W, H, tiles } = s.world;
    for (let i = 0; i < W * H; i++) expect(tiles[i]).toBe(tiles[W * H - 1 - i]);
    expect(s.structs.filter((t) => t.side === 0).length).toBe(s.structs.filter((t) => t.side === 1).length);
    expect(s.structs.filter((t) => t.kind === 'tower' && t.side === 0)).toHaveLength(6);
  });
});

/** A start point 120-150 px from `t` from which the straight line to it crosses no other structure. */
function clearApproach(s: GameState, t: { id: number; x: number; y: number }) {
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2;
    for (const r of [120, 140]) {
      const sx = t.x - Math.cos(a) * r;
      const sy = t.y - Math.sin(a) * r;
      let ok = true;
      for (let d = 0; d < r - 20 && ok; d += 6) {
        const x = sx + Math.cos(a) * d;
        const y = sy + Math.sin(a) * d;
        const b = s.world.block[Math.floor(y / TILE) * s.world.W + Math.floor(x / TILE)];
        if (b && s.structs[b - 1].id !== t.id) ok = false;
        if (s.units.some((u) => Math.hypot(u.x - x, u.y - y) < 30)) ok = false;
      }
      if (ok) return { x: sx, y: sy, a };
    }
  }
  return null;
}

describe('FPV drone', () => {
  it('dives into a gun turret and destroys it, then is spent (no jeep rules, fast respawn)', () => {
    const s = createGame({ seed: 3 });
    const gun = s.structs.find((t) => t.kind === 'turret' && t.side === 1 && clearApproach(s, t))!;
    const p = clearApproach(s, gun)!;
    const d = launch(s, 'fpv');
    expect(d.ammo).toBe(1);
    Object.assign(d, { x: p.x, y: p.y, a: p.a, left: true });
    const fire = () => {
      const it = idle();
      it[0].fire = true;
      return it;
    };
    const ev = run(s, 1.2, fire);
    expect(ev.some((e) => e.type === 'shot' && e.weapon === 'dive')).toBe(true);
    expect(gun.alive).toBe(false);
    expect(ev.some((e) => e.type === 'vehicleLost' && e.cause === 'expended')).toBe(true);
    expect(s.sides[0].vehicle).toBeNull();
    expect(s.sides[0].stock.fpv).toBe(4);
    expect(s.sides[0].respawn).toBeLessThan(1);
  });

  it('takes three drones to bring down a tower', () => {
    const s = createGame({ seed: 3 });
    const tower = s.structs.find((t) => t.kind === 'tower' && t.side === 1 && clearApproach(s, t))!;
    for (let k = 0; k < 3; k++) {
      expect(tower.alive).toBe(true);
      s.sides[0].respawn = 0;
      const p = clearApproach(s, tower)!;
      const d = launch(s, 'fpv');
      Object.assign(d, { x: p.x, y: p.y, a: p.a, left: true });
      run(s, 1.2, () => {
        const it = idle();
        it[0].fire = true;
        return it;
      });
    }
    expect(tower.alive).toBe(false);
  });

  it('can be shot down by anti-air', () => {
    const s = createGame({ seed: 3 });
    const aa = s.structs.find((t) => t.kind === 'aa' && t.side === 1)!;
    const d = launch(s, 'fpv');
    d.x = aa.x + 150;
    d.y = aa.y;
    d.left = true;
    const ev = run(s, 6);
    expect(ev.some((e) => e.type === 'shot' && e.weapon === 'aaRocket')).toBe(true);
    expect(ev.some((e) => e.type === 'vehicleLost' && e.side === 0 && e.cause === 'destroyed')).toBe(true);
  });
});
