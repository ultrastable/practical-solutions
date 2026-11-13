// SPDX-License-Identifier: LicenseRef-Ultrastable-USL-1.0
// Copyright (c) 2026 Rowan Brad Quni-Gudzinas. Non-commercial use free; commercial use requires a license. See LICENSE.
// The criticality probe: code, not a claim. "Critical" means the loop sustains itself: each finished item spawns about one new
// valid item (branching ratio near 1), the backlog stays bounded, every published brief traces to tick-run items checked by a
// different reviewer, predictions are scored honestly, trust moves in both directions, no item waits on a person, cost is inside
// its cap, model roles actually ran, and the system's own defects went upstream. A test that cannot be measured is "unmeasured",
// and unmeasured is not a pass.
const DAY = 86400e3;
const iso = ms => new Date(ms).toISOString().replace('T', ' ').slice(0, 19);
const all = async (db, sql, ...a) => (await db.prepare(sql).bind(...a).all()).results || [];
const first = async (db, sql, ...a) => (await db.prepare(sql).bind(...a).first()) || null;
const median = a => { const s = [...a].sort((x, y) => x - y); return s.length ? s[s.length >> 1] : 0; };

export const DEFAULT_LIMITS = { window_days: 14, ratio_min: 0.8, ratio_max: 1.25, max_backlog: 200, plus_share: 0.2, min_resolved: 5, max_brier: 0.25, cost_cap_usd: 5, exec_share: 0.8 };

