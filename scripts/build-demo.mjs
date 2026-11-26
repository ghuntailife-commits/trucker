// Builds the demo into one self-contained HTML file (dist-demo/trucker-dialer.html).
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';

// With realdata/seed.json present (git-ignored, made by scripts/real-seed.ts) the demo shows the agent's real sheet.
// Pass --fake to build with made-up contacts anyway.
const real = existsSync('realdata/seed.json') && !process.argv.includes('--fake');
const realSeed = {
  name: 'real-seed',
  setup(b) {
    b.onLoad({ filter: /realSeed\.ts$/ }, () => real
      ? { contents: `export const REAL_SEED = ${readFileSync('realdata/seed.json', 'utf8')};`, loader: 'js' }
      : undefined);
  },
};

const out = await build({
  entryPoints: ['demo/entry.tsx'], bundle: true, minify: true, write: false, format: 'iife', jsx: 'automatic',
  define: { 'process.env.NODE_ENV': '"production"' }, target: 'es2020', plugins: [realSeed],
});
const js = out.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const css = readFileSync('app/globals.css', 'utf8');
mkdirSync('dist-demo', { recursive: true });
const fav = 'data:image/svg+xml;base64,' + readFileSync('public/brand/favicon/favicon.svg').toString('base64');
writeFileSync('dist-demo/trucker-dialer.html', `<title>Dispatch</title>
<link rel="icon" href="${fav}" type="image/svg+xml">
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@500;600;700&family=Source+Serif+4:opsz,wght@8..60,500;8..60,600&display=swap">
<style>${css}
.top, .hero, .work, .foot, .home { padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px)); }
.top { top: env(safe-area-inset-top, 0px); }
</style>
<div id="root"></div>
<script>${js}</script>
`);
console.log(real ? 'REAL DATA build' : 'made-up data build', 'dist-demo/trucker-dialer.html', Math.round((css.length + js.length) / 1024) + ' KB');
