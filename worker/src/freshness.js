// SPDX-License-Identifier: LicenseRef-Ultrastable-USL-1.0
// Copyright (c) 2026 Rowan Brad Quni-Gudzinas. Non-commercial use free; commercial use requires a license. See LICENSE.
// PAGES-FRESH-1 (Q-RULE-gap-pages-audit): every page served from a bundled generated file reports how old its bundle is, so a stale page is a measured failure, not a silent one.
// GET /api/freshness answers 200 when every bundle is inside its cadence and 503 when one is older. The ultrastable pages-live rule probes it.
import { ENSEMBLE_LEDGER } from './ensemble-ledger.gen.js';
import { RELEASES } from './releases.gen.js';

// The ensemble workflow runs daily (cron 17 5 * * *); two missed runs is a breach.
export const ENSEMBLE_MAX_AGE_H = 52;

// bca-precomputed.gen.js and selfmigrate.gen.js carry no clock: they are pure functions of bca-models.js and worker/self-migrate.json, and
// test/cpu_budget.test.js and test/selfmigrate.test.js fail the build when either differs from its source. They are reported as derived.
// RELEASE-1: a release is due at least every max_gap_days; two further weeks without one means the release loop itself has stopped.
export const RELEASE_GRACE_DAYS = 14;

export function freshness(nowMs = Date.now(), ledger = ENSEMBLE_LEDGER, rel = RELEASES) {
  const at = Date.parse(ledger && ledger.at);
  const age = Number.isFinite(at) ? (nowMs - at) / 3600e3 : null;
  const bundles = [
    { id: 'ensemble-ledger', built_at: Number.isFinite(at) ? new Date(at).toISOString() : null, age_h: age === null ? null : Math.round(age * 10) / 10, max_age_h: ENSEMBLE_MAX_AGE_H, state: age === null ? 'unmeasured' : age > ENSEMBLE_MAX_AGE_H ? 'stale' : 'fresh' },
    (() => { const last = rel && rel.releases && rel.releases[0], t = last ? Date.parse(last.date) : NaN, a = Number.isFinite(t) ? (nowMs - t) / 3600e3 : null, max = ((rel && rel.max_gap_days) || 21) * 24 + RELEASE_GRACE_DAYS * 24;
      return { id: 'releases', built_at: last ? last.date : null, age_h: a === null ? null : Math.round(a * 10) / 10, max_age_h: max, state: a === null ? 'unmeasured' : a > max ? 'stale' : 'fresh' }; })(),
    { id: 'bca-precomputed', derived_from: 'worker/src/bca-models.js', verified_by: 'test/cpu_budget.test.js', state: 'derived' },
    { id: 'selfmigrate', derived_from: 'worker/self-migrate.json', verified_by: 'test/selfmigrate.test.js', state: 'derived' },
  ];
  const stale = bundles.filter(b => b.state === 'stale' || b.state === 'unmeasured').map(b => b.id);
  return { ok: stale.length === 0, stale, bundles, checked_at: new Date(nowMs).toISOString() };
}

export function freshnessResponse(nowMs = Date.now()) {
  const f = freshness(nowMs);
  return Response.json(f, { status: f.ok ? 200 : 503, headers: { 'cache-control': 'no-store' } });
}
