// Measures frame rate and main-thread cost while driving. Usage: node scripts/perf.mjs <url> [throttle] [mobile]
import { chromium, devices } from 'playwright';
const [url, throttle = '1', mobile = ''] = process.argv.slice(2);
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-gpu-vsync', '--disable-frame-rate-limit'] });
const ctx = await browser.newContext(mobile ? { ...devices['Pixel 7'] } : { viewport: { width: 1280, height: 720 } });
const page = await ctx.newPage();
const cdp = await ctx.newCDPSession(page);
await page.goto(url);
await page.waitForFunction(() => window.__mivtza && window.__mivtza.stats.frames > 5);
await page.click('[data-vehicle=tank]');
await cdp.send('Emulation.setCPUThrottlingRate', { rate: Number(throttle) });
await page.keyboard.down('ArrowRight');
await page.waitForTimeout(6000);
const s = await page.evaluate(() => ({ ...window.__mivtza.stats }));
console.log(JSON.stringify({ throttle, mobile: !!mobile, fps: +s.fps.toFixed(1), cpuMs: +s.cpuMs.toFixed(2), calls: s.calls, tris: s.triangles }));
await browser.close();
