import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';

const budgets = [
  ['core', 'dist/index.js', 10_000],
  ['element', 'dist/element/index.js', 50_000],
  ['hls', 'dist/hls/index.js', 3_000],
];

let failed = false;
for (const [name, file, budget] of budgets) {
  const bytes = gzipSync(readFileSync(file)).byteLength;
  const status = bytes <= budget ? 'ok' : 'over';
  globalThis.process.stdout.write(
    `${name}: ${bytes} B gzip (budget ${budget} B, ${status})\n`,
  );
  if (bytes > budget) {
    failed = true;
  }
}

if (failed) {
  throw new Error('One or more package size budgets were exceeded.');
}
