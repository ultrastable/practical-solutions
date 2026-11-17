// SPDX-License-Identifier: LicenseRef-Ultrastable-USL-1.0
// Copyright (c) 2026 Rowan Brad Quni-Gudzinas. Non-commercial use free; commercial use requires a license. See LICENSE.
// Claims are code: every sentence on /method is a statement with a probe of the real behaviour, and the page holds nothing else.
import test from 'node:test';
import assert from 'node:assert/strict';
import { proof, describe } from '../vendor/ultrastable/core/statements/index.js';
import { STATEMENTS, CTX } from '../worker/src/method-claims.js';
import { route } from '../worker/src/site.js';
import { buildCatalog } from '../worker/src/catalog.js';
import { SOLUTIONS } from '../worker/src/solutions.js';

const cat = buildCatalog({ problems: null, solutions: SOLUTIONS });
const html = async () => route(new URL('https://x.test/method'), cat).text();

test('every statement on /method passes its probe and the page holds no unbound prose', async () => {
  const p = await proof(STATEMENTS, await html(), CTX);
  assert.deepEqual(p.failed, [], 'a published statement is false');
  assert.deepEqual(p.audit, { ok: true, unbound: [], unknown: [], unrendered: [], problems: [] });
  assert.equal(p.passed, STATEMENTS.length);
});
test('a sentence added to the page without a statement fails the audit', async () => {
  const bad = (await html()).replace('<h1>Method</h1>', '<h1>Method</h1><p>It is always right.</p>');
  assert.equal((await proof(STATEMENTS, bad, CTX)).audit.ok, false);
});
test('the numbers on the page come from the engine settings', async () => {
  const t = describe(STATEMENTS, CTX).find(s => s.id === 'bca-uncertainty').text;
  assert.match(t, new RegExp(CTX.ENGINE.draws.toLocaleString('en')));
  const changed = describe(STATEMENTS, { ...CTX, ENGINE: { ...CTX.ENGINE, draws: 4000 } }).find(s => s.id === 'bca-uncertainty').text;
  assert.match(changed, /4,000/);
});
test('/claims.json lists every statement', async () => {
  const j = await route(new URL('https://x.test/claims.json'), cat).json();
  assert.equal(j.statements.length, STATEMENTS.length);
});