export async function evaluate(db, { now = Date.now(), config = {}, birth = null } = {}) {
  const L = { ...DEFAULT_LIMITS, ...(config.ps?.criticality || {}), plus_share: config.plus_share ?? DEFAULT_LIMITS.plus_share };
  const start = iso(now - L.window_days * DAY);
  const tests = [];
  const T = (id, name, status, value, need) => tests.push({ id, name, status, value, need });

  T('C1', 'reproducible birth', birth == null ? 'unmeasured' : birth ? 'pass' : 'fail', birth, 'two fresh builds from the idea file are identical');

  const done = await all(db, `SELECT id, kind FROM items WHERE id LIKE 'ps:%' AND status='done' AND updated_at >= ?`, start);
  const doneIds = new Set(done.map(d => d.id));
  const published = await all(db, `SELECT id, created_by, verified_by, dataset_id FROM ps_briefs WHERE status='published' AND published_at >= ?`, start);
  let traced = 0;
  for (const b of published) {
    const v = await first(db, `SELECT status FROM items WHERE id=?`, `ps:verify:${b.id}`);
    const p = await first(db, `SELECT status FROM items WHERE id=?`, `ps:publish:${b.id}`);
    const d = await first(db, `SELECT 1 x FROM ps_datasets WHERE id=?`, b.dataset_id);
    if (v?.status === 'done' && p?.status === 'done' && d && b.verified_by && b.verified_by !== b.created_by) traced++;
  }
  T('C2', 'published briefs trace to tick-run items checked by a different reviewer', published.length ? (traced / published.length >= L.exec_share ? 'pass' : 'fail') : 'unmeasured', published.length ? `${traced}/${published.length}` : 'no published briefs in window', `>= ${L.exec_share * 100}%`);

  const spawned = (await first(db, `SELECT COUNT(*) n FROM ps_spawn WHERE at >= ?`, start)).n;
  const ratio = done.length ? spawned / done.length : null;
  const active = (await first(db, `SELECT COUNT(*) n FROM items WHERE id LIKE 'ps:%' AND status IN ('open','ready','claimed','blocked')`)).n;
  const hist = (await all(db, `SELECT payload FROM ps_criticality ORDER BY id DESC LIMIT 40`)).map(r => { try { return JSON.parse(r.payload).active; } catch { return null; } }).filter(x => x != null);
  const bounded = active <= L.max_backlog && (hist.length < 4 || active <= 2 * median(hist) + 5);
  T('C3', 'self-sustaining: branching ratio in band and backlog bounded', ratio == null ? 'unmeasured' : (ratio >= L.ratio_min && ratio <= L.ratio_max && bounded ? 'pass' : 'fail'), ratio == null ? 'no finished items' : `ratio ${ratio.toFixed(2)}, active ${active}`, `${L.ratio_min} to ${L.ratio_max}, backlog bounded`);

  const plus = done.filter(d => d.kind === 'plus').length;
  T('C4', 'plus share of finished items', done.length ? (plus / done.length >= L.plus_share ? 'pass' : 'fail') : 'unmeasured', done.length ? `${(plus / done.length * 100).toFixed(0)}% (${plus}/${done.length})` : 'none', `>= ${L.plus_share * 100}%`);

  const res = await all(db, `SELECT probability p, verdict FROM ps_predictions WHERE verdict IS NOT NULL AND scored_at >= ?`, start);
  const unpredicted = (await first(db, `SELECT COUNT(*) n FROM ps_briefs b WHERE b.status='published' AND NOT EXISTS (SELECT 1 FROM ps_predictions p WHERE p.brief_id=b.id)`)).n;
  const brier = res.length ? res.reduce((s, r) => s + (r.p - (r.verdict === 'hit' ? 1 : 0)) ** 2, 0) / res.length : null;
  T('C5', 'predictions scored; Brier better than a coin; every published brief has one', res.length < L.min_resolved ? 'unmeasured' : (brier <= L.max_brier && unpredicted === 0 ? 'pass' : 'fail'),
    res.length < L.min_resolved ? `${res.length} resolved` : `Brier ${brier.toFixed(3)} over ${res.length}, ${unpredicted} unpredicted`, `>= ${L.min_resolved} resolved, Brier <= ${L.max_brier}`);

  const th = await all(db, `SELECT surface, action_class, reliability FROM ps_trust_history ORDER BY id`);
  const by = new Map();
  for (const r of th) { const k = r.surface + '/' + r.action_class; (by.get(k) || by.set(k, []).get(k)).push(r.reliability); }
  let up = 0, down = 0;
  for (const seq of by.values()) for (let i = 1; i < seq.length; i++) { if (seq[i] - seq[i - 1] > 0.005) up++; if (seq[i - 1] - seq[i] > 0.005) down++; }
  T('C6', 'trust ledger moves in both directions', th.length ? (up > 0 && down > 0 ? 'pass' : 'fail') : 'unmeasured', `${up} up, ${down} down`, 'at least one of each');

  const stale = (await first(db, `SELECT COUNT(*) n FROM items i WHERE i.status='blocked' AND i.updated_at < ? AND NOT EXISTS (SELECT 1 FROM items f WHERE f.id = 'ps:fix:' || i.id AND f.status <> 'done')`, iso(now - DAY))).n;
  T('C7', 'no item waits on a person', stale === 0 ? 'pass' : 'fail', `${stale} stale blocked`, '0');

  let cost = (await first(db, `SELECT COALESCE(SUM(cost_usd),0) c FROM ps_model_calls WHERE at >= ?`, start)).c;
  try { cost += (await first(db, `SELECT COALESCE(SUM(cost_usd),0) c FROM router_calls WHERE at >= ?`, start)).c; } catch { /* no router table */ }
  T('C8', 'cost inside the cap', cost <= L.cost_cap_usd ? 'pass' : 'fail', `$${cost.toFixed(2)}`, `<= $${L.cost_cap_usd}`);

  const mc = (await first(db, `SELECT COUNT(*) n FROM ps_model_calls WHERE ok=1 AND at >= ?`, start)).n;
  T('C9', 'a real model role ran', mc > 0 ? 'pass' : 'fail', `${mc} successful calls`, '>= 1');

  const up1 = await all(db, `SELECT id, status FROM items WHERE id LIKE 'UPSTREAM-%'`);
  T('C10', 'defects found here are fixed upstream', up1.length === 0 ? 'unmeasured' : (up1.every(u => u.status === 'done') ? 'pass' : 'fail'), up1.map(u => `${u.id}:${u.status}`).join(' ') || 'none filed', 'all UPSTREAM items done');

  const failing = tests.filter(t => t.status === 'fail').map(t => t.id);
  const unmeasured = tests.filter(t => t.status === 'unmeasured').map(t => t.id);
  return { at: iso(now), window_days: L.window_days, active, tests, failing, unmeasured, critical: failing.length === 0 && unmeasured.length === 0 };
}
