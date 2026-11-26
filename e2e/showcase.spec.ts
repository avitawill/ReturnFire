import { expect, test, type Page } from '@playwright/test';
import { boot, vehicle } from './helpers';

const game = (page: Page, fn: string) => page.evaluate(`(() => { const g = window.__mivtza; ${fn} })()`);

test('each vehicle model on open ground', async ({ page }, info) => {
  await boot(page, '?seed=7');
  await page.click('[data-vehicle=tank]');
  await expect.poll(async () => (await vehicle(page))?.type).toBe('tank');
  for (const t of ['tank', 'launcher', 'jeep', 'heli']) {
    // Swap the model in place on the open south shore of the home island.
    await game(page, `const v = g.state.sides[0].vehicle; v.type = '${t}'; v.x = 13 * 32; v.y = 36.5 * 32; v.a = -0.5; v.ta = -0.5; v.left = true; v.hp = 9999;`);
    await page.waitForTimeout(1500);
    await page.screenshot({ path: info.outputPath(`vehicle-${t}.png`) });
  }
});

test('a flag tower collapses', async ({ page }, info) => {
  await boot(page, '?seed=7');
  await page.click('[data-vehicle=jeep]');
  await expect.poll(async () => (await vehicle(page))?.type).toBe('jeep');
  // Park the jeep in the gap between an enemy tower and its wall ring, facing it.
  await game(page, `
    const t = g.state.structs.find((s) => s.kind === 'tower' && s.side === 1 && s.tx > 80);
    t.hp = 3;
    const v = g.state.sides[0].vehicle;
    v.x = (t.tx - 0.5) * 32; v.y = (t.ty + 1) * 32; v.a = 0; v.ta = 0; v.left = true; v.hp = 9999;
    window.__tower = t.id;`);
  await page.waitForTimeout(800);
  await page.keyboard.down('Space');
  await expect.poll(() => page.evaluate(() => (window as any).__mivtza.state.structs[(window as any).__tower - 1].alive)).toBe(false);
  await page.keyboard.up('Space');
  for (const [i, ms] of [150, 500, 900, 2200].entries()) {
    await page.waitForTimeout(i === 0 ? ms : ms - [150, 500, 900, 2200][i - 1]);
    await page.screenshot({ path: info.outputPath(`collapse-${i}.png`) });
  }
});

test('music follows the vehicle, stops at the bunker, and one control mutes everything', async ({ page }) => {
  await boot(page, '?seed=7');
  await page.click('[data-vehicle=heli]');
  const music = () => page.evaluate(() => (window as any).__mivtza.audio.musicState()[0]);
  await expect.poll(music).toBe('heli');
  // Dock: mark as having left the pad, so it docks where it stands.
  await game(page, `g.state.sides[0].vehicle.left = true;`);
  await expect(page.locator('.layer[data-side="0"] .menu')).toBeVisible();
  await expect.poll(music).toBe(null);
  await page.click('[data-vehicle=jeep]');
  await expect.poll(music).toBe('jeep');
  await game(page, `g.state.sides[0].vehicle.left = true;`);
  await expect.poll(music).toBe(null);
  await page.click('[data-vehicle=tank]');
  await expect.poll(music).toBe('tank');
  // Mute from the bay's sound button: master output goes to zero.
  await game(page, `g.state.sides[0].vehicle.left = true;`);
  await page.locator('.layer[data-side="0"] .menu button.ghost').click();
  await expect.poll(() => page.evaluate(() => (window as any).__mivtza.audio.level)).toBe(0);
  const gain = await page.evaluate(() => new Promise<number>((r) => setTimeout(() => r((window as any).__mivtza.audio['master'].gain.value), 300)));
  expect(gain).toBeLessThan(0.01);
});
