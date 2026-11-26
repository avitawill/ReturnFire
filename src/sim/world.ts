// Map generation, tile queries and the pathfinding grid.

import { Tile, type Side, type Structure, type StructKind, type World, type GameState } from './entities';
import type { MapDef } from './maps';
import { makeRng, rand } from './rng';
import { DEFENCE, TILE } from './tuning';

export interface GeneratedWorld {
  world: World;
  structs: Structure[];
  /** Pad centre (world px) and patrol-tank spawn tiles per side. */
  pads: [[number, number], [number, number]];
  patrolTanks: [[number, number][], [number, number][]];
  bunkerIdx: [number, number];
}

const mirrorTile = (def: MapDef, tx: number, ty: number, w = 1, h = 1): [number, number] => [
  def.W - tx - w,
  def.H - ty - h,
];

function islandLand(def: MapDef, x: number, y: number): boolean {
  for (const is of def.islands) {
    const dx = (x + 0.5 - is.cx) / is.rx;
    const dy = (y + 0.5 - is.cy) / is.ry;
    const an = Math.atan2(dy, dx);
    // Even harmonics only, so an island is point-symmetric about its own centre.
    const w = 1 + 0.1 * Math.sin(an * 4 + is.ph) + 0.06 * Math.sin(an * 6 + is.ph * 2);
    if (dx * dx + dy * dy < w * w) return true;
  }
  return false;
}

export function generateWorld(def: MapDef, seed: number): GeneratedWorld {
  const { W, H } = def;
  const N = W * H;
  const r = makeRng(seed ^ 0x5eed);
  const tiles = new Uint8Array(N);
  const block = new Int16Array(N);
  const road = new Uint8Array(N);
  const reserved = new Uint8Array(N);
  const structs: Structure[] = [];
  const mirrorIdx = (i: number) => N - 1 - i;

  // Land: compute the west half, mirror the east half.
  for (let y = 1; y < H - 1; y++)
    for (let x = 1; x < W / 2; x++) {
      if (!islandLand(def, x, y)) continue;
      const i = y * W + x;
      tiles[i] = Tile.Grass;
      tiles[mirrorIdx(i)] = Tile.Grass;
    }

  const rect = (mask: Uint8Array, x0: number, y0: number, x1: number, y1: number) => {
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        const i = y * W + x;
        mask[i] = 1;
        mask[mirrorIdx(i)] = 1;
      }
  };
  for (const [x0, y0, x1, y1] of def.roads) rect(road, x0, y0, x1, y1);

  // Keep the pad and the bunker's surroundings clear of walls and turrets.
  const [px, py] = def.pad;
  rect(reserved, px - 1, py - 1, px + 2, py + 2);
  const [bx, by] = def.bunker;
  rect(reserved, bx - 1, by - 1, bx + 2, by + 2);

  const free = (tx: number, ty: number, w: number, h: number, needLand: boolean, allowReserved: boolean) => {
    for (let y = ty; y < ty + h; y++)
      for (let x = tx; x < tx + w; x++) {
        if (x < 1 || y < 1 || x >= W - 1 || y >= H - 1) return false;
        const i = y * W + x;
        if (block[i] || road[i] || (!allowReserved && reserved[i]) || (needLand && tiles[i] === Tile.Water)) return false;
      }
    return true;
  };
  const place = (side: Side, kind: StructKind, tx: number, ty: number, w: number, h: number, hp: number) => {
    const s: Structure = {
      id: structs.length + 1,
      side,
      kind,
      tx,
      ty,
      w,
      h,
      x: (tx + w / 2) * TILE,
      y: (ty + h / 2) * TILE,
      hp: Number.isFinite(hp) ? hp : 1,
      max: Number.isFinite(hp) ? hp : 1,
      indestructible: !Number.isFinite(hp),
      alive: true,
      // Turrets start facing the enemy side.
      a: side === 0 ? 0 : Math.PI,
      cool: 1 + rand(r) * 2,
      hasFlag: false,
    };
    structs.push(s);
    for (let y = ty; y < ty + h; y++)
      for (let x = tx; x < tx + w; x++) {
        tiles[y * W + x] = Tile.Grass;
        block[y * W + x] = structs.length;
      }
    return s;
  };
  /** Adds a structure for side 0 and its mirror for side 1, or neither. */
  const add = (kind: StructKind, tx: number, ty: number, w: number, h: number, hp: number, needLand = false, allowReserved = false) => {
    const [mx, my] = mirrorTile(def, tx, ty, w, h);
    if (!free(tx, ty, w, h, needLand, allowReserved) || !free(mx, my, w, h, needLand, allowReserved)) return false;
    place(0, kind, tx, ty, w, h, hp);
    place(1, kind, mx, my, w, h, hp);
    return true;
  };

  const okBunker = add('bunker', bx, by, 2, 2, Infinity, false, true);
  if (!okBunker) throw new Error(`map ${def.name}: bunker does not fit`);
  const bunkerIdx: [number, number] = [structs.length - 2, structs.length - 1];
  for (const [x, y] of def.guards) add('guard', x, y, 1, 1, Infinity, false, true);
  for (const [x, y] of def.towers) if (!add('tower', x, y, 2, 2, DEFENCE.tower.hp)) throw new Error(`map ${def.name}: tower at ${x},${y} does not fit`);
  for (const [x, y] of def.towers) {
    add('turret', x - 2, y - 2, 1, 1, DEFENCE.turret.hp, true);
    add('turret', x + 3, y + 3, 1, 1, DEFENCE.turret.hp, true);
  }
  for (const [x, y] of def.turrets) add('turret', x, y, 1, 1, DEFENCE.turret.hp, true);
  for (const [x, y] of def.aa) add('aa', x, y, 1, 1, DEFENCE.aa.hp, true);
  for (const [tx, ty] of def.towers)
    for (let y = ty - 2; y <= ty + 3; y++)
      for (let x = tx - 2; x <= tx + 3; x++) {
        if (x !== tx - 2 && x !== tx + 3 && y !== ty - 2 && y !== ty + 3) continue;
        if (rand(r) < DEFENCE.wall.chance) add('wall', x, y, 1, 1, DEFENCE.wall.hp, true);
      }

  // Beaches: free grass next to water becomes sand.
  for (let y = 1; y < H - 1; y++)
    for (let x = 1; x < W - 1; x++) {
      const i = y * W + x;
      if (tiles[i] !== Tile.Grass || block[i]) continue;
      let shore = false;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (tiles[i + dy * W + dx] === Tile.Water) shore = true;
      if (shore) tiles[i] = Tile.Sand;
    }
  for (let i = 0; i < N; i++) if (road[i]) tiles[i] = tiles[i] === Tile.Water ? Tile.Bridge : Tile.Road;
  for (let y = py; y < py + 2; y++)
    for (let x = px; x < px + 2; x++) {
      const i = y * W + x;
      tiles[i] = Tile.Pad;
      tiles[mirrorIdx(i)] = Tile.Pad;
    }
  // Trees, mirrored.
  for (let y = 1; y < H - 1; y++)
    for (let x = 1; x < W / 2; x++) {
      const i = y * W + x;
      const j = mirrorIdx(i);
      const roll = rand(r);
      if (tiles[i] !== Tile.Grass || block[i] || tiles[j] !== Tile.Grass || block[j]) continue;
      if (reserved[i] || Math.hypot(x - (px + 1), y - (py + 1)) <= 4) continue;
      if (roll < def.treeDensity) {
        tiles[i] = Tile.Tree;
        tiles[j] = Tile.Tree;
      }
    }

  const padC: [number, number] = [(px + 1) * TILE, (py + 1) * TILE];
  const padM: [number, number] = [W * TILE - padC[0], H * TILE - padC[1]];
  const tanks0 = def.patrolTanks.map(([x, y]) => freeSpot(tiles, block, W, H, x, y));
  const tanks1 = def.patrolTanks.map(([x, y]) => {
    const [mx, my] = mirrorTile(def, x, y);
    return freeSpot(tiles, block, W, H, mx, my);
  });
  return {
    world: { W, H, tiles, block },
    structs,
    pads: [padC, padM],
    patrolTanks: [tanks0, tanks1],
    bunkerIdx,
  };
}

