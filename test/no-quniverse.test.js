// QUNIVERSE-CUT-1: the Quniverse Cloudflare account and QNFO fleet are assumed gone. No runtime code or config may name them.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
const SKIP = new Set(['node_modules', '.git', 'vendor', 'ledger']);
const RX = /(edb167b78c9fb901ea5bca3ce58ccc4b|q08\.workers\.dev|https?:\/\/[\w.-]*(qnfo|q08|qwav)[\w.-]*|QNFO\/qnfo|\bqnfo-[a-z0-9-]+)/i;
const EXT = /\.(m?js|json|jsonc|ya?ml|toml|sh|py)$/;
function walk(d, out = []) {
  for (const n of readdirSync(d)) {
    if (SKIP.has(n)) continue;
    const p = path.join(d, n);
    if (statSync(p).isDirectory()) walk(p, out); else if (EXT.test(n) && !/no-quniverse\.test\.js$/.test(n)) out.push(p);
  }
  return out;
}
test('no runtime reference to the Quniverse account or QNFO resources', () => {
  const hits = [];
  for (const f of walk(ROOT)) readFileSync(f, 'utf8').split('\n').forEach((l, i) => { if (RX.test(l)) hits.push(`${path.relative(ROOT, f)}:${i + 1}`); });
  assert.deepEqual(hits, []);
});
