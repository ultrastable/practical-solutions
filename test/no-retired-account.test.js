// SPDX-License-Identifier: LicenseRef-Ultrastable-USL-1.0
// Copyright (c) 2026 Rowan Brad Quni-Gudzinas. Non-commercial use free; commercial use requires a license. See LICENSE.
// SINGLE-ACCOUNT-1 (Rowan 2026-11-21: "assume the Quniverse doesn't even exist anymore"): nothing in this repository may depend on the
// retired Cloudflare account. Fails on its account id or workers.dev subdomain anywhere outside the listed records.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const FORBIDDEN = /edb167b78c9fb901ea5bca3ce58ccc4b|q08\.workers\.dev/;
const SKIP_DIRS = new Set(['.git', 'node_modules', 'vendor']);
const ALLOW = new Set([
  'test/no-retired-account.test.js',  // this rule names the pattern
  'test/bootstrap.test.js',           // asserts the retired account is refused
  'ledger/state.json',                // a dated export (2026-11-13) whose url field records where it was read from
]);

function* walk(dir) {
  for (const n of readdirSync(dir)) {
    const p = path.join(dir, n);
    if (statSync(p).isDirectory()) { if (!SKIP_DIRS.has(n)) yield* walk(p); }
    else yield p;
  }
}

test('no file depends on the retired Cloudflare account', () => {
  const hits = [];
  for (const p of walk(ROOT)) {
    const rel = path.relative(ROOT, p).split(path.sep).join('/');
    if (ALLOW.has(rel)) continue;
    let t; try { t = readFileSync(p, 'utf8'); } catch { continue; }
    if (FORBIDDEN.test(t)) hits.push(rel);
  }
  assert.deepEqual(hits, []);
});
