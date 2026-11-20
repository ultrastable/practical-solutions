// SPDX-License-Identifier: LicenseRef-Ultrastable-USL-1.0
// Copyright (c) 2026 Rowan Brad Quni-Gudzinas. Non-commercial use free; commercial use requires a license. See LICENSE.
// DISCOVER-1 on this catalogue: the whole corpus becomes a graph, a run finds connections, a second run reuses every vector, the page and the
// JSON render from the generated view, and /ask finds a page by meaning. Embeddings here are a deterministic hashed bag of words, so the test
// needs no model; the live run uses the tenant's model route.
import test from 'node:test';
import assert from 'node:assert/strict';
import { corpus, run, checkRationale, view } from '../tools/connections.mjs';
import { connectionsPage, connectionsJson } from '../worker/src/connections.js';
import * as D from '../vendor/ultrastable/core/discover/index.js';

const DIM = 128;
const words = t => String(t).toLowerCase().match(/[a-z]{4,}/g) || [];
export const bow = texts => texts.map(t => { const v = new Array(DIM).fill(0); for (const w of words(t)) { v[parseInt(D.hash(w), 16) % DIM] += 1; } return v; });

test('the catalogue becomes one graph: hand-checked and scanned problems, solutions and their links, combinations already made', () => {
  const c = corpus();
  const kinds = c.nodes.reduce((a, n) => ({ ...a, [n.kind]: (a[n.kind] || 0) + 1 }), {});
  assert.ok(kinds.problem > 500, JSON.stringify(kinds)); assert.ok(kinds.solution >= 20);
  assert.equal(new Set(c.nodes.map(n => n.id)).size, c.nodes.length, 'node ids are unique (a scanned indicator that is also a hand-checked problem is one node)');
  for (const e of c.edges) assert.ok(c.nodes.some(n => n.id === e.dst) && c.nodes.some(n => n.id === e.src));
  assert.ok(c.edges.length >= 20); assert.ok(c.url.get('s:kmc') === '/solutions/kmc');
});

test('a run embeds, finds and screens connections; the next run reuses every vector and settles the ledger', async () => {
  let calls = 0; const embed = async ts => { calls++; return bow(ts); };
  const r1 = await run({ embed, now: Date.parse('2026-11-20T00:00:00Z'), cache: {}, ledger: null });
  assert.equal(r1.errors.length, 0, JSON.stringify(r1.errors));
  assert.ok(r1.embedded > 1000, String(r1.embedded));
  assert.ok(r1.run.candidates > 0 && r1.run.new === r1.run.candidates);
  for (const t of ['transfer', 'frontier']) assert.ok(r1.view[t].length > 0, t + ' found');
  for (const c of [...r1.view.transfer, ...r1.view.combination, ...r1.view.bridge]) assert.notEqual(c.novelty, 'duplicate');
  const before = calls;
  const r2 = await run({ embed, now: Date.parse('2026-11-21T00:00:00Z'), cache: r1.cache, ledger: r1.ledger });
  assert.equal(calls, before, 'nothing changed, nothing re-embedded'); assert.equal(r2.embedded, 0);
  assert.equal(r2.ledger.runs.length, 2);
  // run 1 found more than the tuner's band, so it raised the bar one step with a prediction; run 2 scored that prediction
  assert.ok(r1.view.decision && /^new_candidates/.test(r1.view.decision.prediction));
  assert.ok(r2.view.scored && typeof r2.view.scored.kept === 'boolean');
  assert.ok(r2.run.new < r1.run.new);
  // the packed /ask vectors cover every ask document
  assert.equal(r1.askPacked.ids.length, r1.cache.ask && Object.keys(r1.cache.ask.rows).length);
});

test('offline with no cache publishes nothing invented and says why', async () => {
  const r = await run({ embed: null, now: 0, cache: {}, ledger: null });
  assert.ok(r.errors.length > 0); assert.equal(r.run.candidates, 0);
});

test('a model-written rationale is kept only when it invents no figure', () => {
  assert.equal(checkRationale('Chlorine at the water point could cut cholera through the same route as diarrhoea; a test would count cases.', ['chlorine diarrhoea']).length > 0, true);
  assert.equal(checkRationale('This would cut deaths by 45 percent, a figure from nowhere, which is far too precise to trust here.', ['no number']), null);
  assert.equal(checkRationale('NO_ANSWER', []), null);
});

test('the page and JSON render from the generated view', async () => {
  const r = await run({ embed: async ts => bow(ts), now: Date.parse('2026-11-20T00:00:00Z'), cache: {}, ledger: null });
  const html = connectionsPage(r.view);
  assert.match(html, /<h1>Connections<\/h1>/); assert.match(html, /href="\/solutions\//);
  const j = connectionsJson(r.view, 'https://x');
  assert.ok(j.transfer.length && j.transfer[0].members[0].url.startsWith('https://x/'));
  const empty = connectionsPage(null); assert.match(empty, /first run/i);
});

test('graph leads feed the other loops: transfers become questions, the best open combination seeds the synthesis proposer', async () => {
  const { leadQuestions } = await import('../worker/src/graph.js');
  const { graphSeed } = await import('../tools/discover.mjs');
  const r = await run({ embed: async ts => bow(ts), now: Date.parse('2026-11-20T00:00:00Z'), cache: {}, ledger: null });
  const qs = leadQuestions(r.view);
  assert.ok(qs.length > 0 && /^Does ".+" reduce ".+"\?/.test(qs[0].text));
  assert.equal(leadQuestions(null).length, 0);
  const seed = graphSeed(r.ledger);
  if (r.view.combination.length) { assert.equal(seed.pair.length, 2); assert.ok(seed.pair.every(s => s && s.title)); }
  const done = { entries: Object.fromEntries(Object.entries(r.ledger.entries).map(([k, e]) => [k, { ...e, seeded: 'x' }])) };
  assert.equal(graphSeed(done), null);
});
