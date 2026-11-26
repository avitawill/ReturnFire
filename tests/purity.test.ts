import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const SIM = join(__dirname, '..', 'src', 'sim');
const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : p.endsWith('.ts') ? [p] : [];
  });

describe('simulation purity', () => {
  it('no file in src/sim imports three or touches browser globals or wall-clock randomness', () => {
    const bad: string[] = [];
    for (const f of files(SIM)) {
      const src = readFileSync(f, 'utf8').replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
      if (/from\s+['"]three/.test(src) || /import\(\s*['"]three/.test(src)) bad.push(`${f}: imports three`);
      if (/from\s+['"]\.\.?\/(\.\.\/)*(render|audio|input|ui)\b/.test(src)) bad.push(`${f}: imports a client module`);
      for (const g of ['window', 'document', 'navigator', 'requestAnimationFrame', 'performance', 'localStorage'])
        if (new RegExp(`\\b${g}\\b`).test(src)) bad.push(`${f}: uses ${g}`);
      if (/Math\.random|Date\.now|new Date\(/.test(src)) bad.push(`${f}: non-deterministic source`);
    }
    expect(bad).toEqual([]);
  });

  it('src/sim typechecks without the DOM library', () => {
    expect(() =>
      execFileSync(process.execPath, [join(__dirname, '..', 'node_modules', 'typescript', 'bin', 'tsc'), '-p', 'tsconfig.sim.json'], {
        cwd: join(__dirname, '..'),
        stdio: 'pipe',
      }),
    ).not.toThrow();
  });
});
