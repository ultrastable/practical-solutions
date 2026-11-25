// SPDX-License-Identifier: LicenseRef-Ultrastable-USL-1.0
// Copyright (c) 2026 Rowan Brad Quni-Gudzinas. Non-commercial use free; commercial use requires a license. See LICENSE.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gather, keywords, names } from '../ps/implevidence.js';
const sol = [{ id: 'x', title: 'Chlorine dispensers at village water points' }];
const paper = (doi, abstractText) => ({ title: 'Scale-up of chlorine dispensers.', pubYear: '2020', doi, abstractText });
const mk = (results, resolves) => async url => String(url).includes('crossref') ? { ok: resolves(decodeURIComponent(String(url).split('/works/')[1])) } : { ok: true, json: async () => ({ resultList: { result: results } }) };
test('keeps only papers whose DOI resolves and whose abstract names the intervention', async () => {
  const f = mk([paper('10.1/a', 'Chlorine dispensers reached many village water points in a scale-up.'), paper('10.1/b', 'Chlorine dispensers at village water points.'), paper('10.1/c', 'An unrelated study of roads.')], d => d !== '10.1/b');
  const r = await gather({ solutions: sol, fetch: f, now: () => 0 });
  assert.deepEqual(r.items.x.hits.map(h => h.doi), ['10.1/a']);
  assert.equal(r.items.x.hits[0].url, 'https://doi.org/10.1/a');
});
test('keywords and matching are about the intervention; a fresh search is not repeated', async () => {
  assert.match(keywords('Test every adult in a high-burden community once a year'), /Test adult high-burden/);
  assert.equal(names('roads and bridges', 'chlorine dispensers'), false);
  let calls = 0; const f = async u => { calls++; return mk([], () => true)(u); };
  const first = await gather({ solutions: sol, fetch: f, now: () => 0 });
  await gather({ solutions: sol, prev: first, fetch: f, now: () => 1000 });
  assert.equal(calls, 1);
});
