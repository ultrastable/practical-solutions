// SPDX-License-Identifier: LicenseRef-Ultrastable-USL-1.0
// Copyright (c) 2026 Rowan Brad Quni-Gudzinas. Non-commercial use free; commercial use requires a license. See LICENSE.
import test from 'node:test';
import assert from 'node:assert/strict';
import { MODELS } from '../worker/src/bca-models.js';
import { bcaFor, bcaBlock, methodSection, coverage } from '../worker/src/bca.js';
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
  const m = methodSection(); for (const k of ['neutral_point', 'discount', 'moral_weight_death_u5']) assert.match(m, new RegExp(k));
  assert.ok(coverage(['chlorine', 'kmc']).queue.includes('kmc'));
});
