// SPDX-License-Identifier: LicenseRef-Ultrastable-USL-1.0
// Copyright (c) 2026 Rowan Brad Quni-Gudzinas. Non-commercial use free; commercial use requires a license. See LICENSE.
// PIPELINE-1: stage counts, the advocate queue, the evidence hand-off to discovery, the stall probe and the page that shows them.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { solvedSet, candidatesFor, selectQueue, counts, record, delta, health, pass, canonicalSolved, RULES, DAY, STAGES, SUBSTANTIVE } from '../ps/pipeline.js';
import { search, queryFor, urlFor } from '../tools/evidence.mjs';
import { frontierSeed, seedText, proposePrompt } from '../tools/discover.mjs';
import { build } from '../tools/pipeline.mjs';
import { pipelineBody, pipelineData } from '../worker/src/pipeline.js';
import { PIPELINE } from '../worker/src/pipeline.gen.js';
import { SOLUTIONS } from '../worker/src/solutions.js';
import { route } from '../worker/src/site.js';
import { buildCatalog } from '../worker/src/catalog.js';

const T = Date.parse('2026-06-01T00:00:00Z');
const scan = { entries: [
  { id: 'a', code: 'X.A', title: 'Alpha deaths', published: true, rank: 1, lower: true, m: { status: 'getting worse' } },
  { id: 'b', code: 'X.B', title: 'Beta deaths', published: true, rank: 2, lower: true },
  { id: 'c', code: 'X.C', title: 'Gamma deaths, female', published: true, rank: 3, lower: true },
  { id: 'd', code: 'X.D', title: 'Delta deaths', published: true, rank: 4, lower: true },
  { id: 'u', code: 'X.U', title: 'Unranked', published: true, rank: null, lower: true } ] };
const conns = { entries: { t1: { type: 'transfer', status: 'new', members: ['s:kmc', 'p:b'] }, f1: { type: 'frontier', status: 'new', members: ['p:d'], via: 's:cash' }, x: { type: 'transfer', status: 'dropped', members: ['s:itn', 'p:a'] } } };

