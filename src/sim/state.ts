import type { Flag, GameState, Side, SideState, Unit } from './entities';
import { MAPS, type MapDef } from './maps';
import { makeRng, rand } from './rng';
import { DEFENCE, STOCK, TILE } from './tuning';
import { generateWorld } from './world';

export interface GameOptions {
  seed: number;
  map?: string | MapDef;
}

export function createGame(opts: GameOptions): GameState {
  const def = typeof opts.map === 'object' ? opts.map : MAPS[opts.map ?? 'twoShores'];
  if (!def) throw new Error(`unknown map ${String(opts.map)}`);
  const seed = opts.seed >>> 0;
  const gen = generateWorld(def, seed);
  const r = makeRng(seed ^ 0x9e3779b9);

  const s: GameState = {
    seed,
    mapName: def.name,
    tick: 0,
    time: 0,
    rng: 0,
    nextId: gen.structs.length + 1,
    world: gen.world,
    structs: gen.structs,
    units: [],
    projectiles: [],
    mines: [],
    flags: [null!, null!] as unknown as [Flag, Flag],
    sides: [null!, null!] as unknown as [SideState, SideState],
    winner: -1,
    endReason: null,
  };

  for (const side of [0, 1] as Side[]) {
    const towers = s.structs.filter((t) => t.kind === 'tower' && t.side === side);
    const ft = towers[Math.floor(rand(r) * towers.length)];
    ft.hasFlag = true;
    s.flags[side] = { side, state: 'hidden', x: ft.x, y: ft.y, hx: ft.x, hy: ft.y, towerId: ft.id, carrier: -1 };
    const [padX, padY] = gen.pads[side];
    s.sides[side] = {
      side,
      stock: { ...STOCK },
      vehicle: null,
      respawn: 0,
      alarm: false,
      droneT: 0,
      padX,
      padY,
      spawnA: side === 0 ? 0 : Math.PI,
      bunkerId: gen.structs[gen.bunkerIdx[side]].id,
      towersLeft: towers.length,
      vehiclesLost: 0,
    };
    for (const [x, y] of gen.patrolTanks[side]) {
      const pt = DEFENCE.patrolTank;
      const u: Unit = {
        id: s.nextId++, side, kind: 'ptank', x, y, a: rand(r) * Math.PI * 2, ta: 0,
        hp: pt.hp, max: pt.hp, cool: 1, hx: x, hy: y, wx: x, wy: y, wt: 0,
      };
      u.ta = u.a;
      s.units.push(u);
    }
  }
  s.rng = (r.rng ^ 0x1234567) | 0;
  return s;
}

export const worldSize = (s: GameState) => ({ w: s.world.W * TILE, h: s.world.H * TILE });
