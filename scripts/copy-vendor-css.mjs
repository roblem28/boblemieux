// Copies maplibre-gl's stylesheet into public/vendor so the weather page can
// link it directly.
//
// It used to be imported in _app.js, which made it global: 64,602 of the
// 121,665 raw bytes of render-blocking CSS on all 33 pages came from a library
// used on exactly one route. The pages router only permits node_modules CSS
// imports from _app, so the fix is to serve it as a static asset and <link> it
// from the one page that needs it.
//
// Copied at build time rather than committed so it cannot drift from the
// installed maplibre-gl version.
import { copyFileSync, mkdirSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const src = join(dirname(require.resolve('maplibre-gl/package.json')), 'dist', 'maplibre-gl.css');
const outDir = join(process.cwd(), 'public', 'vendor');

mkdirSync(outDir, { recursive: true });
copyFileSync(src, join(outDir, 'maplibre-gl.css'));
console.log(`vendor css: maplibre-gl.css (${statSync(src).size} bytes)`);
