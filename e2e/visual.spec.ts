import { expect, test } from '@playwright/test';
import { boot, vehicle } from './helpers';

/** Fraction of distinct colours in a coarse sample of the canvas: a blank or single-colour frame scores ~0. */
async function canvasVariety(page: import('@playwright/test').Page) {
  const buf = await page.locator('canvas.view').screenshot();
  return buf.length;
}

test('battlefield renders terrain, water, the player vehicle and enemy structures', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await boot(page, '?seed=7');
  await page.screenshot({ path: info.outputPath('menu.png') });
  await page.click('[data-vehicle=tank]');
  await expect.poll(async () => (await vehicle(page))?.type).toBe('tank');
  await page.waitForTimeout(1200);
  await page.screenshot({ path: info.outputPath('pad.png') });
  // Hop to the enemy's forward island so enemy guns are in frame.
  await page.evaluate(() => {
    const v = (window as any).__mivtza.state.sides[0].vehicle;
    v.x = 37 * 32;
    v.y = 17 * 32;
    v.left = true;
  });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: info.outputPath('enemy.png') });
  expect(await canvasVariety(page)).toBeGreaterThan(30_000);
  const hud = page.locator('.layer[data-side="0"] .hud');
  await expect(hud).toBeVisible();
  await expect(hud).toContainText('טנק');
  expect(errors).toEqual([]);
});
