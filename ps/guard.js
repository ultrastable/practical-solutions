// SPDX-License-Identifier: LicenseRef-Ultrastable-USL-1.0
// Copyright (c) 2026 Rowan Brad Quni-Gudzinas. Non-commercial use free; commercial use requires a license. See LICENSE.
// The negative control. Build worlds where nothing is truly bright (the context model's expectation plus residuals resampled from the
// signal-free bulk), run the real detector on them, and count what it still flags: every such flag is false by construction. The
// loosest threshold whose false flags stay under a ceiling is the edge the detector may operate at. Essential variable: null flags.
import { detect, fit, design, orientedOutcome, crossFitted, DEFAULTS } from './detect.js';
import { rng, median, mad } from './linalg.js';

export const GRID = [1.0, 1.25, 1.5, 1.75, 2.0, 2.5, 3.0];

export function nullWorld(ds, o, rand) {
  const { X } = design(ds);
  const y = orientedOutcome(ds);
  const exp = crossFitted(X, y, o);
  const r = y.map((v, i) => v - exp[i]);
  const med = median(r), sc = mad(r) || 1;
  const bulk = r.map((v, i) => [v, i]).filter(([v]) => Math.abs(v - med) < 2 * sc).map(([, i]) => i);
  const sign = ds.higherIsBetter === false ? -1 : 1;
  return { ...ds, units: ds.units.map((u, i) => ({ ...u, outcome: sign * (exp[i] + r[bulk[Math.floor(rand() * bulk.length)]]) })) };
}

export function nullFlags(ds, o = {}, nNull = 8, seed = 1) {
  const opt = { ...DEFAULTS, ...o, topK: ds.units.length, boot: 0 };
  const rand = rng(seed * 104729 + 5);
  let total = 0;
  for (let i = 0; i < nNull; i++) total += detect(nullWorld(ds, opt, rand), { ...opt, seed: seed + i }).spots.length;
  return total / nNull;
}

export function guardZ(ds, o = {}, { ceiling = 0.5, grid = GRID, nNull = 8, seed = 1 } = {}) {
  const archive = grid.map(z => ({ z, nullFlags: nullFlags(ds, { ...o, z }, nNull, seed) }));
  const ok = archive.find(r => r.nullFlags <= ceiling);
  const pick = ok || archive[archive.length - 1];
  return { z: pick.z, nullFlags: pick.nullFlags, ceiling, met: Boolean(ok), archive };
}
