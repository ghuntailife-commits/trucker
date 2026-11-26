// Bundles and runs scripts/real-seed.ts (TypeScript) with esbuild.
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
await build({ entryPoints: ['scripts/real-seed.ts'], bundle: true, platform: 'node', format: 'esm', outfile: 'realdata/.seed.mjs', logLevel: 'warning' });
execFileSync(process.execPath, ['realdata/.seed.mjs'], { stdio: 'inherit' });