function freeSpot(tiles: Uint8Array, block: Int16Array, W: number, H: number, tx: number, ty: number): [number, number] {
  for (let rad = 0; rad < 8; rad++)
    for (let y = ty - rad; y <= ty + rad; y++)
      for (let x = tx - rad; x <= tx + rad; x++) {
        if (x < 1 || y < 1 || x >= W - 1 || y >= H - 1) continue;
        const i = y * W + x;
        const t = tiles[i];
        if (!block[i] && (t === Tile.Grass || t === Tile.Sand || t === Tile.Road)) return [(x + 0.5) * TILE, (y + 0.5) * TILE];
      }
  return [tx * TILE, ty * TILE];
}

// ---------------------------------------------------------------- queries

export function tileAt(w: World, x: number, y: number): number {
  const tx = Math.floor(x / TILE);
  const ty = Math.floor(y / TILE);
  return tx < 0 || ty < 0 || tx >= w.W || ty >= w.H ? Tile.Water : w.tiles[ty * w.W + tx];
}

export function structAt(s: GameState, x: number, y: number): Structure | null {
  const w = s.world;
  const tx = Math.floor(x / TILE);
  const ty = Math.floor(y / TILE);
  if (tx < 0 || ty < 0 || tx >= w.W || ty >= w.H) return null;
  const b = w.block[ty * w.W + tx];
  return b ? s.structs[b - 1] : null;
}

export const isWater = (t: number) => t === Tile.Water;

// ---------------------------------------------------------------- pathfinding

/** Who is moving: decides which tiles are passable and what they cost. */
export type Mover = 'heavy' | 'jeep' | 'ptank';

export interface PathOptions {
  /**
   * Structures this returns true for (by struct index) are treated as passable
   * at BREACH_COST: the mover intends to shoot its way through them.
   */
  breach?: (structIndex: number) => boolean;
  /** Extra cost per tile (e.g. to keep away from your own pad, where driving over it docks). */
  extra?: (tile: number) => number;
  maxNodes?: number;
}

