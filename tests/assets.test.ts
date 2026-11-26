import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { MUSIC_FILES } from '../src/audio/audio';

const ROOT = join(__dirname, '..');
const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [relative(ROOT, p)];
  });

describe('assets', () => {
  const doc = readFileSync(join(ROOT, 'ASSETS.md'), 'utf8');
  it('every file in public/ and src/assets/ has a row in ASSETS.md with a source and licence', () => {
    const files = [...walk(join(ROOT, 'public')), ...walk(join(ROOT, 'src', 'assets'))];
    expect(files.length).toBeGreaterThan(0);
    for (const f of files) {
      const row = doc.split('\n').find((l) => l.startsWith('|') && l.includes(`\`${f}\``));
      expect(row, `${f} missing from ASSETS.md`).toBeTruthy();
      const cells = row!.split('|').map((c) => c.trim()).filter(Boolean);
      expect(cells.length, `${f} row needs what/source/licence`).toBeGreaterThanOrEqual(4);
    }
  });
  it('every music file the code expects is shipped', () => {
    const files = walk(join(ROOT, 'public'));
    for (const f of Object.values(MUSIC_FILES)) expect(files).toContain(join('public', 'audio', f!));
  });
});
