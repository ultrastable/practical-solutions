// SPDX-License-Identifier: LicenseRef-Ultrastable-USL-1.0
// Copyright (c) 2026 Rowan Brad Quni-Gudzinas. Non-commercial use free; commercial use requires a license. See LICENSE.
import test from 'node:test';
import assert from 'node:assert/strict';
import { synthWorld } from '../ps/synth.js';
import { detect } from '../ps/detect.js';
import { nullWorld, nullFlags, guardZ } from '../ps/guard.js';
import { bh, normalTail } from '../ps/linalg.js';
import { rng } from '../ps/linalg.js';

test('normal tail and Benjamini-Hochberg are numerically right', () => {
  assert.ok(Math.abs(normalTail(1.96) - 0.025) < 1e-3);
  assert.ok(Math.abs(normalTail(0) - 0.5) < 1e-7);
  assert.deepEqual(bh([0.001, 0.2, 0.01, 0.9], 0.05), [true, false, true, false]);
  assert.deepEqual(bh([0.5, 0.6], 0.05), [false, false]);
});

test('the false-discovery gate removes marginal spots a plain threshold would keep', () => {
  const ds = synthWorld({ epoch: 0, planted: 0, flukes: 0 }); // nothing planted: anything flagged is noise
  const loose = detect(ds, { z: 1.0, requireFdr: false, topK: 80, boot: 0 }).spots.length;
  const gated = detect(ds, { z: 1.0, requireFdr: true, topK: 80, boot: 0 }).spots.length;
  assert.ok(loose > gated, `loose ${loose} > gated ${gated}`);
  assert.ok(gated <= 3, `gated ${gated}: BH at 0.1 may admit an occasional false discovery, never a crowd`);
});

test('null worlds are signal-free: the detector flags (almost) nothing there, and the guard picks a floor under its ceiling', () => {
  const ds = synthWorld({ epoch: 0 });
  assert.ok(nullFlags(ds, { z: 1.5 }, 6, 3) <= 0.5);
  const g = guardZ(ds, {}, { ceiling: 0.5, nNull: 4 });
  assert.equal(g.met, true);
  assert.ok(g.nullFlags <= g.ceiling);
  assert.ok(g.archive.length >= 5, 'every evaluated setting is archived');
  // the floor still finds what is truly there
  const found = new Set(detect(ds, { z: g.z, topK: 10 }).spots.map(s => s.id));
  for (const id of ds.planted) assert.ok(found.has(id));
});

test('an impossible ceiling is reported as not met, never silently accepted', () => {
  const ds = synthWorld({ epoch: 0 });
  const g = guardZ(ds, {}, { ceiling: -1, nNull: 2 });
  assert.equal(g.met, false);
});

test('null worlds keep the context and replace only the outcome', () => {
  const ds = synthWorld({ epoch: 0 });
  const w = nullWorld(ds, { folds: 5, trim: 0.1, lambda: 1e-3, seed: 1 }, rng(3));
  assert.deepEqual(w.units.map(u => u.context), ds.units.map(u => u.context));
  assert.notDeepEqual(w.units.map(u => u.outcome), ds.units.map(u => u.outcome));
});
