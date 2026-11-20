// SPDX-License-Identifier: LicenseRef-Ultrastable-USL-1.0
// Copyright (c) 2026 Rowan Brad Quni-Gudzinas. Non-commercial use free; commercial use requires a license. See LICENSE.
import test from 'node:test';
import assert from 'node:assert/strict';
import { freshness, freshnessResponse, ENSEMBLE_MAX_AGE_H } from '../worker/src/freshness.js';

const at = '2026-11-18T00:00:00Z';
test('a ledger inside its cadence is fresh and answers 200', () => {
  const f = freshness(Date.parse(at) + 3600e3, { at });
  assert.equal(f.ok, true); assert.equal(f.bundles[0].state, 'fresh'); assert.equal(f.bundles[0].age_h, 1);
});
test('a ledger older than its cadence is stale and answers 503', () => {
  const f = freshness(Date.parse(at) + (ENSEMBLE_MAX_AGE_H + 1) * 3600e3, { at });
  assert.equal(f.ok, false); assert.deepEqual(f.stale, ['ensemble-ledger']);
});
test('a ledger with no readable clock is unmeasured, never fresh', () => {
  assert.equal(freshness(Date.now(), {}).ok, false);
});
test('the response status follows the state', async () => {
  const far = (await freshnessResponse(Date.now() + 365 * 24 * 3600e3));
  assert.equal(far.status, 503); assert.equal((await far.json()).stale[0], 'ensemble-ledger');
});

test('the public tenant Worker serves /api/freshness itself, so the core probe of the front end never reads 404', async () => {
  const { default: w } = await import('../worker/src/tenant.js');
  const m = new Map(); const env = { STATE: { get: async k => m.get(k) ?? null, put: async (k, v) => { m.set(k, v); } } };
  const r = await w.fetch(new Request('https://tenant-ps-web.ultrastable.workers.dev/api/freshness'), env);
  assert.ok([200, 503].includes(r.status), 'status ' + r.status);
  const f = await r.json();
  assert.deepEqual(f.bundles.map(b => b.id).slice(0, 2), ['ensemble-ledger', 'releases']);
  assert.equal(r.status === 200, f.ok);
});
