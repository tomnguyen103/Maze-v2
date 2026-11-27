// Gzip size of the canvas-path candidate. esbuild is not installed (vite 8 ships rolldown/oxc), so minify with rolldown.
import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { minify } from 'rolldown/utils';

const src = readFileSync(new URL('./art.js', import.meta.url), 'utf8');
const { code } = await minify('art.js', src, { module: true, compress: true, mangle: true });
console.log(JSON.stringify({
  raw: Buffer.byteLength(src),
  minified: Buffer.byteLength(code),
  gzip: gzipSync(code, { level: 9 }).length
}));
