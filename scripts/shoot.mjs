// Usage: node scripts/shoot.mjs <url> <outPrefix> [actions-json]
// Takes screenshots at 1280x720 and 390x844 (mobile emulation).
import { chromium, devices } from 'playwright';
const [url, out, actionsJson] = process.argv.slice(2);
const actions = actionsJson ? JSON.parse(actionsJson) : [];
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const sizes = [
  { name: 'desktop', ctx: { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 } },
  { name: 'mobile', ctx: { ...devices['iPhone 13'], viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 } },
];
for (const s of sizes) {
  const ctx = await browser.newContext(s.ctx);
  const page = await ctx.newPage();
  const logs = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(`${m.type()}: ${m.text()}`); });
  page.on('pageerror', (e) => logs.push(`pageerror: ${e.message}`));
  await page.goto(url);
  await page.waitForFunction(() => window.__mivtza && window.__mivtza.stats.frames > 5, null, { timeout: 30000 });
  for (const a of actions) {
    if (a.click) await page.click(a.click);
    if (a.wait) await page.waitForTimeout(a.wait);
    if (a.eval) await page.evaluate(a.eval);
    if (a.key) await page.keyboard.down(a.key);
    if (a.keyup) await page.keyboard.up(a.keyup);
    if (a.shot) await page.screenshot({ path: `${out}-${a.shot}-${s.name}.png` });
  }
  await page.screenshot({ path: `${out}-${s.name}.png` });
  const fps = await page.evaluate(() => window.__mivtza.stats.fps);
  console.log(s.name, 'fps', fps.toFixed(1), logs.slice(0, 8).join('\n'));
  await ctx.close();
}
await browser.close();
