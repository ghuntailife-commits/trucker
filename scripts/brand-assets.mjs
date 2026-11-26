// Turns the Dispatch logo files (public/brand/logo) into data URIs the app and the one-file demo can both use.
import { readFileSync, writeFileSync } from 'node:fs';
const svg = f => 'data:image/svg+xml;base64,' + readFileSync(`public/brand/${f}`).toString('base64');
const out = {
  markDay: svg('logo/dispatch-mark-small.svg'), markNight: svg('logo/dispatch-mark-small-night.svg'),
  wordDay: svg('logo/dispatch-wordmark.svg'), wordNight: svg('logo/dispatch-wordmark-night.svg'),
  lockupDay: svg('logo/dispatch-lockup.svg'), lockupNight: svg('logo/dispatch-lockup-night.svg'),
  favicon: svg('favicon/favicon.svg'),
};
writeFileSync('app/ui/brandAssets.ts', `// Made by scripts/brand-assets.mjs from public/brand. Do not edit by hand.\nexport const BRAND = ${JSON.stringify(out, null, 1)} as const;\n`);
console.log('brand assets', Object.keys(out).length);
