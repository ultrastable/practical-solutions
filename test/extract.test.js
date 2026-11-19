// SPDX-License-Identifier: LicenseRef-Ultrastable-USL-1.0
// Copyright (c) 2026 Rowan Brad Quni-Gudzinas. Non-commercial use free; commercial use requires a license. See LICENSE.
import test from 'node:test';
import assert from 'node:assert/strict';
import { checkExtraction, readCost, extractPrompt } from '../worker/src/bca.js';

const ab = 'Chlorination cost US$28-72 per DALY averted across 18 trials.';

test('a model figure is accepted only with a verbatim phrase that holds every number', () => {
  assert.deepEqual(checkExtraction('```json\n{"found":true,"low":"28","high":"72","quoted":"US$28-72 per DALY"}\n```', ab), { low: 28, high: 72, quoted: 'US$28-72 per DALY', by: 'model' });
  assert.equal(checkExtraction('{"found":true,"low":"30","high":"72","quoted":"US$28-72 per DALY"}', ab), null);
  assert.equal(checkExtraction('{"found":true,"low":"28","quoted":"US$ 28 per DALY"}', ab), null);
  assert.equal(checkExtraction('{"found":false}', ab), null);
  assert.equal(checkExtraction('not json', ab), null);
  assert.match(extractPrompt(ab, 'daly'), /exactly as written[\s\S]*ABSTRACT:\nChlorination/);
});

test('the model is tried first within its budget; a bad or missing answer falls back to the pattern reader', async () => {
  const ai = text => ({ AI: { run: async () => ({ response: text }) } });
  const good = { fetch: null, secrets: ai('{"found":true,"low":"28","high":"72","quoted":"US$28-72 per DALY"}'), left: 1 };
  assert.equal((await readCost(ab, 'daly', good)).by, 'model');
  assert.equal(good.left, 0);
  assert.equal((await readCost(ab, 'daly', good)).by, 'pattern', 'budget spent');
  const bad = { fetch: null, secrets: ai('{"found":true,"low":"99","quoted":"US$28-72 per DALY"}'), left: 2 };
  const r = await readCost(ab, 'daly', bad); assert.equal(r.by, 'pattern'); assert.equal(r.low, 28);
  const none = { fetch: null, secrets: {}, left: 2 };
  assert.equal((await readCost(ab, 'daly', none)).by, 'pattern');
  const skip = { fetch: null, secrets: ai('{}'), left: 2 };
  assert.equal(await readCost('no cost here', 'daly', skip), null); assert.equal(skip.left, 2, 'abstracts without the unit are not sent');
});
