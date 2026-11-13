// SPDX-License-Identifier: LicenseRef-Ultrastable-USL-1.0
// Copyright (c) 2026 Rowan Brad Quni-Gudzinas. Non-commercial use free; commercial use requires a license. See LICENSE.
// The reviewer. It shares only linear algebra with the detector and uses different estimators, so a defect in one method
// does not silently pass through the other: leave-one-out residuals (classical, non-robust scale) for the unit claim and a
// permutation test for the practice claim. Verdicts: verified | unit_only | rejected.
import { gram, inverse, ridgeFit, dot, mean, sd, standardize, rng, nearest } from './linalg.js';

export const REVIEWER = 'reviewer-loo-permutation';

export function verifyBrief(ds, brief, { minZ = 1.0, perms = 1000, alpha = 0.2, seed = 7, peers = 5 } = {}) {
  const i = ds.units.findIndex(u => u.id === brief.unit);
  if (i < 0) return { verdict: 'rejected', reason: 'unit not in dataset', by: REVIEWER };
  const sign = ds.higherIsBetter === false ? -1 : 1;
  const C = ds.units.map(u => ds.contextKeys.map(k => u.context[k]));
  const { Z } = standardize(C);
  const X = Z.map(r => [1, ...r]);
  const y = ds.units.map(u => sign * u.outcome);
  const beta = ridgeFit(X, y, 1e-6);
  const Ginv = inverse(gram(X, 1e-6));
  const loo = X.map((row, k) => {
    const e = y[k] - dot(row, beta);
    const h = Math.min(0.99, dot(row, Ginv.map(r => dot(r, row))));
    return e / (1 - h);
  });
  const zLoo = loo[i] / (Math.sqrt(mean(loo.map(v => v * v))) || 1);
  if (!(zLoo >= minZ)) return { verdict: 'rejected', reason: `leave-one-out z ${zLoo.toFixed(2)} below ${minZ}`, zLoo, by: REVIEWER };

  const P = standardize(ds.units.map(u => ds.practiceKeys.map(k => u.practices[k]))).Z;
  const rand = rng(seed);
  const claim = (brief.practices || [])[0];
  if (!claim) return { verdict: 'unit_only', reason: 'no practice claim to test', zLoo, by: REVIEWER };
  const c = ds.practiceKeys.indexOf(claim.key);
  const all = ds.units.map((_, j) => j);
  const stat = j => { const pr = nearest(Z, j, peers, all.filter(k => k !== j)); return Math.abs(P[j][c] - mean(pr.map(k => P[k][c]))); };
  const obs = stat(i);
  let ge = 0;
  const q = ds.practiceKeys.length;
  for (let b = 0; b < perms; b++) if (stat(Math.floor(rand() * ds.units.length)) >= obs) ge++;
  const p = (1 + ge) / (perms + 1);
  const pAdj = Math.min(1, p * q);
  return { verdict: pAdj <= alpha ? 'verified' : 'unit_only', zLoo, practice: claim.key, p, pAdj, by: REVIEWER,
    reason: pAdj <= alpha ? 'practice differs from matched peers beyond chance' : 'unit is a real outlier; practice difference is not distinguishable from chance here' };
}
