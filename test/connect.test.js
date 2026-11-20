// SPDX-License-Identifier: LicenseRef-Ultrastable-USL-1.0
// Copyright (c) 2026 Rowan Brad Quni-Gudzinas. Non-commercial use free; commercial use requires a license. See LICENSE.
import test from 'node:test';
import assert from 'node:assert/strict';
import { catalogueItems, knownPairs, run, buildModule, priorWork } from '../tools/connect.mjs';
import { leadFrom, recordLead, discover } from '../tools/discover.mjs';
import { connectionsPage, indexJson } from '../worker/src/connections-pages.js';
import { CONNECTIONS } from '../worker/src/connections.gen.js';
import { PROBLEMS } from '../worker/src/problems.js';

const NOW = () => '2026-11-20T00:00:00.000Z';
const page = (path, o, title, desc, body) => `<title>${title}</title>${body}`;

test('the catalogue becomes a graph: every edge has both ends, and a scanned indicator that is a curated problem is not a second node', () => {
  const { items, edges } = catalogueItems(), ids = new Set(items.map(i => i.id));
  assert.ok(items.filter(i => i.kind === 'problem').length > PROBLEMS.length + 100, 'the scanned catalogue is included');
  assert.ok(edges.length > 0 && edges.every(e => ids.has(e.src) && ids.has(e.dst)));
  assert.equal(ids.size, items.length, 'ids are unique');
  assert.ok(items.every(i => i.text && i.text.length > 5));
});

test('an offline run ranks leads that never restate a known link, and builds a loadable module', async () => {
  const { ledger } = await run({ offline: true, now: NOW, log: () => {} });
  assert.match(ledger.route, /^lexical-/);
  assert.ok(ledger.candidates.length > 0);
  const { edges } = catalogueItems(), known = new Set(edges.map(e => e.src + '>' + e.dst));
  assert.ok(ledger.candidates.every(c => !known.has(c.a.id + '>' + c.b.id)));
  assert.ok(ledger.candidates.every(c => c.question && c.a.url && c.b.url));
  const mod = buildModule(ledger);
  const m = await import('data:text/javascript;base64,' + Buffer.from(mod).toString('base64'));
  assert.equal(m.CONNECTIONS.candidates.length, ledger.candidates.length);
});

test('a lead from the word-overlap route never seeds the discovery loop; a model-route lead does, once, and its outcome is recorded', async () => {
  const { ledger } = await run({ offline: true, now: NOW, log: () => {} });
  assert.equal(leadFrom(ledger), null);
  const modelRun = { ...ledger, route: 'wai:@cf/baai/bge-base-en-v1.5' };
  const lead = leadFrom(modelRun);
  assert.equal(lead.id, ledger.candidates[0].id); assert.match(lead.text, /Lead /);
  const after = recordLead(modelRun, lead, { accepted: [], at: NOW() });
  assert.equal(after.history[lead.id].outcome, 'rejected');
  assert.notEqual(leadFrom(after).id, lead.id, 'a handed lead is not handed again');
  assert.ok(knownPairs(after).some(k => k.members.join('+') === lead.members.join('+')), 'and is no longer novel to the engine');
});

test('outcomes come back: a rejected lead kind loses weight on the next run', async () => {
  const { ledger } = await run({ offline: true, now: NOW, log: () => {} });
  const history = { ...ledger.history };
  for (let i = 0; i < 5; i++) history[`transfer:x${i}>y`] = { status: 'handed', outcome: 'rejected', members: ['x' + i, 'y'] };
  const { ledger: next } = await run({ offline: true, now: NOW, prev: { ...ledger, history }, log: () => {} });
  assert.ok(next.calibration.kindWeight.transfer < 1);
});

test('the discovery prompt starts from the lead when there is one', async () => {
  const prompts = [];
  const lead = { id: 'transfer:solution:kmc>problem:x', text: 'Would KMC reduce X?', members: [], components: ['kmc'] };
  const r = await discover({ ask: async p => { prompts.push(p); return '[]'; }, lead, now: NOW });
  assert.match(prompts[0], /Start from this lead, which the connection engine found/); assert.match(prompts[0], /Would KMC reduce X\?/);
  assert.ok(r.log.some(l => l.event === 'seeded by connection lead'));
});

test('prior-work search reads the OpenAlex count and closest titles; a failure is an error, not a zero', async () => {
  const f = async url => { assert.match(url, /api\.openalex\.org\/works/); return Response.json({ meta: { count: 7 }, results: [{ title: 'T', publication_year: 2020, doi: 'https://doi.org/x' }] }); };
  const p = await priorWork(f, 'Chlorinate water at the point of collection', 'Cholera outbreaks');
  assert.equal(p.total, 7); assert.equal(p.closest[0].title, 'T'); assert.match(p.query, /chlorinate/);
  await assert.rejects(() => priorWork(async () => new Response('x', { status: 429 }), 'a', 'b'), /429/);
});

test('/connections renders from the generated module, says these are leads, and its JSON carries every lead', () => {
  const html = connectionsPage('https://x', page);
  assert.match(html, /Leads, not findings/); assert.match(html, /How leads are found/);
  const j = indexJson('https://x');
  assert.equal(j.connections.length, CONNECTIONS.candidates.length); assert.equal(j.status, 'leads for the discovery loop, not findings');
});
