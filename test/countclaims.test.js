// SPDX-License-Identifier: LicenseRef-Ultrastable-USL-1.0
// Copyright (c) 2026 Rowan Brad Quni-Gudzinas. Non-commercial use free; commercial use requires a license. See LICENSE.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildCatalog } from '../worker/src/catalog.js';
import { SOLUTIONS } from '../worker/src/solutions.js';
import { home } from '../worker/src/pages.js';
import { indexJson, problemCounts } from '../worker/src/catalogue-pages.js';
import { check, displayed } from '../ps/countclaims.js';
import { run } from '../ps/impactloop.js';
const c = buildCatalog({ problems: null, solutions: SOLUTIONS }), O = 'https://x.test';
const page = () => { const r = home(c, O); return typeof r === 'string' ? r : r.body || r.html || JSON.stringify(r); };
const data = () => ({ catalogue: JSON.parse(JSON.stringify(indexJson(c, O))), problems: c.probs.map(p => ({ id: p.id, solutions: (c.byProblem[p.id] || []).map(s => s.id) })) });
test('every displayed problem count equals the data behind its linked page', () => {
  assert.deepEqual(check(page(), data()), []);
});
test('a count that drifts is reported', () => {
  const d = data(); d.catalogue.count += 1;
  assert.ok(check(page(), d).some(f => /problems in the catalogue/.test(f.label)));
});
test('sought counts the catalogue, so the label cannot read 0 beside hundreds of open problems', () => {
  const pc = problemCounts(c), shown = displayed(page());
  assert.equal(shown['problems still seeking a solution'].value, pc.sought);
  assert.ok(pc.catalogue === 0 || pc.sought > 0 || pc.catalogue_sought === 0);
});
test('the impact loop uses the sought count as a lever', () => {
  const o = run({ cat: c, reach: null, cap: 50 });
  assert.equal(o.readings['impact.problems_seeking'], problemCounts(c).sought);
  assert.ok(o.items.some(i => i.key.startsWith('seek:')) || problemCounts(c).sought === 0);
});
