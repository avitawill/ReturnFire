import { expect, test } from '@playwright/test';
import { boot } from './helpers';

test('the AI opponent launches a vehicle and drives off its pad', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await boot(page, '?seed=5&difficulty=hard&quality=low');
  await page.click('[data-vehicle=tank]');
  const enemy = () =>
    page.evaluate(() => {
      const s = (window as any).__mivtza.state;
      const v = s.sides[1].vehicle;
      return v ? Math.hypot(v.x - s.sides[1].padX, v.y - s.sides[1].padY) : -1;
    });
  await expect.poll(enemy, { timeout: 60_000 }).toBeGreaterThan(150);
  expect(errors).toEqual([]);
});
