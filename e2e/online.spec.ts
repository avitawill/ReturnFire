import { spawn, type ChildProcess } from 'node:child_process';
import { expect, test, type Page } from '@playwright/test';
import { createGame } from '../src/sim/state';
import { findPath } from '../src/sim/world';

const RELAY_PORT = 8790;
let relay: ChildProcess;

test.beforeAll(async () => {
  relay = spawn(process.execPath, ['server/relay.mjs'], { env: { ...process.env, PORT: String(RELAY_PORT) }, stdio: 'pipe' });
  await new Promise<void>((resolve) => relay.stdout!.on('data', (d) => String(d).includes('listening') && resolve()));
});
test.afterAll(() => relay.kill());

const info = (page: Page) =>
  page.evaluate(() => {
    const g = (window as any).__mivtza;
    const s = g.state;
    const v = s.sides[1].vehicle;
    return {
      phase: g.phase,
      tick: s.tick,
      winner: s.winner,
      v1: v && { type: v.type, x: v.x, y: v.y },
      v0: s.sides[0].vehicle?.type ?? null,
      desyncs: g.net?.lock?.desyncs ?? -1,
      local: g.net?.local ?? -1,
    };
  });

test('two players finish a match online through the relay', async ({ browser }, testInfo) => {
  test.setTimeout(420_000);
  const url = `/?quality=low&speed=4&map=twoShores&relay=ws://127.0.0.1:${RELAY_PORT}`;
  const host = await (await browser.newContext({ viewport: { width: 800, height: 500 } })).newPage();
  const guest = await (await browser.newContext({ viewport: { width: 800, height: 500 } })).newPage();
  for (const p of [host, guest]) {
    await p.goto(url);
    await p.waitForFunction(() => (window as any).__mivtza?.stats.frames > 3);
    await p.click('[data-action=online]');
  }
  await host.click('.screen.online [data-action=create]');
  await expect(host.locator('.room-code')).toContainText(/[A-Z0-9]{4}/);
  const code = (await host.locator('.room-code').textContent())!.match(/[A-Z0-9]{4}/)![0];
  await guest.fill('.code-input', code);
  await guest.click('.screen.online [data-action=join]');
  await expect.poll(async () => (await info(host)).phase).toBe('play');
  await expect.poll(async () => (await info(guest)).phase).toBe('play');
  expect((await info(host)).local).toBe(0);
  expect((await info(guest)).local).toBe(1);
  await host.screenshot({ path: testInfo.outputPath('host-bay.png') });

  // The host takes a tank; the guest keeps sending jeeps into the host's guns until none are left.
  await host.click('[data-vehicle=tank]');
  const world = createGame({ seed: 1, map: 'twoShores' }).world;
  const held = new Set<string>();
  const hold = async (keys: string[]) => {
    for (const k of [...held]) if (!keys.includes(k)) {
      await guest.keyboard.up(k);
      held.delete(k);
    }
    for (const k of keys) if (!held.has(k)) {
      await guest.keyboard.down(k);
      held.add(k);
    }
  };
  const t0 = Date.now();
  let shot = false;
  while (Date.now() - t0 < 360_000) {
    const g = await info(guest);
    if (g.winner !== -1) break;
    if (!g.v1) {
      await hold([]);
      const card = guest.locator('[data-vehicle=jeep]');
      if (await card.isVisible()) await card.click();
      else await guest.waitForTimeout(300);
      continue;
    }
    if (!shot && g.v0) {
      await host.screenshot({ path: testInfo.outputPath('host-play.png') });
      await guest.screenshot({ path: testInfo.outputPath('guest-play.png') });
      shot = true;
    }
    const path = findPath(world, g.v1.x, g.v1.y, 12 * 32, 28 * 32, 'jeep') ?? [];
    const n = path[Math.min(2, path.length - 1)];
    const dx = (n === undefined ? 12 * 32 : ((n % world.W) + 0.5) * 32) - g.v1.x;
    const dy = (n === undefined ? 28 * 32 : (Math.floor(n / world.W) + 0.5) * 32) - g.v1.y;
    const m = Math.hypot(dx, dy) || 1;
    const keys: string[] = [];
    if (dx / m > 0.38) keys.push('ArrowRight');
    if (dx / m < -0.38) keys.push('ArrowLeft');
    if (dy / m > 0.38) keys.push('ArrowDown');
    if (dy / m < -0.38) keys.push('ArrowUp');
    await hold(keys);
    await guest.waitForTimeout(150);
  }
  await hold([]);
  const [h, g] = [await info(host), await info(guest)];
  expect(h.winner, JSON.stringify(h)).toBe(0);
  await expect.poll(async () => (await info(guest)).winner).toBe(0);
  expect(h.desyncs).toBe(0);
  expect(g.desyncs).toBe(0);
  await expect(host.locator('.layer .menu')).toBeVisible();
  await guest.screenshot({ path: testInfo.outputPath('guest-end.png') });
});
