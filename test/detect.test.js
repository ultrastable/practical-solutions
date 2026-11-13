// SPDX-License-Identifier: LicenseRef-Ultrastable-USL-1.0
// Copyright (c) 2026 Rowan Brad Quni-Gudzinas. Non-commercial use free; commercial use requires a license. See LICENSE.
import test from 'node:test';
import assert from 'node:assert/strict';
import { synthWorld } from '../ps/synth.js';
import { detect, unitZ } from '../ps/detect.js';
import { verifyBrief, REVIEWER } from '../ps/verify.js';

test('the detector finds every planted bright spot without being told which they are', () => {
  const ds = synthWorld({ epoch: 0 });
  const d = detect(ds);
  const found = new Set(d.spots.map(s => s.id));
  for (const id of ds.planted) assert.ok(found.has(id), `planted ${id} found`);
  assert.ok(d.spots.every(s => s.stability >= 0.8), 'bright spots are stable under resampling');
  assert.equal(d.pooled[0].key, 'p_outreach', 'the planted practice is the one that differs most consistently');
  assert.ok(d.r2 > 0.7);
});

test('regression to the mean is real: persistent spots persist, flukes do not', () => {
  const next = synthWorld({ epoch: 1 });
  const ds = synthWorld({ epoch: 0 });
  for (const id of ds.planted) assert.ok(unitZ(next, id) >= 1, `${id} persists`);
  for (const id of ds.flukes) assert.ok(unitZ(next, id) < 1, `${id} regresses`);
});

test('results are deterministic for a seed', () => {
  const ds = synthWorld({ epoch: 0 });
  assert.deepEqual(detect(ds, { seed: 5 }).spots.map(s => [s.id, s.stability]), detect(ds, { seed: 5 }).spots.map(s => [s.id, s.stability]));
});

test('too few units for the dimensions is refused, not guessed at', () => {
  const ds = synthWorld({ n: 9, planted: 0, flukes: 0 });
  assert.throws(() => detect(ds), /too few units/);
});

test('the reviewer is independent: it verifies the real practice effect and rejects a non-outlier', () => {
  const ds = synthWorld({ epoch: 0 });
  const d = detect(ds);
  const brief = id => { const s = d.spots.find(x => x.id === id); return { unit: s.id, practices: s.practices }; };
  const v1 = verifyBrief(ds, brief('u001'));
  assert.equal(v1.verdict, 'verified');
  assert.equal(v1.practice, 'p_outreach');
  assert.equal(v1.by, REVIEWER);
  const typical = ds.units.find(u => !d.spots.some(s => s.id === u.id)).id;
  assert.equal(verifyBrief(ds, { unit: typical, practices: [{ key: 'p_noise', effect: 1 }] }).verdict, 'rejected');
  assert.equal(verifyBrief(ds, { unit: 'nope', practices: [] }).verdict, 'rejected');
});
