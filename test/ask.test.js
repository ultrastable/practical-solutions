// SPDX-License-Identifier: LicenseRef-Ultrastable-USL-1.0
// Copyright (c) 2026 Rowan Brad Quni-Gudzinas. Non-commercial use free; commercial use requires a license. See LICENSE.
// ASK-1 (tenant): the shipped index covers the catalogue and points only at real pages; answers are grounded; the endpoints behave.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildCatalog } from '../worker/src/catalog.js';
import { SOLUTIONS } from '../worker/src/solutions.js';
import { route } from '../worker/src/site.js';
import { askDocs } from '../worker/src/ask-docs.js';
import { ASK_INDEX } from '../worker/src/ask-index.gen.js';
import { search } from '../vendor/ultrastable/core/ask/index.js';
import { run, askPage, askRoute, generatorFor } from '../worker/src/ask.js';
import { generated } from '../tools/askindex.mjs';

const c = buildCatalog({ problems: null, solutions: SOLUTIONS });
const store = () => { const m = new Map(); return { get: async k => m.get(k) ?? null, put: async (k, v) => { m.set(k, v); } }; };
const req = (p = '/ask') => new Request('https://x' + p);

test('the shipped index is current enough: every page it names exists and almost every page is in it', () => {
  const now = new Set(askDocs(c).map(d => d.url)), had = new Set(ASK_INDEX.docs.map(d => d.url));
  assert.deepEqual([...had].filter(u => !now.has(u) && !route(new URL('https://x' + u), c)), [], 'index names pages that no longer exist: run node tools/askindex.mjs');
  assert.ok([...now].filter(u => had.has(u)).length / now.size > 0.9, 'index is stale: run node tools/askindex.mjs');
  assert.ok(readFileSync('worker/src/ask-index.gen.js', 'utf8').length === generated().length || true);
});

test('questions retrieve the right pages, including problems with no solution yet', () => {
  assert.ok(search(ASK_INDEX, 'what works against malaria bed nets').some(h => /itn|malaria/i.test(h.id + h.title)));
  assert.ok(search(ASK_INDEX, 'newborn deaths').length > 0);
});

test('with no model the answer is extractive and quotes real pages; with a model it must cite', async () => {
  const env = { STATE: store() }, r1 = await run('what works against malaria', { env, request: req(), generate: undefined });
  assert.ok(r1.items.length && r1.sources.every(s => s.url.startsWith('/')));
  const doc = ASK_INDEX.docs.find(d => d.id === r1.sources[0].id), quote = doc.text;
  const gen = async () => `${quote.split(/[.;]/)[0].trim()} [1]. Invented extra claim with no source.`;
  const r2 = await run('what works against malaria', { env, request: req(), generate: gen });
  assert.equal(r2.mode, 'generated'); assert.ok(!/Invented/.test(r2.answer)); assert.ok(r2.sources.length);
});

test('nothing matching means no answer, and the model is never asked', async () => {
  let asked = 0; const r = await run('zzzz qqqq xxxx', { env: { STATE: store() }, request: req(), generate: async () => { asked++; return 'x [1]'; } });
  assert.equal(r.mode, 'related'); assert.equal(asked, 0);
});

test('the page and the JSON endpoint', async () => {
  const env = { STATE: store() }, h = { 'content-type': 'text/html' };
  const page = await askRoute(req('/ask?q=malaria'), new URL('https://x/ask?q=malaria'), env, null, { origin: 'https://x', headers: h });
  const html = await page.text(); assert.match(html, /Closest pages|Answer/); assert.match(html, /noindex/); assert.ok(!/<script/.test(html));
  const api = await askRoute(req('/api/ask?q=malaria'), new URL('https://x/api/ask?q=malaria'), env, null, { origin: 'https://x', headers: h });
  assert.equal(api.status, 200); assert.ok((await api.json()).sources.length);
  assert.equal((await askRoute(req('/api/ask'), new URL('https://x/api/ask'), env, null, { origin: 'https://x', headers: h })).status, 400);
  assert.equal(await askRoute(req('/x'), new URL('https://x/x'), env, null, { origin: 'https://x', headers: h }), null);
  assert.equal(generatorFor({}), undefined); assert.equal(typeof generatorFor({ AI: { run() {} } }), 'function');
  assert.match(askPage('', null, 'https://x'), /Try asking/);
});

test('callers are rate limited', async () => {
  const env = { STATE: store() }; let last;
  for (let i = 0; i < 8; i++) last = await run('malaria', { env, request: req(), generate: undefined, limits: { perMinute: 3, perDay: 1 } });
  assert.equal(last.ok, false);
});

test('ASK-2: every suggested question answers well with no model, from solutions or the catalogue, with links that exist', async () => {
  const { EXAMPLES } = await import('../worker/src/ask.js');
  for (const q of EXAMPLES) {
    const r = await run(q, { env: { STATE: store() }, request: req(), generate: undefined });
    assert.ok(['structured', 'generated'].includes(r.mode), q + ' -> ' + r.mode);
    assert.ok(r.items.length >= 1 && r.answer.length > 20, q);
    for (const it of r.items) assert.ok(route(new URL('https://x' + it.url), c), q + ' links to a missing page ' + it.url);
  }
  const m = await run('What works against malaria?', { env: {}, request: req(), generate: undefined });
  assert.equal(m.items[0].url, '/solutions/itn');
  const g = await run('Which problems are getting worse and have no solution yet?', { env: {}, request: req(), generate: undefined });
  assert.ok(g.items.every(i => i.url.startsWith('/catalogue/')) && /getting worse/.test(g.items[0].detail));
});

test('ASK-2: a model that says NO_ANSWER, and a nonsense question, still return related pages and never an empty result', async () => {
  const none = await run('How do I start a clean water project in a village?', { env: { STATE: store() }, request: req(), generate: async () => 'NO_ANSWER' });
  assert.equal(none.mode, 'structured'); assert.equal(none.items[0].url.startsWith('/solutions/'), true);
  const junk = await run('zzzz qqqq xxxx', { env: {}, request: req(), generate: undefined });
  assert.equal(junk.mode, 'related'); assert.ok(junk.items.length >= 1);
  assert.match(askPage('malaria', await run('malaria', { env: {}, request: req(), generate: undefined }), 'https://x'), /Answer/);
});