export const BREACH_COST = 7;

/** Cost of entering a tile, or Infinity when impassable. */
export function tileCost(w: World, i: number, mover: Mover, opts?: PathOptions): number {
  const c = baseCost(w, i, mover, opts);
  return opts?.extra && Number.isFinite(c) ? c + opts.extra(i) : c;
}

function baseCost(w: World, i: number, mover: Mover, opts?: PathOptions): number {
  if (w.block[i]) return opts?.breach && opts.breach(w.block[i] - 1) ? BREACH_COST : Infinity;
  const t = w.tiles[i];
  if (t === Tile.Water) return mover === 'jeep' ? 2.2 : Infinity;
  if (t === Tile.Tree) return mover === 'jeep' ? Infinity : 1.6;
  if (t === Tile.Road || t === Tile.Bridge || t === Tile.Pad) return 0.9;
  return 1;
}

const DIRS: [number, number, number][] = [
  [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
  [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2],
];

/**
 * A* over the tile grid with 8-way moves (no corner cutting). Returns tile
 * indices from start (exclusive) to goal (inclusive), or null. If the goal tile
 * itself is blocked, paths end at the cheapest reachable neighbour of it.
 */
export function findPath(w: World, sx: number, sy: number, gx: number, gy: number, mover: Mover, opts?: PathOptions): number[] | null {
  const maxNodes = opts?.maxNodes ?? 8000;
  const W = w.W;
  const H = w.H;
  const stx = clampI(Math.floor(sx / TILE), 0, W - 1);
  const sty = clampI(Math.floor(sy / TILE), 0, H - 1);
  const gtx = clampI(Math.floor(gx / TILE), 0, W - 1);
  const gty = clampI(Math.floor(gy / TILE), 0, H - 1);
  const start = sty * W + stx;
  const goal = gty * W + gtx;
  if (start === goal) return [];
  const goalBlocked = !Number.isFinite(tileCost(w, goal, mover, opts));
  const isGoal = (i: number) => {
    if (i === goal) return true;
    if (!goalBlocked) return false;
    const dx = Math.abs((i % W) - gtx);
    const dy = Math.abs(Math.floor(i / W) - gty);
    return dx <= 1 && dy <= 1;
  };
  const g = new Float64Array(W * H).fill(Infinity);
  const from = new Int32Array(W * H).fill(-1);
  const closed = new Uint8Array(W * H);
  const heap = new MinHeap();
  const hfn = (i: number) => {
    const dx = Math.abs((i % W) - gtx);
    const dy = Math.abs(Math.floor(i / W) - gty);
    return 0.9 * (Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy));
  };
  g[start] = 0;
  heap.push(start, hfn(start));
  let expanded = 0;
  while (heap.size) {
    const cur = heap.pop();
    if (closed[cur]) continue;
    closed[cur] = 1;
    if (isGoal(cur)) {
      const path: number[] = [];
      for (let i = cur; i !== start; i = from[i]) path.push(i);
      return path.reverse();
    }
    if (++expanded > maxNodes) return null;
    const cx = cur % W;
    const cy = Math.floor(cur / W);
    for (const [dx, dy, len] of DIRS) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const ni = ny * W + nx;
      if (closed[ni]) continue;
      const c = tileCost(w, ni, mover, opts);
      if (!Number.isFinite(c)) continue;
      if (dx && dy) {
        // No corner cutting, and no diagonal squeeze past a structure.
        if (w.block[cy * W + nx] || w.block[ny * W + cx] || w.block[ni]) continue;
        if (!Number.isFinite(tileCost(w, cy * W + nx, mover, opts)) || !Number.isFinite(tileCost(w, ny * W + cx, mover, opts))) continue;
      }
      const ng = g[cur] + c * len;
      if (ng < g[ni]) {
        g[ni] = ng;
        from[ni] = cur;
        heap.push(ni, ng + hfn(ni));
      }
    }
  }
  return null;
}

const clampI = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);

class MinHeap {
  private k: number[] = [];
  private p: number[] = [];
  get size() {
    return this.k.length;
  }
  push(key: number, pri: number) {
    const k = this.k;
    const p = this.p;
    k.push(key);
    p.push(pri);
    let i = k.length - 1;
    while (i > 0) {
      const par = (i - 1) >> 1;
      if (p[par] <= p[i]) break;
      [k[par], k[i]] = [k[i], k[par]];
      [p[par], p[i]] = [p[i], p[par]];
      i = par;
    }
  }
  pop(): number {
    const k = this.k;
    const p = this.p;
    const top = k[0];
    const lk = k.pop()!;
    const lp = p.pop()!;
    if (k.length) {
      k[0] = lk;
      p[0] = lp;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < k.length && p[l] < p[m]) m = l;
        if (r < k.length && p[r] < p[m]) m = r;
        if (m === i) break;
        [k[m], k[i]] = [k[i], k[m]];
        [p[m], p[i]] = [p[i], p[m]];
        i = m;
      }
    }
    return top;
  }
}
