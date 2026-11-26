// Seeded random maps. Produces a MapDef in the same form as the hand-tuned
// ones (side 0 layout, mirrored for side 1) and only returns layouts that the
// world generator accepts and where tanks can drive from pad to pad.

import type { IslandDef, MapDef } from './maps';
import { makeRng, rand, type RngHolder } from './rng';
import { findPath, generateWorld } from './world';

const W = 96;
const H = 56;

const ri = (r: RngHolder, a: number, b: number) => a + Math.floor(rand(r) * (b - a + 1));

function attempt(r: RngHolder, seed: number): MapDef {
  const cx = ri(r, 13, 17);
  const cy = ri(r, 25, 31);
  const rx = ri(r, 11, 13);
  const ry = ri(r, 13, 17);
  const islands: IslandDef[] = [{ cx, cy, rx, ry, ph: rand(r) * 6 }];
  const mids = ri(r, 1, 3);
  const midSpots: [number, number][] = [];
  for (let i = 0; i < mids; i++) {
    const m = { cx: ri(r, 32, 46), cy: ri(r, 9, 46), rx: ri(r, 4, 9), ry: ri(r, 4, 7), ph: rand(r) * 6 };
    islands.push(m);
    midSpots.push([m.cx, m.cy]);
  }
  // Road network: a vertical spine on the base island and either a ring
  // (two crossings, mirrored) or one central causeway.
  const bx = cx + ri(r, -1, 2);
  const ring = rand(r) < 0.6;
  const roads: [number, number, number, number][] = [];
  let crossRow: number;
  if (ring) {
    crossRow = cy - ri(r, 6, Math.min(10, ry - 3));
    roads.push([bx, crossRow, W - 1 - bx, crossRow + 1]);
    roads.push([bx, crossRow, bx + 1, H - 1 - crossRow]);
  } else {
    crossRow = H / 2 - 1;
    roads.push([bx, crossRow, W / 2, crossRow + 1]);
    roads.push([bx, cy - ry + 4, bx + 1, cy + ry - 4]);
  }
  // Bunker at the back of the island, pad in front of it, spur to the spine.
  const bunker: [number, number] = [cx - rx + 4, cy - 1];
  const pad: [number, number] = [bunker[0] + 3, cy - 1];
  roads.push([pad[0] + 1, pad[1], bx, pad[1] + 1]);
  const guards: [number, number][] = [[bunker[0] + 2, bunker[1] - 3], [bunker[0] + 2, bunker[1] + 4]];

  const onRoad = (x: number, y: number, m: number) =>
    roads.some(([x0, y0, x1, y1]) => x >= x0 - m && x <= x1 + m && y >= y0 - m && y <= y1 + m) ||
    roads.some(([x0, y0, x1, y1]) => {
      const mx0 = W - 1 - x1;
      const mx1 = W - 1 - x0;
      const my0 = H - 1 - y1;
      const my1 = H - 1 - y0;
      return x >= mx0 - m && x <= mx1 + m && y >= my0 - m && y <= my1 + m;
    });
  const inIsland = (x: number, y: number, k: number) => ((x - cx) / (rx * k)) ** 2 + ((y - cy) / (ry * k)) ** 2 < 1;
  const nearBase = (x: number, y: number) => Math.abs(x - pad[0]) < 5 && Math.abs(y - pad[1]) < 5;

  const towers: [number, number][] = [];
  for (let k = 0; k < 1500 && towers.length < 6; k++) {
    const x = ri(r, cx - rx, cx + rx);
    const y = ri(r, cy - ry, cy + ry);
    if (!inIsland(x + 1, y + 1, 0.8) || onRoad(x, y, 2) || onRoad(x + 1, y + 1, 2) || nearBase(x, y)) continue;
    if (towers.some(([tx, ty]) => Math.hypot(tx - x, ty - y) < 5.5)) continue;
    towers.push([x, y]);
  }
  const scatter = (n: number, k: number, margin: number, pred: (x: number, y: number) => boolean) => {
    const out: [number, number][] = [];
    for (let i = 0; i < 300 && out.length < n; i++) {
      const x = ri(r, cx - rx, cx + rx);
      const y = ri(r, cy - ry, cy + ry);
      if (!inIsland(x, y, k) || onRoad(x, y, margin) || nearBase(x, y) || !pred(x, y)) continue;
      out.push([x, y]);
    }
    return out;
  };
  const turrets = scatter(4, 0.85, 0, (x, y) => onRoad(x, y, 3));
  const aa = scatter(3, 0.7, 1, () => true);
  const patrolTanks = scatter(4, 0.6, 0, () => true);
  // Forward positions on the middle islands.
  for (const [mx, my] of midSpots.slice(0, 2)) {
    turrets.push([mx - 2, my + 1]);
    patrolTanks.push([mx, my]);
  }
  if (midSpots[0]) aa.push([midSpots[0][0] + 2, midSpots[0][1] - 2]);
  return {
    name: `random-${seed}`,
    W,
    H,
    islands,
    roads,
    bunker,
    pad,
    guards,
    towers,
    turrets,
    aa,
    patrolTanks,
    treeDensity: 0.05 + rand(r) * 0.06,
  };
}

/** A playable random map for `seed`. Deterministic. */

export function randomMap(seed: number): MapDef {
  const r = makeRng(seed ^ 0x6d61702a);
  for (let tries = 0; tries < 200; tries++) {
    const def = attempt(r, seed);
    if (def.towers.length < 6) continue;
    try {
      const g = generateWorld(def, seed);
      const [a, b] = g.pads;
      // Tanks must be able to drive from pad to pad (ignoring the structures they could shoot through).
      const blockless = { ...g.world, block: new Int16Array(g.world.block.length) };
      if (!findPath(blockless, a[0], a[1], b[0], b[1], 'heavy', { maxNodes: 20000 })) continue;
      return def;
    } catch {
      /* layout rejected by the world generator; try again */
    }
  }
  throw new Error(`no playable random map for seed ${seed}`);
}
