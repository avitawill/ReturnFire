import { expect, test } from '@playwright/test';
import { boot, driveWaypoints, vehicle } from './helpers';

const BRIDGE = 4;

test('keyboard drives the tank from the pad across the first bridge', async ({ page }) => {
  await boot(page, '?seed=7');
  await page.click('[data-vehicle=tank]');
  await expect.poll(async () => (await vehicle(page))?.type).toBe('tank');

  // Pad → spur road east → ring road north → top road east over the bridge.
  const route: [number, number][] = [[15, 27.5], [15.5, 16.5], [24, 16.5], [30, 16.5], [35, 16.5]];
  const { visited, reached } = await driveWaypoints(page, route, { timeout: 120_000 });
  const onBridge = visited.filter((v) => v.tile === BRIDGE);
  expect(onBridge.length, 'drove over bridge tiles').toBeGreaterThan(3);
  expect(reached, 'reached the far end of the bridge').toBe(true);
  const end = visited[visited.length - 1];
  expect(end.x / 32).toBeGreaterThan(34);
  expect(end.tile).not.toBe(BRIDGE);
  expect(end.tile).not.toBe(0);
});
