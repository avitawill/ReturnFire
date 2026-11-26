import { expect, test, type Page } from '@playwright/test';
import { createGame } from '../src/sim/state';
import { findPath } from '../src/sim/world';

/**
 * Installs a fake standard gamepad at index 0 that the test can steer:
 * window.__pad.axes = [x, y]; window.__pad.press(i) / release(i).
 */
async function fakeGamepad(page: Page) {
  await page.addInitScript(() => {
    const buttons = Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 }));
    const pad = { id: 'Test pad (STANDARD GAMEPAD)', index: 0, connected: true, mapping: 'standard', timestamp: 0, axes: [0, 0, 0, 0], buttons };
    (window as any).__pad = {
      set axes(v: number[]) {
        pad.axes = [v[0], v[1], 0, 0];
      },
      press(i: number) {
        buttons[i] = { pressed: true, touched: true, value: 1 };
      },
      release(i: number) {
        buttons[i] = { pressed: false, touched: false, value: 0 };
      },
    };
    Object.defineProperty(navigator, 'getGamepads', { value: () => [pad, null, null, null] });
  });
}

const tap = async (page: Page, i: number) => {
  await page.evaluate((i) => (window as any).__pad.press(i), i);
  await page.waitForTimeout(250);
  await page.evaluate((i) => (window as any).__pad.release(i), i);
  await page.waitForTimeout(250);
};

const state = (page: Page) =>
  page.evaluate(() => {
    const g = (window as any).__mivtza;
    const s = g.state;
    const v = (side: number) => s.sides[side].vehicle && { type: s.sides[side].vehicle.type, x: s.sides[side].vehicle.x, y: s.sides[side].vehicle.y };
    return { winner: s.winner, reason: s.endReason, v0: v(0), v1: v(1), jeeps1: s.sides[1].stock.jeep, lost1: s.sides[1].vehiclesLost, layers: g.layers.length };
  });

test('two players complete a split-screen match with keyboard and gamepad', async ({ page }, info) => {
  test.setTimeout(400_000);
  await fakeGamepad(page);
  await page.goto('./?seed=7&quality=low&speed=6&map=twoShores');
  await page.waitForFunction(() => (window as any).__mivtza?.stats.frames > 3);
  // Main menu: start a two-player game with the keyboard.
  await page.locator('[data-action=two]').focus();
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await state(page)).layers).toBe(2);
  await page.screenshot({ path: info.outputPath('bays.png') });

  // Player 1 (keyboard) picks the tank from their bay with Tab/Enter.
  await page.locator('.layer[data-side="0"] [data-vehicle=tank]').focus();
  await page.keyboard.press('Enter');
  // Player 2 (gamepad) moves to the jeep card and confirms with A.
  for (let i = 0; i < 3; i++) await tap(page, 15); // D-pad right = previous in RTL order... wrap to the jeep
  await tap(page, 0);
  await expect.poll(async () => (await state(page)).v0?.type).toBe('tank');
  await expect.poll(async () => (await state(page)).v1?.type).toBeTruthy();
  await page.screenshot({ path: info.outputPath('split.png') });

  // Player 2 keeps launching jeeps and driving them west into player 1's guns, while
  // player 1 drives with the keyboard. When player 2's last jeep is gone, player 1 wins.
  await page.keyboard.down('ArrowRight');
  // Same seed and map as the page, so the test can plan routes on an identical world.
  const world = createGame({ seed: 7, map: 'twoShores' }).world;
  const t0 = Date.now();
  while (Date.now() - t0 < 330_000) {
    const s = await state(page);
    if (s.winner !== -1) break;
    if (!s.v1) {
      await page.evaluate(() => ((window as any).__pad.axes = [0, 0]));
      // Bay open (after the skull): choose the jeep if any are left.
      const bay = page.locator('.layer[data-side="1"] .menu');
      if (await bay.isVisible()) {
        await page.locator('.layer[data-side="1"] [data-vehicle=jeep]').focus();
        await tap(page, 0);
      } else await page.waitForTimeout(300);
      continue;
    }
    // Steer the jeep along a route toward player 1's pad, like a person following the road.
    const path = findPath(world, s.v1.x, s.v1.y, 12 * 32, 28 * 32, 'jeep') ?? [];
    const next = path[Math.min(2, path.length - 1)];
    const tx = next === undefined ? 12 * 32 : ((next % world.W) + 0.5) * 32;
    const ty = next === undefined ? 28 * 32 : (Math.floor(next / world.W) + 0.5) * 32;
    const dx = tx - s.v1.x;
    const dy = ty - s.v1.y;
    const m = Math.hypot(dx, dy) || 1;
    await page.evaluate(([x, y]) => ((window as any).__pad.axes = [x, y]), [dx / m, dy / m]);
    await page.waitForTimeout(200);
  }
  await page.keyboard.up('ArrowRight');
  const end = await state(page);
  expect(end.winner, JSON.stringify(end)).toBe(0);
  await expect(page.locator('.layer[data-side="0"] .menu')).toBeVisible();
  await expect(page.locator('.layer[data-side="1"] .menu')).toBeVisible();
  await page.screenshot({ path: info.outputPath('end.png') });
});
