import type { Page } from '@playwright/test';

export interface VehicleInfo {
  type: string;
  x: number;
  y: number;
  a: number;
  hp: number;
  tile: number;
}

/** Waits until the game has booted and rendered a few frames. */
/** Boots straight into a single-player match unless the query says otherwise. */
export async function boot(page: Page, query = '') {
  const q = query.includes('play=') || query.includes('menu') ? query : `${query}${query ? '&' : '?'}play=1`;
  await page.goto(`./${q}`);
  await page.waitForFunction(() => {
    const g = (window as any).__mivtza;
    return g && g.stats.frames > 3;
  });
}

export async function vehicle(page: Page, side = 0): Promise<VehicleInfo | null> {
  return page.evaluate((side) => {
    const g = (window as any).__mivtza;
    const v = g.state.sides[side].vehicle;
    if (!v) return null;
    const w = g.state.world;
    const tile = w.tiles[Math.floor(v.y / 32) * w.W + Math.floor(v.x / 32)];
    return { type: v.type, x: v.x, y: v.y, a: v.a, hp: v.hp, tile };
  }, side);
}

type Key = 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight';

/**
 * Drives along waypoints (tile coordinates) by holding arrow keys, re-reading
 * the vehicle position every `period` ms. Returns the positions visited.
 */
export async function driveWaypoints(page: Page, waypoints: [number, number][], opts: { timeout?: number; period?: number; tol?: number } = {}) {
  const held = new Set<Key>();
  const setKeys = async (want: Set<Key>) => {
    for (const k of [...held]) if (!want.has(k)) {
      await page.keyboard.up(k);
      held.delete(k);
    }
    for (const k of want) if (!held.has(k)) {
      await page.keyboard.down(k);
      held.add(k);
    }
  };
  const visited: VehicleInfo[] = [];
  const t0 = Date.now();
  let i = 0;
  const tol = (opts.tol ?? 0.6) * 32;
  while (i < waypoints.length && Date.now() - t0 < (opts.timeout ?? 90_000)) {
    const v = await vehicle(page);
    if (!v) break;
    visited.push(v);
    const [wx, wy] = waypoints[i];
    const dx = (wx + 0.5) * 32 - v.x;
    const dy = (wy + 0.5) * 32 - v.y;
    if (Math.hypot(dx, dy) < tol) {
      i++;
      continue;
    }
    const want = new Set<Key>();
    const m = Math.hypot(dx, dy);
    if (dx / m > 0.38) want.add('ArrowRight');
    if (dx / m < -0.38) want.add('ArrowLeft');
    if (dy / m > 0.38) want.add('ArrowDown');
    if (dy / m < -0.38) want.add('ArrowUp');
    await setKeys(want);
    await page.waitForTimeout(opts.period ?? 60);
  }
  await setKeys(new Set());
  return { visited, reached: i >= waypoints.length };
}
