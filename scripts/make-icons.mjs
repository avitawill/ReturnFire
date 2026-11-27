// Renders public/icons/icon.svg to the PNG sizes the web app manifest and iOS need.
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
const svg = readFileSync('public/icons/icon.svg', 'utf8');
const b = await chromium.launch();
const p = await b.newPage();
for (const [name, size, pad] of [['icon-192.png', 192, 0], ['icon-512.png', 512, 0], ['maskable-512.png', 512, 0.12], ['apple-touch-icon.png', 180, 0]]) {
  await p.setViewportSize({ width: size, height: size });
  const inner = Math.round(size * (1 - pad * 2));
  await p.setContent(`<body style="margin:0;background:#17525c;display:grid;place-items:center;width:${size}px;height:${size}px">${svg.replace('<svg ', `<svg width="${inner}" height="${inner}" `)}</body>`);
  await p.screenshot({ path: `public/icons/${name}`, omitBackground: false });
}
await b.close();
console.log('icons written');
