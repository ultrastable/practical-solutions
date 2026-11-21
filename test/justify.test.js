// SPDX-License-Identifier: LicenseRef-Ultrastable-USL-1.0
// Copyright (c) 2026 Rowan Brad Quni-Gudzinas. Non-commercial use free; commercial use requires a license. See LICENSE.
// JUSTIFY-1: every connection the site suggests has a stated reason. These tests fail when an unjustified pair is shown: they apply the rules to the
// pairs a reader called prima facie absurd, and to everything in the committed view, ledger and link graph.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SOLUTIONS } from '../worker/src/solutions.js';
import { PROBLEMS } from '../worker/src/problems.js';
import { CONNECTIONS } from '../worker/src/connections.gen.js';
import { LINKS } from '../worker/src/links.gen.js';
import { connectionsPage, connectionsJson } from '../worker/src/connections.js';
import * as J from '../worker/src/justify.js';
import { panelReview, recount } from '../tools/connections.mjs';

const pb = new Map(PROBLEMS.map(p => [p.id, p])), prof = new Map(SOLUTIONS.map(s => [s.id, J.profile(s, pb)]));
const pair = (a, b) => J.judgeCombination(prof.get(a), prof.get(b), pb);
const ABSURD = [['chlorine', 'women-leaders'], ['helmets', 'kmc'], ['helmets', 'ors-zinc'], ['friendship-bench', 'helmets'], ['friendship-bench', 'pph-bundle'], ['latrine-subsidy', 'women-leaders'],
  ['kmc', 'women-leaders'], ['itn', 'pph-bundle'], ['immunisation', 'pph-bundle'], ['cash', 'friendship-bench'], ['cytisine', 'hypertension'], ['emissions-market', 'vita'], ['mobile-money', 'tarl']];

test('pairs with no stated mechanism are rejected, with the reason', () => {
  for (const [a, b] of ABSURD) { const r = pair(a, b); assert.equal(r.ok, false, `${a} + ${b} must not be suggested`); assert.ok(r.reason && r.code); }
});

test('every pair the rules accept names a mechanism, a population or channel, and sources', () => {
  let n = 0;
  for (const a of SOLUTIONS) for (const b of SOLUTIONS) if (a.id < b.id) {
    const r = pair(a.id, b.id); if (!r.ok) continue; n++;
    assert.ok(r.why.length > 60 && /act on|delivered through/.test(r.why), r.why);
    assert.ok(r.sources.length === 2 && r.sources.every(Boolean), 'both solutions are cited');
    assert.ok(r.value % 5 === 0 && r.value > 0 && r.value <= 100, 'value is a rounded rank, not a similarity');
  }
  assert.ok(n >= 10, 'the rules still find the real bundles (child survival, poverty, schools, maternity wards)');
  assert.equal(pair('kmc', 'pph-bundle').ok, true); assert.equal(pair('cash', 'graduation').ok, true); assert.equal(pair('tarl', 'deworming').ok, true);
});

test('another measure of the same problem is a missing link, not a discovery; an unmeasured open question is not shown', () => {
  const addr = [{ label: 'Unsafe drinking water', domain: 'Water' }];
  assert.equal(J.judgeTransfer({ title: 'Chlorinate' }, { label: 'Population using safely managed drinking-water services (%)', domain: 'Water' }, addr).ok, false);
  assert.equal(J.judgeTransfer({ title: 'Chlorinate' }, { label: 'Number of verified cases of killing of journalists', domain: 'Peace' }, addr).code, 'different-field');
  assert.equal(J.judgeBridge({ label: 'Hypertension control, men aged 30-79', domain: 'Health' }, { label: 'Hypertension control, women aged 30-79', domain: 'Health' }).ok, false);
  assert.equal(J.judgeFrontier({ label: 'Trachoma', m: null, note: '' }).ok, false);
  assert.equal(J.judgeFrontier({ label: 'Methane', m: { pace: 0.04, value: 30.04, year: 2024, status: 'getting worse' }, note: 'Methane emissions' }).ok, true);
});

