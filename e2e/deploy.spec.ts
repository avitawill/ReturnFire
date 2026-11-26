import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';

const DIST = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const TYPES: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.glb': 'model/gltf-binary', '.mp3': 'audio/mpeg', '.woff2': 'font/woff2' };
let server: Server;
const PORT = 4190;

test.beforeAll(async () => {
  // A plain static server that only serves the build under /games/mivtza/.
  server = createServer((req, res) => {
    const url = decodeURIComponent((req.url ?? '/').split('?')[0]);
    const prefix = '/games/mivtza/';
    if (!url.startsWith(prefix)) {
      res.writeHead(404).end();
      return;
    }
    let file = normalize(join(DIST, url.slice(prefix.length)));
    if (!file.startsWith(DIST)) {
      res.writeHead(403).end();
      return;
    }
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
    if (!existsSync(file)) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
    createReadStream(file).pipe(res);
  });
  await new Promise<void>((r) => server.listen(PORT, '127.0.0.1', r));
});
test.afterAll(() => new Promise<void>((r) => server.close(() => r())));

test('the production build runs from a subfolder', async ({ page }) => {
  const failed: string[] = [];
  const errors: string[] = [];
  page.on('response', (r) => r.status() >= 400 && failed.push(`${r.status()} ${r.url()}`));
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${PORT}/games/mivtza/?seed=3`);
  await page.waitForFunction(() => (window as any).__mivtza?.stats.frames > 3);
  await expect(page.locator('[data-action=single]')).toBeVisible();
  await page.click('[data-action=single]');
  await page.click('[data-vehicle=heli]');
  await expect.poll(() => page.evaluate(() => (window as any).__mivtza.audio.musicState()[0])).toBe('heli');
  // The recording itself loads relative to the subfolder.
  const music = await page.evaluate(() => fetch('audio/valkyries.mp3').then((r) => r.status));
  expect(music).toBe(200);
  expect(failed).toEqual([]);
  expect(errors).toEqual([]);
});

test('graphics "low" turns off shadows and explosion lighting', async ({ page }) => {
  await page.goto('/?quality=low&play=1&seed=3');
  await page.waitForFunction(() => (window as any).__mivtza?.stats.frames > 3);
  const low = await page.evaluate(() => {
    const r = (window as any).__mivtza.renderer;
    let lights = 0;
    r.scene.traverse((o: any) => o.isPointLight && lights++);
    return { shadows: r.renderer.shadowMap.enabled, lights, pixelRatio: r.renderer.getPixelRatio() };
  });
  expect(low).toEqual({ shadows: false, lights: 0, pixelRatio: 1 });
  // And switching to high in the settings turns them back on, mid-match.
  await page.keyboard.press('Escape');
  await page.locator('.screen.pause button.ghost').first().click();
  await page.locator('.screen.settings [data-value=high]').click();
  const high = await page.evaluate(() => {
    const r = (window as any).__mivtza.renderer;
    let lights = 0;
    r.scene.traverse((o: any) => o.isPointLight && lights++);
    return { shadows: r.renderer.shadowMap.enabled, lights };
  });
  expect(high).toEqual({ shadows: true, lights: 2 });
});
