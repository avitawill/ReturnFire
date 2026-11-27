import { expect, test, type Page } from '@playwright/test';
import { boot, vehicle } from './helpers';

const tick = (page: Page) => page.evaluate(() => (window as any).__mivtza.state.tick as number);

test('the pause button and Escape pause and resume the game', async ({ page }, info) => {
  await boot(page, '?seed=3&quality=low');
  await page.click('[data-vehicle=tank]');
  await expect.poll(async () => (await vehicle(page))?.type).toBe('tank');
  const btn = page.locator('.layer[data-side="0"] [data-action=pause]');
  await expect(btn).toBeVisible();
  await page.screenshot({ path: info.outputPath('hud.png') });

  await btn.click();
  await expect(page.locator('.screen.pause')).toBeVisible();
  const a = await tick(page);
  await page.waitForTimeout(800);
  expect(await tick(page)).toBe(a);
  await page.screenshot({ path: info.outputPath('paused.png') });
  await page.click('.screen.pause [data-action=resume]');
  await expect(page.locator('.screen.pause')).toBeHidden();
  await expect.poll(() => tick(page)).toBeGreaterThan(a);

  // Keyboard: Escape pauses, Escape again resumes.
  await page.keyboard.press('Escape');
  await expect(page.locator('.screen.pause')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.screen.pause')).toBeHidden();
  const b = await tick(page);
  await expect.poll(() => tick(page)).toBeGreaterThan(b);
});
