// SPDX-License-Identifier: LicenseRef-Ultrastable-USL-1.0
// Copyright (c) 2026 Rowan Brad Quni-Gudzinas. Non-commercial use free; commercial use requires a license. See LICENSE.
// CPU-LIMIT-1: the free plan kills a request at ~10 ms of CPU (Cloudflare error 1102). No page may run the Monte Carlo engine on the request path.
import test from 'node:test';
import assert from 'node:assert/strict';
import { MODELS } from '../worker/src/bca-models.js';
import { PRECOMPUTED } from '../worker/src/bca-precomputed.gen.js';
import { computeSeed, bcaFor, storeResults } from '../worker/src/bca.js';
import { buildCatalog } from '../worker/src/catalog.js';
import { SOLUTIONS } from '../worker/src/solutions.js';
import { route } from '../worker/src/site.js';

test('the precomputed seed estimates match the engine (regenerate with tools/bca_precompute.mjs)', () => {
  assert.deepEqual(Object.keys(PRECOMPUTED).sort(), Object.keys(MODELS).sort());
  for (const id of Object.keys(MODELS)) assert.deepEqual(JSON.parse(JSON.stringify(PRECOMPUTED[id])), JSON.parse(JSON.stringify(computeSeed(id))), id + ' is stale');
});
test('stored results are used for refined models, so the request path never scores', () => {
  const id = Object.keys(MODELS)[0], m = { ...MODELS[id], evidence: [...(MODELS[id].evidence || []), { node: 'x', source: 's', grade: 'C' }] };
  const state = { models: { [id]: m }, looked: { [id]: { at: '2026-01-01T00:00:00Z' } } };
  state.results = storeResults(state);
  assert.equal(Object.keys(state.results).length, 1);
  const t = process.hrtime.bigint(); const r = bcaFor(id, state); const ms = Number(process.hrtime.bigint() - t) / 1e6;
  assert.ok(r && r.wellby_per_1000_usd && ms < 5, 'took ' + ms + ' ms');
});
test('every page and data route renders within the CPU budget (catalogue build included)', () => {
  const t0 = process.hrtime.bigint(), c = buildCatalog({ problems: null, solutions: SOLUTIONS });
  const paths = ['/', '/problems', '/solutions', '/domains', '/for', '/context', '/country', '/compare', '/leads', '/method', '/unknowns', '/impact', '/changes', '/api', '/about', '/index.json', '/solutions.csv', '/llms.txt', '/sitemap.xml', ...c.sols.map(s => '/solutions/' + s.id), ...c.probs.map(p => '/problems/' + p.id)];
  const slow = [];
  // first pass is cold (JIT, lazy init in Node): 30 ms; second pass is the warm isolate: 8 ms. The Monte Carlo engine cost ~40 ms per estimate.
  for (const [pass, limit] of [[0, 30], [1, 8]]) for (const p of paths) { const t = process.hrtime.bigint(); const r = route(new URL('https://x.test' + p), c); const ms = Number(process.hrtime.bigint() - t) / 1e6; assert.ok(r, p + ' has no route'); if (ms > limit) slow.push(p + ' ' + ms.toFixed(1) + ' ms (pass ' + pass + ')'); }
  assert.deepEqual(slow, [], 'routes over the CPU budget');
  assert.ok(Number(process.hrtime.bigint() - t0) / 1e6 < 400, 'catalogue and all routes together are too slow');
});
