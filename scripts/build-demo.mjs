// Builds the demo into one self-contained HTML file (dist-demo/trucker-dialer.html).
import { build } from 'esbuild';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const out = await build({
  entryPoints: ['demo/entry.tsx'], bundle: true, minify: true, write: false, format: 'iife', jsx: 'automatic',
  define: { 'process.env.NODE_ENV': '"production"' }, target: 'es2020',
});
const js = out.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const css = readFileSync('app/globals.css', 'utf8');
mkdirSync('dist-demo', { recursive: true });
writeFileSync('dist-demo/trucker-dialer.html', `<title>Trucker Dialer</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap">
<style>${css}
.top, .grid { padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px)); }
.top { top: env(safe-area-inset-top, 0px); }
</style>
<div id="root"></div>
<script>${js}</script>
`);
console.log('dist-demo/trucker-dialer.html', Math.round((css.length + js.length) / 1024) + ' KB');
