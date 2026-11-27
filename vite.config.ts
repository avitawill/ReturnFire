import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { defineConfig, type Plugin } from 'vite';

/**
 * Writes dist/sw.js after the build: a service worker that precaches every
 * file of this version, so the installed game works offline. The cache name
 * is a hash of the contents, so a new deploy replaces the old cache.
 */
function offline(): Plugin {
  let outDir = 'dist';
  return {
    name: 'mivtza-offline',
    apply: 'build',
    configResolved(c) {
      outDir = c.build.outDir;
    },
    closeBundle() {
      const walk = (d: string): string[] => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]));
      const files = walk(outDir)
        .map((f) => relative(outDir, f).split('\\').join('/'))
        .filter((f) => f !== 'sw.js' && !f.endsWith('.map'));
      const hash = createHash('sha256');
      for (const f of files.sort()) hash.update(f).update(readFileSync(join(outDir, f)));
      const version = hash.digest('hex').slice(0, 12);
      const list = JSON.stringify(['./', ...files.map((f) => `./${f}`)]);
      writeFileSync(
        join(outDir, 'sw.js'),
        `// Generated at build time. Precaches the whole game for offline play.
const CACHE = 'mivtza-${version}';
const FILES = ${list};
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k.startsWith('mivtza-') && k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  // Cache first (the files are versioned), falling back to the network.
  e.respondWith(caches.match(req, { ignoreSearch: req.mode === 'navigate' }).then((hit) => hit || fetch(req)));
});
`,
      );
    },
  };
}

// Relative base so the build works from any subfolder (GitHub Pages serves it under /ReturnFire/).
export default defineConfig({
  base: './',
  plugins: [offline()],
  build: { target: 'es2022', chunkSizeWarningLimit: 1200 },
  server: { host: '127.0.0.1', port: 5173 },
  preview: { host: '127.0.0.1', port: 4173 },
});
