// SPDX-License-Identifier: LicenseRef-Ultrastable-USL-1.0
// Copyright (c) 2026 Rowan Brad Quni-Gudzinas. Non-commercial use free; commercial use requires a license. See LICENSE.
import test from 'node:test';
import assert from 'node:assert/strict';
import { GOALS, KNOBS, readings, snapshot, goalsTick, knob, TENANT } from '../worker/src/goals.js';

const DAY = 86400e3, t0 = Date.parse('2026-11-18T00:00:00Z');
const mem = () => { const m = new Map(); return { get: async k => m.has(k) ? m.get(k) : null, put: async (k, v) => { m.set(k, v); }, delete: async k => { m.delete(k); }, m }; };
const sol = (o = {}) => ({ checkable: true, ver: { status: 'verified' }, impl: { score: 8 }, bca: { wellby_per_1000_usd: { p50: 10 } }, ...o });

test('every goal id and knob id is namespaced to the tenant and knobs point at a real goal', () => {
  assert.ok(GOALS.every(g => g.id.startsWith(TENANT + '.')));
  assert.ok(KNOBS.every(k => k.id.startsWith(TENANT + '.') && GOALS.some(g => g.id === k.goal_id && g.level === 'target') && k.min <= k.value && k.value <= k.max));
});
test('readings come from the catalog; one that cannot be computed is left out, never zero', () => {
  const cat = { sols: [sol(), sol({ ver: { status: 'mismatch' } }), sol({ impl: { score: 3 }, bca: null }), sol({ checkable: false })] };
  const r = readings({ cat, reach: { views: 42 }, hist: [{ at: t0 - 8 * DAY, n: 1 }], backend: { sent: 7 }, now: t0 });
  assert.equal(r['ps.supply.total'], 4); assert.equal(r['ps.supply.new_7d'], 3);
  assert.equal(r['ps.trust.verified'], 0.667); assert.equal(r['ps.impact.ready'], 0.75); assert.equal(r['ps.impact.bca'], 0.75); assert.equal(r['ps.impact.wellby'], 10);
  assert.equal(r['ps.reach.views_7d'], 42); assert.equal(r['ps.reach.contacts'], 7);
  assert.equal(readings({ cat, hist: [], now: t0 })['ps.supply.new_7d'], undefined);  // no snapshot a week old yet
});
test('snapshot keeps one count a day and drops anything older than 30 days', () => {
  const h = snapshot([{ at: t0 - 40 * DAY, n: 1 }, { at: t0 - 2 * DAY, n: 3 }], 4, t0);
  assert.deepEqual(h.map(x => x.n), [3, 4]); assert.equal(snapshot(h, 5, t0 + 3600e3).length, 2);
});
test('the tick stores the public feed and the knob values core chose; a core outage is recorded, not thrown', async () => {
  const store = mem(), cat = { sols: [sol()] };
  await goalsTick({ store, cat, reach: { views: 1 }, now: t0, fetchFn: async () => ({ ok: true, json: async () => ({ 'ps.verify.per_tick': { value: 5 } }) }) });
  const f = JSON.parse(store.m.get('goals:feed')); assert.equal(f.tenant, 'ps'); assert.equal(f.goals.length, GOALS.length); assert.equal(f.readings['ps.supply.total'], 1);
  assert.equal(knob(JSON.parse(store.m.get('goals:knobs')), 'ps.verify.per_tick', 3), 5);
  await goalsTick({ store, cat, now: t0 + DAY, fetchFn: async () => { throw new Error('down'); } });
  assert.equal(store.m.get('goals:error'), 'down'); assert.equal(knob(JSON.parse(store.m.get('goals:knobs')), 'ps.verify.per_tick', 3), 5);  // last good value stays
  assert.equal(knob({}, 'ps.verify.per_tick', 3), 3);
});
