// SPDX-License-Identifier: LicenseRef-Ultrastable-USL-1.0
// Copyright (c) 2026 Rowan Brad Quni-Gudzinas. Non-commercial use free; commercial use requires a license. See LICENSE.
import test from 'node:test';
import assert from 'node:assert/strict';
import { MODELS } from '../worker/src/bca-models.js';
import { bcaFor, bcaBlock, methodSection, coverage, bcaTick, extractCost, loadState, KEY } from '../worker/src/bca.js';
import { CTX } from '../worker/src/method-claims.js';
import { validate } from '../vendor/ultrastable/core/benefitcost/index.js';

test('every model is valid, sourced and reproducible', () => {
  for (const m of Object.values(MODELS)) { assert.deepEqual(validate(m), []); assert.equal(bcaFor(m.id).wellby_per_1000_usd.p50, bcaFor(m.id).wellby_per_1000_usd.p50); }
});
test('chlorine: positive, higher-order effects reported, weak links disclosed', () => {
  const b = bcaFor('chlorine'); assert.ok(b.wellby_per_1000_usd.p50 > 0 && b.prob_net_positive > 0.9);
  assert.ok(b.evidence_share.A > 0.5 && b.evidence_share.D > 0); assert.ok(b.unintended_per_1000_usd.p50 < 0);
  assert.match(bcaBlock(b), /WELLBYs per USD 1,000/);
});
test('unmodelled entries say so and the method page publishes every assumption', () => {
  assert.match(bcaBlock(bcaFor('kmc')), /Not yet estimated/);
  const m = methodSection(); for (const k of ['neutral_point', 'discount', 'death_u5_tria']) assert.match(m, new RegExp(k));
  assert.ok(coverage(['chlorine', 'kmc', 'tarl']).searching.includes('kmc')); assert.deepEqual(coverage(['tarl']).gaps, ['tarl']);
});

test('sourced models for vitamin A, nets, vaccination and Friendship Bench rest on cited costs, and weak links are disclosed', () => {
  for (const id of ['vita', 'itn', 'immunisation', 'friendship-bench']) { const b = bcaFor(id); assert.ok(b.wellby_per_1000_usd.p50 > 0, id); assert.match(JSON.stringify(MODELS[id]), /USD/); }
  assert.ok(bcaFor('itn').order_share['2'] > 0);
  assert.match(bcaBlock(bcaFor('helmets'), 'helmets'), /Why there is no number/);
});

const mem = () => { const m = new Map(); return { get: async k => m.get(k) ?? null, put: async (k, v) => { m.set(k, v); } }; };
const epmc = rows => async () => ({ ok: true, json: async () => ({ resultList: { result: rows } }) });

