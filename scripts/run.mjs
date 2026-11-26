// Runs a TypeScript script through Vite's module runner: node scripts/run.mjs scripts/x.ts
import { runnerImport } from 'vite';
import { resolve } from 'node:path';
await runnerImport(resolve(process.argv[2]));
