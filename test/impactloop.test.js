// SPDX-License-Identifier: LicenseRef-Ultrastable-USL-1.0
// Copyright (c) 2026 Rowan Brad Quni-Gudzinas. Non-commercial use free; commercial use requires a license. See LICENSE.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildCatalog } from '../worker/src/catalog.js';
import { SOLUTIONS } from '../worker/src/solutions.js';
import { readings, metrics, run, cooldownKeys } from '../ps/impactloop.js';
import { COOLDOWN_DAYS } from '../tools/agent.mjs';
const cat = buildCatalog({ problems: null, solutions: SOLUTIONS });
test('readings come from the catalogue and match the /impact page counts', () => {
  const r = readings(cat, { views: 7879 });
  assert.equal(r['impact.ready_share'], Math.round(1000 * cat.sols.filter(s => s.impl && s.impl.score >= 7).length / cat.sols.length) / 1000);
  assert.equal(r['impact.held_back'], cat.sols.filter(s => s.impl && !s.impl.practical).length);
  assert.equal(r['reach.views_30d'], 7879); assert.equal(readings(cat, null)['reach.views_30d'], undefined);
});
test('targets ratchet upward so a met target never ends the loop', () => {
  const m = metrics({ 'reach.views_30d': 7879, 'impact.ready_share': 0.625 }, {});
  assert.ok(m.find(x => x.id === 'reach.views_30d').target > 7879); assert.ok(m.find(x => x.id === 'impact.ready_share').target > 0.625);
});
test('run files bounded items with predictions, one per key, and never one that is already open', () => {
  const o = run({ cat, reach: { views: 7879 }, cap: 3 });
  assert.ok(o.items.length > 0 && o.items.length <= 3); assert.ok(o.items.every(i => /within 168 h$/.test(i.prediction) && i.key));
  const again = run({ cat, reach: { views: 7879 }, open: o.items.map(i => i.key), cap: 3 });
  assert.ok(again.items.every(i => !o.items.some(x => x.key === i.key)));
});

test('an issue the agent exhausted stays out of the loop for the cooldown, then may be filed again', () => {
  const now = Date.parse('2026-11-28T12:00:00Z');
  const mk = (key, reason, closedAt) => ({ body: `x\nimpact-key: ${key}`, stateReason: reason, closedAt });
  const closed = [mk('seek:a', 'NOT_PLANNED', '2026-11-27T00:00:00Z'), mk('seek:b', 'COMPLETED', '2026-11-27T00:00:00Z'), mk('seek:c', 'NOT_PLANNED', '2026-11-10T00:00:00Z')];
  assert.deepEqual(cooldownKeys(closed, now, COOLDOWN_DAYS), ['seek:a']);
  assert.deepEqual(cooldownKeys(undefined, now), []);
});
