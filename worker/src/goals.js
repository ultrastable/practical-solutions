// SPDX-License-Identifier: LicenseRef-Ultrastable-USL-1.0
// Copyright (c) 2026 Rowan Brad Quni-Gudzinas. Non-commercial use free; commercial use requires a license. See LICENSE.
// GOALS-1 tenant side. Practical Solutions states what it works toward and which knobs it lets Ultrastable core turn. Core never gets a credential from this tenant:
// it reads the public feed at /goals.json (goals, knobs, readings; core/seed/worker/src/goals.js registers them under the "ps." namespace) and this module reads the
// knob values core chose from core's public GET /api/goals/knobs?tenant=ps, and applies them in this tenant's own code. Goals and knobs are tenant-specific and live
// here; the control loop, the audit trail and the page are core's.
export const TENANT = 'ps';
export const CORE_URL = 'https://ultrastable.io';
const DAY = 86400e3;
export const GOALS = [
  { id: 'ps.mission', level: 'mission', statement: 'Find, grade and publish practical, evidence-backed solutions to pressing problems, and put them in front of the people who can implement them.' },
  { id: 'ps.supply', parent_id: 'ps.mission', level: 'objective', statement: 'A steady supply of new evidence-backed solutions.' },
  { id: 'ps.supply.new_7d', parent_id: 'ps.supply', level: 'target', statement: 'New solutions published in the last 7 days.', unit: 'solutions', op: '>=', target: 5 },
  { id: 'ps.supply.total', parent_id: 'ps.supply', level: 'target', statement: 'Solutions published in total.', unit: 'solutions', op: '>=', target: 50 },
  { id: 'ps.trust', parent_id: 'ps.mission', level: 'objective', statement: 'Every published claim is checked against its source and graded honestly.' },
  { id: 'ps.trust.verified', parent_id: 'ps.trust', level: 'target', statement: 'Share of solutions whose citation check passed.', unit: 'share', op: '>=', target: 0.9 },
  { id: 'ps.impact', parent_id: 'ps.mission', level: 'objective', statement: 'Rank by what can actually be implemented, in one common benefit-cost metric.' },
  { id: 'ps.impact.ready', parent_id: 'ps.impact', level: 'target', statement: 'Share of solutions ready to implement (implementability score 7 or more).', unit: 'share', op: '>=', target: 0.6 },
  { id: 'ps.impact.bca', parent_id: 'ps.impact', level: 'target', statement: 'Share of solutions with a modelled benefit-cost figure in WELLBYs per 1,000 USD.', unit: 'share', op: '>=', target: 0.8 },
  { id: 'ps.impact.wellby', parent_id: 'ps.impact', level: 'target', statement: 'Median WELLBYs per 1,000 USD across solutions with a modelled figure.', unit: 'WELLBY per 1,000 USD', op: '>=', target: 5 },
  { id: 'ps.reach', parent_id: 'ps.mission', level: 'objective', statement: 'Reach the implementers: agencies, funders and practitioners who can act on an entry.' },
  { id: 'ps.reach.contacts', parent_id: 'ps.reach', level: 'target', statement: 'Implementer contacts reached by automated, disclosed outreach (all time).', unit: 'contacts', op: '>=', target: 100 },
  { id: 'ps.reach.views_7d', parent_id: 'ps.reach', level: 'target', statement: 'Page views of the site in the last 7 days.', unit: 'views', op: '>=', target: 500 },
];
// Knobs this tenant lets core turn. Each is read by this tenant's own code through knob(); the default applies until core sets a value.
export const KNOBS = [
  { id: 'ps.verify.per_tick', goal_id: 'ps.trust.verified', what: 'Solutions whose citation is re-checked per tick (more checks, more outbound calls).', value: 3, min: 1, max: 8, step: 1, effect: 1, cooldown_h: 24, review_h: 48 },
];
export const knob = (knobs, id, fallback) => { const k = knobs && knobs[id]; return k && Number.isFinite(Number(k.value)) ? Number(k.value) : fallback; };

const med = a => { const s = [...a].sort((x, y) => x - y); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null; };
// Readings from the catalog (cat), the reach summary and the backend's outreach counts. A reading that cannot be computed is left out, never zero.
export function readings({ cat, reach, hist = [], backend = null, now = Date.now() }) {
  const sols = (cat && cat.sols) || [], n = sols.length, r = {};
  if (n) {
    r['ps.supply.total'] = n;
    const old = hist.filter(h => now - h.at >= 7 * DAY).sort((a, b) => b.at - a.at)[0];
    if (old) r['ps.supply.new_7d'] = Math.max(0, n - old.n);
    const checkable = sols.filter(s => s.checkable);
    if (checkable.length) r['ps.trust.verified'] = Math.round(1000 * checkable.filter(s => s.ver && s.ver.status === 'verified').length / checkable.length) / 1000;
    r['ps.impact.ready'] = Math.round(1000 * sols.filter(s => s.impl && s.impl.score >= 7).length / n) / 1000;
    const w = sols.map(s => { const b = s.bca && !s.bca.error ? s.bca.wellby_per_1000_usd : null; return typeof b === 'number' ? b : (b && typeof b.p50 === 'number' ? b.p50 : null); }).filter(x => x != null && Number.isFinite(x));
    r['ps.impact.bca'] = Math.round(1000 * w.length / n) / 1000;
    if (w.length) r['ps.impact.wellby'] = Math.round(1000 * med(w)) / 1000;
  }
  if (reach && Number.isFinite(reach.views)) r['ps.reach.views_7d'] = reach.views;
  if (backend && Number.isFinite(backend.sent)) r['ps.reach.contacts'] = backend.sent;
  return r;
}
export function snapshot(hist, n, now = Date.now()) {  // one count a day, 30 days kept: the 7-day new-solutions reading is a difference of two of them
  const last = hist[hist.length - 1];
  return (last && now - last.at < DAY * 0.9 ? hist : [...hist, { at: now, n }]).filter(h => now - h.at <= 30 * DAY);
}
export const feed = ({ readings: r, now = Date.now() }) => ({ tenant: TENANT, as_of: new Date(now).toISOString(), goals: GOALS, knobs: KNOBS, readings: r });

// The cron step: compute readings, store the public feed, pull the knob values core chose. Every part fails soft and is recorded; none blocks the tick.
export async function goalsTick({ store, cat, reach, backend, fetchFn = fetch, now = Date.now(), coreUrl = CORE_URL }) {
  const get = async (k, d) => { const v = await store.get(k); return v ? JSON.parse(v) : d; };
  const hist = snapshot(await get('goals:hist', []), ((cat && cat.sols) || []).length, now);
  await store.put('goals:hist', JSON.stringify(hist));
  await store.put('goals:feed', JSON.stringify(feed({ readings: readings({ cat, reach, hist, backend, now }), now })));
  try {
    const res = await fetchFn(`${coreUrl}/api/goals/knobs?tenant=${TENANT}`, { signal: AbortSignal.timeout(8000) });
    if (res.ok) { await store.put('goals:knobs', JSON.stringify(await res.json())); await store.delete('goals:error'); } else await store.put('goals:error', `core knobs ${res.status}`);
  } catch (e) { await store.put('goals:error', String(e && e.message || e).slice(0, 120)); }
}
