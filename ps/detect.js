// SPDX-License-Identifier: LicenseRef-Ultrastable-USL-1.0
// Copyright (c) 2026 Rowan Brad Quni-Gudzinas. Non-commercial use free; commercial use requires a license. See LICENSE.
// The bright-spot detector (positive deviance). Unsupervised: no label says which units are bright. A unit is bright when its
// outcome is far better than its context predicts. The context is many dimensions at once; a single-dimension ranking cannot see this.
//
// dataset = { units: [{ id, name?, outcome, context: {k: number}, practices: {k: number} }],
//             contextKeys, practiceKeys, higherIsBetter }
import { ridgeFit, dot, mean, mad, sd, standardize, rng, nearest } from './linalg.js';

export const DEFAULTS = { z: 1.5, topK: 5, peers: 5, boot: 200, stableZ: 1.0, seed: 1, lambda: 1e-3, minEffect: 0.25 };

export function design(ds) {
  const C = ds.units.map(u => ds.contextKeys.map(k => u.context[k]));
  const { Z } = standardize(C);
  return { Z, X: Z.map(r => [1, ...r]) };
}

export function orientedOutcome(ds) {
  const sign = ds.higherIsBetter === false ? -1 : 1;
  return ds.units.map(u => sign * u.outcome);
}

export function fit(ds, o = DEFAULTS) {
  const { X, Z } = design(ds);
  const y = orientedOutcome(ds);
  const beta = ridgeFit(X, y, o.lambda);
  const pred = X.map(r => dot(r, beta));
  const resid = y.map((v, i) => v - pred[i]);
  const scale = mad(resid) || sd(resid) || 1;
  const ybar = mean(y);
  const r2 = 1 - resid.reduce((s, v) => s + v * v, 0) / (y.reduce((s, v) => s + (v - ybar) ** 2, 0) || 1);
  return { X, Z, y, beta, pred, resid, scale, r2, z: resid.map(v => v / scale) };
}

export function practiceMatrix(ds) {
  return standardize(ds.units.map(u => ds.practiceKeys.map(k => u.practices[k]))).Z;
}

export function practiceEffects(ds, Z, P, i, spotSet, o) {
  const allowed = ds.units.map((_, j) => j).filter(j => !spotSet.has(j));
  const peers = nearest(Z, i, o.peers, allowed);
  const eff = ds.practiceKeys.map((key, c) => ({ key, effect: P[i][c] - mean(peers.map(j => P[j][c])) }));
  return { peers, eff };
}

export function detect(ds, opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  const n = ds.units.length;
  if (n < ds.contextKeys.length + 8) throw new Error(`too few units (${n}) for ${ds.contextKeys.length} context dimensions`);
  const f = fit(ds, o);
  const P = practiceMatrix(ds);
  const order = f.z.map((z, i) => [i, z]).filter(([, z]) => z >= o.z).sort((a, b) => b[1] - a[1]).slice(0, o.topK).map(([i]) => i);
  const spotSet = new Set(order);

  // Stability: refit on bootstrap resamples; how often does the unit stay clearly above expectation?
  const rand = rng(o.seed);
  const stay = new Map(order.map(i => [i, 0]));
  for (let b = 0; b < o.boot; b++) {
    const idx = Array.from({ length: n }, () => Math.floor(rand() * n));
    let beta;
    try { beta = ridgeFit(idx.map(i => f.X[i]), idx.map(i => f.y[i]), o.lambda); } catch { continue; }
    const r = idx.map(i => f.y[i] - dot(f.X[i], beta));
    const sc = mad(r) || sd(r) || 1;
    for (const i of order) if ((f.y[i] - dot(f.X[i], beta)) / sc >= o.stableZ) stay.set(i, stay.get(i) + 1);
  }

  const spots = order.map(i => {
    const { peers, eff } = practiceEffects(ds, f.Z, P, i, spotSet, o);
    return {
      id: ds.units[i].id, name: ds.units[i].name || ds.units[i].id, index: i,
      z: f.z[i], observed: ds.units[i].outcome, expected: (ds.higherIsBetter === false ? -1 : 1) * f.pred[i],
      stability: stay.get(i) / o.boot,
      peers: peers.map(j => ds.units[j].id),
      practices: eff.filter(e => Math.abs(e.effect) >= o.minEffect).sort((a, b) => Math.abs(b.effect) - Math.abs(a.effect)),
    };
  });

  // Pooled across all bright spots: which practice differs the same way in most of them.
  const pooled = ds.practiceKeys.map((key, c) => {
    const effs = spots.map(s => (s.practices.find(p => p.key === key) || { effect: 0 }).effect);
    const m = mean(effs);
    const consistency = effs.length ? effs.filter(e => Math.sign(e) === Math.sign(m) && Math.abs(e) >= o.minEffect).length / effs.length : 0;
    return { key, effect: m, consistency, score: Math.abs(m) * consistency };
  }).sort((a, b) => b.score - a.score);

  return { n, r2: f.r2, scale: f.scale, spots, pooled, params: o };
}

// Residual z of one unit in a (possibly refreshed) dataset: the quantity a brief's prediction is about.
export function unitZ(ds, unitId, opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  const i = ds.units.findIndex(u => u.id === unitId);
  if (i < 0) return null;
  return fit(ds, o).z[i];
}