test('the committed view shows only justified leads, with a reason, a tier and no raw similarity score', () => {
  const v = CONNECTIONS, all = ['transfer', 'combination', 'bridge', 'frontier'].flatMap(t => v[t]);
  assert.ok(v.combination.length > 0);
  for (const c of all) {
    assert.ok(c.why && c.why.length > 40, c.id); assert.ok(c.tier && Number.isInteger(c.value) && c.value % 5 === 0, c.id);
    assert.equal('score' in c, false, 'no raw score'); assert.doesNotMatch(c.why, /% alike|reads \d+% alike/);
    if (c.type !== 'combination' && c.type !== 'frontier') assert.ok(c.review && c.review.kept, c.id + ' rests on a judgement, so a model panel must have kept it');
  }
  for (const c of v.combination) { const [a, b] = c.members.map(m => m.id.slice(2)); assert.equal(pair(a, b).ok, true, `${a} + ${b} is shown but has no justification`); assert.ok(c.sources.length === 2); }
  for (const [a, b] of ABSURD) assert.equal(v.combination.some(c => c.members.map(m => m.id.slice(2)).sort().join() === [a, b].sort().join()), false, `${a} + ${b} must not appear`);
  const sorted = v.combination.map(c => c.value); assert.deepEqual(sorted, [...sorted].sort((x, y) => y - x), 'ranked by value');
  const html = connectionsPage(v), json = JSON.stringify(connectionsJson(v, 'https://x'));
  assert.doesNotMatch(html, /score \d|\d+% alike/); assert.doesNotMatch(json, /"score"|"sims"/); assert.match(html, /Why: /);
});

test('the committed ledger holds no open lead without a justification, and records why each rejected one was dropped', () => {
  const L = JSON.parse(readFileSync(new URL('../ledger/connections.json', import.meta.url), 'utf8'));
  for (const e of Object.values(L.entries)) {
    if (e.status === 'new' || e.status === 'standing') assert.ok(e.justification && e.justification.why, e.id + ' is open without a reason');
    if (/^unjustified/.test(e.reason || '')) assert.ok(e.rejected, e.id + ' was dropped without saying why');
  }
  assert.equal(L.totals.entered, Object.keys(L.entries).length + Object.values(L.retired || {}).reduce((a, b) => a + b, 0), 'every lead is accounted for');
});

test('links by meaning are kept inside a field or with shared terms, and show a band, never a percentage', () => {
  let n = 0;
  for (const [id, list] of Object.entries(LINKS.near)) for (const [o, b] of list) {
    n++; assert.ok(['very close', 'close', 'related'].includes(b), b);
    const [la, , da] = LINKS.nodes[id], [lb, , db] = LINKS.nodes[o];
    assert.ok(da === db || J.words(la).filter(w => J.words(lb).includes(w)).length >= 2, `${la} ~ ${lb} (${da} / ${db}) has no stated reason`);
  }
  assert.ok(n > 100);
});

test('a model panel can veto, silence keeps nothing that needs a model, and the reasons cannot invent figures', async () => {
  const mk = (id, type, needs) => ({ id, type, status: 'new', members: ['s:a', 'p:b'], score: 0.5, justification: { why: 'Because of a shared outcome.', tier: 'Good rationale', value: 60, needs_model: needs, how: 'x', sources: [] } });
  const L = { entries: { x: mk('x', 'combination', false), y: mk('y', 'transfer', true), z: mk('z', 'combination', false) }, retired: {} };
  const nodes = new Map([['s:a', { kind: 'solution', label: 'A', text: 'a' }], ['p:b', { kind: 'problem', label: 'B', text: 'b' }]]);
  const keep = JSON.stringify({ verdict: 'keep', reason: 'Plausible shared route; 45 percent is invented.' }), drop = JSON.stringify({ verdict: 'drop', reason: 'They only share a word.' });
  let calls = 0; await panelReview(L, nodes, async () => (++calls % 2 ? drop : keep));
  assert.equal(Object.values(L.entries).filter(e => e.status === 'dropped').length, 3, 'one dissenting member is enough to drop');
  assert.ok(Object.values(L.entries).every(e => /^unjustified/.test(e.reason) && e.rejected));
  const L2 = { entries: { y: mk('y', 'transfer', true) }, retired: {} };
  await panelReview(L2, nodes, async () => keep);
  assert.equal(L2.entries.y.panel.keep, true); assert.equal(L2.entries.y.panel.votes[0].reason, '', 'a figure the models invented is removed');
  const L3 = { entries: { y: mk('y', 'transfer', true) }, retired: {} };
  await panelReview(L3, nodes, async () => ''); // no model answers
  assert.equal(L3.entries.y.panel.decided, false); assert.equal(L3.entries.y.status, 'new'); recount(L3); assert.equal(L3.totals.open, 1);
});