test('a hand-checked problem and its scan twin count as one solved problem', () => {
  const problems = [{ id: 'cur', ind: 'X.A' }], sc = { entries: [{ id: 'a', code: 'X.A' }, { id: 'b', code: 'X.B' }] };
  const solved = solvedSet({ problems, scan: sc, solutions: [{ problem_ids: ['cur'] }, { problem_ids: ['b'] }] });
  assert.deepEqual([...solved].sort(), ['a', 'b', 'cur']);
  assert.equal(canonicalSolved(problems, sc, solved), 2);
});
test('the graph suggests a solution for a problem from transfer and frontier leads, never from a dropped one', () => {
  assert.deepEqual(candidatesFor(conns, 'b'), ['kmc']); assert.deepEqual(candidatesFor(conns, 'd'), ['cash']); assert.deepEqual(candidatesFor(conns, 'a'), []);
});
test('the queue takes ranked unsolved problems, skips breakdowns, and puts a problem with a graph suggestion first', () => {
  const q = selectQueue({ scan, solved: new Set(), connections: conns, now: T, rules: { ...RULES, queue_size: 3 } });
  assert.deepEqual(q.queue.map(x => x.id), ['b', 'd', 'a']);          // 'c' is a breakdown, 'u' is unranked
  assert.ok(q.queue.every(x => x.advocate === 'advocate:' + x.id && x.duty));
  assert.deepEqual(q.queue[0].candidates, ['kmc']);
});
test('an advocate that produces no move steps aside, cools, and the next problem takes the slot; a move keeps it', () => {
  const rules = { ...RULES, queue_size: 1 };
  const q1 = selectQueue({ scan, solved: new Set(), connections: null, now: T, rules });
  const late = T + (RULES.patience_days + 1) * DAY;
  const q2 = selectQueue({ scan, solved: new Set(), connections: null, prev: q1, now: late, rules });
  assert.equal(q2.queue[0].id, 'b'); assert.ok(q2.cooldown.a); assert.ok(q2.log.some(x => /stepped aside/.test(x.event)));
  const moved = selectQueue({ scan, solved: new Set(), connections: null, evidence: { items: { a: { hits: [{ title: 't' }] } } }, prev: q1, now: late, rules });
  assert.equal(moved.queue[0].id, 'a');                                  // found evidence, so it keeps the slot
  const cooled = selectQueue({ scan, solved: new Set(), connections: null, prev: q2, now: late + DAY, rules });
  assert.ok(!cooled.queue.some(x => x.id === 'a'));
  const solved = selectQueue({ scan, solved: new Set(['a']), connections: null, prev: q1, now: T + DAY, rules });
  assert.equal(solved.queue[0].id, 'b'); assert.ok(solved.log.some(x => x.event === 'solved'));
});
test('a proposal made from a queued problem counts as that advocate\'s move', () => {
  const rules = { ...RULES, queue_size: 1 }, q1 = selectQueue({ scan, solved: new Set(), connections: null, now: T, rules });
  const prev = { queue: [{ ...q1.queue[0], proposed: new Date(T + 13 * DAY).toISOString() }] };
  assert.equal(selectQueue({ scan, solved: new Set(), connections: null, prev, now: T + 20 * DAY, rules }).queue[0].id, 'a');
});
test('counts say not measured (null) for a ledger that does not exist, never zero', () => {
  const c = counts({ scan, solutions: [], solved: new Set(), queue: [] });
  assert.equal(c.leads, null); assert.equal(c.evidence_leads, null); assert.equal(c.bca, null); assert.equal(c.syntheses_verified, null); assert.equal(c.solutions, 0);
});
test('only counts that rose are moves, intake is inflow, and an unmeasured side is skipped', () => {
  const d = delta({ solutions: 3, intake: 10, verified: 4, bca: null, leads: 5 }, { solutions: 5, intake: 90, verified: 3, bca: 6, leads: 50 });
  assert.equal(d.substantive, 2); assert.equal(d.intake, 80); assert.deepEqual(d.by, { solutions: 2, intake: 80 });
  assert.ok(!SUBSTANTIVE.includes('leads') && !SUBSTANTIVE.includes('queue') && !SUBSTANTIVE.includes('intake'));
});
test('the probe: inflow alone is a stall, three substantive moves pass, a quiet run is idle, little history is warming', () => {
  const base = { solutions: 1, intake: 1, evidence_items: 1 };
  let h = record([], base, T - 6 * DAY); h = record(h, { ...base, intake: 400 }, T - 3 * DAY); h = record(h, { ...base, intake: 900 }, T);
  const stalled = health(h, T); assert.equal(stalled.status, 'stalled'); assert.equal(pass(stalled), false); assert.equal(stalled.intake_moves, 899);
  const ok = health(record(h, { ...base, solutions: 4, intake: 900 }, T + 1), T + 1); assert.equal(ok.status, 'ok'); assert.equal(ok.substantive_moves, 3);
  assert.equal(health(record([], base, T - DAY), T).status, 'warming'); assert.equal(pass(health(record([], base, T - DAY), T)), true);
  const stale = record(record(record([], base, T - 6 * DAY), { ...base, solutions: 9 }, T - 5.5 * DAY), { ...base, solutions: 9 }, T);
  assert.equal(health(stale, T).status, 'stalled'); assert.match(health(stale, T).reasons.join(' '), /no substantive move for/);
});
test('Europe PMC search: queries the problem wording, keeps real titles, respects the request budget and the refresh age', async () => {
  assert.equal(queryFor('Prevalence of severe food insecurity in the population (%)'), 'Prevalence severe food insecurity population');
  assert.match(decodeURIComponent(urlFor('food insecurity')), /Systematic Review/);
  const urls = [], f = async u => { urls.push(u); return { ok: true, json: async () => ({ hitCount: 9, resultList: { result: [{ title: 'A review of X.', pubYear: '2021', doi: '10.1/x', citedByCount: 4 }, { title: 'no year' }] } }) }; };
  const queue = ['p1', 'p2', 'p3'].map(id => ({ id, title: 'Severe food insecurity ' + id }));
  const r = await search({ queue, fetch: f, now: () => T, max: 2 });
  assert.equal(urls.length, 2); assert.deepEqual(r.items.p1.hits, [{ title: 'A review of X', year: 2021, id: 'doi:10.1/x', source: 'europepmc', cited_by: 4 }]);
  assert.ok(r.log.some(x => x.id === 'p3' && /budget/.test(x.event)));
  const again = await search({ queue, prev: r, fetch: f, now: () => T + DAY, max: 5 });
  assert.equal(urls.length, 3);                                           // only p3 was searched; p1 and p2 are fresh
  const failed = await search({ queue: [queue[0]], fetch: async () => ({ ok: false, status: 503 }), now: () => T });
  assert.ok(failed.log[0].event.includes('503')); assert.deepEqual(failed.items, {});
});
test('the evidence hand-off reaches discovery: the frontier seed names the problem, the suggested solution and the real papers it may cite', () => {
  const pipeline = { queue: [{ id: 'b', title: 'Beta deaths', status: 'getting worse', candidates: ['kmc'] }, { id: 'a', title: 'Alpha', candidates: [] }] };
  const ev = { items: { b: { hits: [{ title: 'A real review', year: 2020 }] } } };
  assert.equal(frontierSeed(pipeline, ev, SOLUTIONS, 2), null);           // even days use the graph's combination seed
  const s = frontierSeed(pipeline, ev, SOLUTIONS, 3);
  assert.equal(s.frontier.id, 'b'); assert.equal(s.solution.id, 'kmc'); assert.deepEqual(s.papers, [{ title: 'A real review', year: 2020 }]);
  assert.match(seedText(s), /Beta deaths/); assert.match(proposePrompt(2, [], [], s), /no solution in the catalogue yet/);
  assert.equal(frontierSeed({ queue: [{ id: 'b', proposed: 'x' }] }, null, SOLUTIONS, 3), null);   // one proposal per queued problem
});
test('build reads the real ledgers: every stage has a count field, the history grows by one row, and the queue is bounded', () => {
  const out = build({ now: T, prev: {} });
  for (const s of STAGES) assert.ok(s.count in out.counts, s.id + ' has no count');
  assert.equal(out.history.length, 1); assert.ok(out.queue.length <= RULES.queue_size);
  const again = build({ now: T + DAY, prev: out }); assert.equal(again.history.length, 2); assert.equal(again.history[1].moved, 0);
});
test('the committed ledger agrees with the generated module and no history row is in the future', () => {
  const led = JSON.parse(readFileSync(new URL('../ledger/pipeline.json', import.meta.url), 'utf8'));
  assert.deepEqual(led.counts, PIPELINE.counts); assert.equal(led.at, PIPELINE.at);
  assert.ok(led.history.every(h => Date.parse(h.at) <= Date.now() + 60e3));
});
test('words match code: /pipeline shows the numbers of the generated module and the rules the probe applies; /pipeline.json carries the same', async () => {
  const body = pipelineBody(PIPELINE);
  assert.match(body, new RegExp(`floor is ${RULES.min_substantive_7d}`)); assert.match(body, new RegExp(`within ${RULES.patience_days} days`));
  for (const s of PIPELINE.stages) assert.ok(body.includes(s.label));
  assert.ok(body.includes(Number(PIPELINE.counts.solutions).toLocaleString('en-US')));
  const c = buildCatalog({ problems: null, solutions: SOLUTIONS });
  const page = route(new URL('https://x.test/pipeline'), c), j = route(new URL('https://x.test/pipeline.json'), c);
  assert.equal(page.status, 200); assert.match(await page.text(), /Is it moving\?/);
  const data = await j.json(); assert.deepEqual(data.counts, pipelineData().counts); assert.equal(data.health.status, PIPELINE.health.status);
});