test('cost figures are read from abstracts, with a range when one is quoted', () => {
  assert.deepEqual(extractCost('The ICER was US$ 40 per DALY averted.', 'daly').low, 20);
  const r = extractCost('costs ranged from $28-72 per DALY averted', 'daly'); assert.equal(r.low, 28); assert.equal(r.high, 72);
  assert.equal(extractCost('cost USD 4,500 per death averted', 'death').high, 9000);
  assert.equal(extractCost('no figure here', 'daly'), null);
  assert.equal(extractCost('EUR 40 per DALY', 'daly'), null);
});
test('the loop pools a plausible cost figure, lists its source, and moves the estimate; an implausible one is kept as a lead only', async () => {
  const store = mem(), now = Date.parse('2026-11-18T00:00:00Z');
  const rows = [{ pmid: '111', pubYear: '2024', title: 'Cost-effectiveness of chlorination', abstractText: 'We estimate US$ 60 per DALY averted.' },
    { pmid: '222', pubYear: '2023', title: 'Another', abstractText: 'about US$ 90000 per DALY averted in a hospital programme' }];
  const r = await bcaTick({ store, fetchFn: epmc(rows), now });
  assert.equal(r.id, 'chlorine'); assert.equal(r.found, 1); assert.equal(r.changes[0].kind, 'estimate_moved');
  const st = await loadState(store); assert.match(st.models.chlorine.evidence[0].source, /PMID 111/); assert.equal(st.models.chlorine.nodes[0].grade, 'A', 'grade C evidence never lowers a grade');
  assert.match(st.leads[0].source, /PMID 222/);
  const b = bcaFor('chlorine', st); assert.match(bcaBlock(b, 'chlorine'), /PMID 111/); assert.notEqual(b.wellby_per_1000_usd.p50, bcaFor('chlorine').wellby_per_1000_usd.p50);
  // the next ticks move on to other models, and the same source is never pooled twice
  const seen = new Set([r.id]); for (let i = 1; i < 11; i++) seen.add((await bcaTick({ store, fetchFn: epmc([]), now: now + i * 6e5 })).id); assert.equal(seen.size, 11);
  const again = await bcaTick({ store, fetchFn: epmc(rows), now: now + 9e6 }); assert.equal(again.id, 'chlorine'); assert.equal(again.found, 0);
});
test('a failed search is recorded and does not stop the loop', async () => {
  const store = mem(); const r = await bcaTick({ store, fetchFn: async () => ({ ok: false, status: 503 }) });
  assert.equal(r.changes[0].kind, 'estimate_error'); assert.match((await loadState(store)).looked[r.id].error, /503/);
});
test('each estimate is shown per income group: applies or not with a reason, measured or transferred', () => {
  const b = bcaFor('chlorine'), by = Object.fromEntries(b.contexts.map(c => [c.id, c]));
  assert.equal(by.high.r.applicable, false); assert.match(by.high.r.reason, /piped/);
  assert.equal(by.low.measured, true); assert.equal(by['upper-middle'].measured, false);
  const h = bcaBlock(b, 'chlorine'); assert.match(h, /Does not apply/); assert.match(h, /Transferred from another setting/);
  assert.match(JSON.stringify(CTX.CONTEXTS), /Low income/);
});
test('cash transfers carry the cited WELLBY figure with spillover and price effects', () => {
  const b = bcaFor('cash'); assert.ok(b.wellby_per_1000_usd.p50 > 4 && b.wellby_per_1000_usd.p50 < 9); assert.ok(b.unintended_per_1000_usd.p50 < 0);
});

test('a queued entry gets a drafted lead from the first figure found, flagged and unranked until a second source agrees', async () => {
  const store = mem(), put = async (k, v) => store.put(k, JSON.stringify(v));
  await put(KEY, { models: {}, leads: [], looked: Object.fromEntries(['chlorine', 'friendship-bench', 'vita', 'itn', 'immunisation', 'ors-zinc', 'hypertension', 'helmets', 'deworming', 'clean-cooking'].map(i => [i, { at: '2026-11-18T00:00:00Z' }])) });
  const one = [{ pmid: '9', pubYear: '2022', title: 'KMC costs', abstractText: 'The programme cost US$ 2,000 per death averted.' }];
  const r = await bcaTick({ store, fetchFn: epmc(one), now: Date.parse('2026-11-19T00:00:00Z') });
  assert.equal(r.id, 'kmc'); assert.equal(r.changes[0].kind, 'estimate_drafted');
  let st = await loadState(store), b = bcaFor('kmc', st);
  assert.equal(b.draft, true); assert.equal(b.rank_key, undefined); assert.match(bcaBlock(b, 'kmc'), /Lead, not a finding/);
  st.looked.kmc.at = '2026-01-01T00:00:00Z'; await put(KEY, st);
  const two = [...one, { pmid: '10', pubYear: '2023', title: 'KMC again', abstractText: 'about USD 3,000 per life saved' }];
  await bcaTick({ store, fetchFn: epmc(two), now: Date.parse('2026-11-20T00:00:00Z') });
  st = await loadState(store); b = bcaFor('kmc', st);
  assert.equal(st.models.kmc.evidence.length, 2); assert.equal(b.draft, false); assert.ok(b.rank_key > 0);
});
