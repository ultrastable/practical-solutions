// SPDX-License-Identifier: LicenseRef-Ultrastable-USL-1.0
// Copyright (c) 2026 Rowan Brad Quni-Gudzinas. Non-commercial use free; commercial use requires a license. See LICENSE.
import test from 'node:test';
import assert from 'node:assert/strict';
import { check, renderEntry, renderImpl, insertBefore, MORE_ANCHOR, IMPL_ANCHOR } from '../ps/grow.js';
const problem = { id: 'tb', title: 'Tuberculosis' }, hits = [{ title: 'Community screening for TB', year: 2022, url: 'https://doi.org/10.1/x', abstract: 'Community-based screening in 12 districts found 34 more cases per 100,000. The programme was scaled up nationally and was cost-effective.' }];
const draft = over => JSON.stringify({ id: 'tb-community-screening-x', title: 'Screen communities for TB', claim: 'Community screening finds more cases.', design: 'review', verdict: 'works', evidence: [{ source: 0, finding: 'Screening in 12 districts found 34 more cases per 100,000.' }], works_where: 'District programmes', takes: 'Trained screeners', who: 'National TB programme', first_test: 'Screen one district', limits: 'Cases found are not deaths averted', implementability: { cost: 'low', cost_note: 'cost-effective in the review', adoption: 'scaled', channel: 'national TB programme', actors: 'ministry of health' }, ...over });
test('a draft whose figures are all in the abstract is accepted and renders valid JS', async () => {
  const r = check(draft(), { problem, hits }); assert.ok(r.ok, r.why); assert.equal(r.entry.verified, 'not yet checked against the source'); assert.deepEqual(r.entry.problem_ids, ['tb']);
  const arr = eval('[' + renderEntry(r.entry) + ']'); assert.equal(arr[0].id, r.entry.id); assert.equal(arr[0].evidence[0].src.includes('doi.org'), true);
  assert.ok(eval('({' + renderImpl(r.entry.id, r.impl) + '})')[r.entry.id].cost);
});
test('a figure the abstract does not contain is refused, never repaired', () => {
  const r = check(draft({ evidence: [{ source: 0, finding: 'Screening cut deaths by 57%.' }] }), { problem, hits }); assert.equal(r.ok, false); assert.match(r.why, /57/);
});
test('adoption and cost claims the abstracts do not support are capped', () => {
  const h = [{ ...hits[0], abstract: 'A small trial in 12 districts found 34 more cases per 100,000.' }];
  const r = check(draft(), { problem, hits: h }); assert.ok(r.ok); assert.equal(r.impl.adoption, 'trial-only'); assert.equal(r.impl.cost, 'medium'); assert.ok(r.capped);
});
test('duplicate ids, unknown sources and non-JSON are refused', () => {
  assert.equal(check(draft(), { problem, hits, ids: ['tb-community-screening-x'] }).ok, false);
  assert.equal(check(draft({ evidence: [{ source: 5, finding: 'x' }] }), { problem, hits }).ok, false);
  assert.equal(check('sorry, I cannot', { problem, hits }).ok, false);
});
test('insertion needs its anchor exactly once', () => {
  assert.equal(insertBefore('a,\n];\n', MORE_ANCHOR, 'X'), 'a,X\n];\n');
  assert.equal(insertBefore('none', IMPL_ANCHOR, 'X'), null); assert.equal(insertBefore(IMPL_ANCHOR + IMPL_ANCHOR, IMPL_ANCHOR, 'X'), null);
});
