// SPDX-License-Identifier: LicenseRef-Ultrastable-USL-1.0
// Copyright (c) 2026 Rowan Brad Quni-Gudzinas. Non-commercial use free; commercial use requires a license. See LICENSE.
// The executor. Ultrastable's tick claims and dispatches work, and records outcomes; this module is what actually does the work
// for Practical Solutions: it runs each ready item's handler, closes it with a disposition, writes the outcome the trust ledger
// reads, and spawns the follow-up items. One tick runs everything that is due. Nothing here waits on a person.
import { registerFailureMode } from '../vendor/ultrastable/core/kernel/failure.js';
import { FAILURE_MODES } from './failure_modes.js';
import * as claims from '../vendor/ultrastable/core/claims/index.js';
import { detect, unitZ } from './detect.js';
import { verifyBrief, REVIEWER } from './verify.js';
import { makeBrief, hashDataset } from './brief.js';
import { narrate, NARRATOR } from './narrate.js';
import { evaluate } from './criticality.js';
import { extractPractices, EXTRACTOR } from './extract.js';
import { fingerprint } from './llm.js';

export const ANALYST = 'analyst-detector';
const DAY = 86400e3;
const iso = ms => new Date(ms).toISOString().replace('T', ' ').slice(0, 19);
const all = async (db, sql, ...a) => (await db.prepare(sql).bind(...a).all()).results || [];
const first = async (db, sql, ...a) => (await db.prepare(sql).bind(...a).first()) || null;
const run = (db, sql, ...a) => db.prepare(sql).bind(...a).run();

export const PARAM_DEFAULTS = { z: 1.5, stableZ: 1.0, audits_per_cycle: 1 };
export async function getParams(db) {
  const rows = await all(db, `SELECT key, value FROM ps_params`);
  return { ...PARAM_DEFAULTS, ...Object.fromEntries(rows.map(r => [r.key, r.value])) };
}
async function setParam(S, key, to, evidence) {
  const from = (await getParams(S.db))[key];
  await run(S.db, `INSERT INTO ps_params (key, value, updated_at) VALUES (?,?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at`, key, to, S.nowIso);
  await run(S.db, `INSERT INTO ps_decisions (at, param, from_value, to_value, evidence) VALUES (?,?,?,?,?)`, S.nowIso, key, from, to, evidence);
}

// Create an item (idempotent) and record its parent, so the branching ratio is measured from data.
export async function addItem(S, it, parent) {
  const r = await run(S.db, `INSERT OR IGNORE INTO items (id, title, kind, owner_role, done_check, closing_probe, priority, status, surface, action_class)
    VALUES (?,?,?,?,?,?,?, 'ready', ?, ?)`, it.id, it.title, it.kind || 'work', it.owner_role, it.done_check, it.closing_probe || null, it.priority ?? 50, it.surface || null, it.action_class || null);
  if (!r.meta.changes) return false;
  if (parent) await run(S.db, `INSERT OR IGNORE INTO ps_spawn (child_id, parent_id, at) VALUES (?,?,?)`, it.id, parent, S.nowIso);
  if (it.due != null) await run(S.db, `INSERT OR REPLACE INTO ps_schedule (item_id, due_at) VALUES (?,?)`, it.id, iso(it.due));
  return true;
}

async function outcome(S, item, result, evidence) {
  await run(S.db, `INSERT INTO outcomes (item_id, agent, surface, action_class, result, evidence, at) VALUES (?,?,?,?,?,?,?)`,
    item.id, item.owner_role, item.surface || 'ps_work', item.action_class || 'work', result, String(evidence).slice(0, 500), S.nowIso);
}

// ---- handlers: (item, S) -> { evidence } ----

async function loadDataset(S, id) { return JSON.parse((await first(S.db, `SELECT payload FROM ps_datasets WHERE id=?`, id)).payload); }

async function scorePredictions(S, problem, ds, params) {
  const due = await all(S.db, `SELECT * FROM ps_predictions WHERE verdict IS NULL AND problem_id=? AND due_at<=?`, problem.id, S.nowIso);
  let hit = 0, miss = 0;
  for (const p of due) {
    const z = unitZ(ds, p.unit, { z: params.z });
    const ok = z != null && z >= p.target;
    await run(S.db, `UPDATE ps_predictions SET observed=?, verdict=?, scored_at=? WHERE id=?`, z, ok ? 'hit' : 'miss', S.nowIso, p.id);
    await run(S.db, `INSERT INTO outcomes (item_id, agent, surface, action_class, result, evidence, at) VALUES (?,?,?,?,?,?,?)`,
      p.brief_id, ANALYST, 'ps_brief', 'predict', ok ? 'verified' : 'failed', `${p.unit}: z ${z == null ? 'absent' : z.toFixed(2)} vs ${p.target}`, S.nowIso);
    ok ? hit++ : miss++;
  }
  return { hit, miss };
}

async function cycle(item, S) {
  const [, , pid, nStr] = item.id.split(':'); const n = Number(nStr);
  const problem = await first(S.db, `SELECT * FROM ps_problems WHERE id=? AND status='active'`, pid);
  if (!problem) return { evidence: `problem ${pid} not active; chain ends` };
  const cfg = JSON.parse(problem.config);
  const params = await getParams(S.db);
  const ds = await S.sourceFor(cfg.source).get({ epoch: n });
  const hash = hashDataset(ds);
  await run(S.db, `INSERT OR IGNORE INTO ps_datasets (problem_id, epoch, hash, fetched_at, payload) VALUES (?,?,?,?,?)`, pid, n, hash, S.nowIso, JSON.stringify(ds));
  const dsRow = await first(S.db, `SELECT id FROM ps_datasets WHERE problem_id=? AND hash=?`, pid, hash);

  const scored = await scorePredictions(S, problem, ds, params);
  const d = detect(ds, { z: params.z, stableZ: params.stableZ, topK: cfg.top_k || 3, boot: cfg.boot || 100, seed: n + 1 });
  const known = new Set((await all(S.db, `SELECT unit FROM ps_briefs WHERE problem_id=? AND status<>'rejected'`, pid)).map(r => r.unit));
  let created = 0;
  for (const spot of d.spots) {
    if (known.has(spot.id)) continue;
    const b = makeBrief({ ...problem, config: cfg }, ds, spot, hash);
    await run(S.db, `INSERT OR IGNORE INTO ps_briefs (id, problem_id, dataset_id, unit, z, stability, payload, status, created_by, created_at) VALUES (?,?,?,?,?,?,?, 'draft', ?, ?)`,
      b.id, pid, dsRow.id, b.unit, b.z, b.stability, JSON.stringify(b), ANALYST, S.nowIso);
    await addItem(S, { id: `ps:verify:${b.id}`, title: `Verify brief ${b.name} (${pid})`, owner_role: 'reviewer', priority: 20, surface: 'ps_verify', action_class: 'verify',
      done_check: 'leave-one-out and permutation verdict stored on the brief by a reviewer different from its author', closing_probe: 'ps_briefs.verified_by is set' }, item.id);
    created++;
  }
  const refresh = (cfg.refresh_days || 30) * DAY;
  await addItem(S, { id: `ps:cycle:${pid}:${n + 1}`, title: `Cycle ${n + 1} for ${pid}: refresh data, score predictions, detect`, owner_role: 'analyst', priority: 40, surface: 'ps_detect', action_class: 'detect',
    done_check: 'dataset stored, due predictions scored, detector run', closing_probe: 'ps_datasets row for this epoch', due: S.now + refresh }, item.id);
  for (let k = 0; k < params.audits_per_cycle; k++) {
    await addItem(S, { id: `ps:audit:${pid}:${n}:${k}`, title: `Robustness audit ${k} of cycle ${n} for ${pid}`, kind: 'plus', owner_role: 'analyst', priority: 60, surface: 'ps_audit', action_class: 'audit',
      done_check: 'detector spot set compared across settings', closing_probe: 'ps_audits row' }, item.id);
  }
  if (n > 0 && n % 3 === 0) await addItem(S, { id: `ps:calibrate:${pid}:${n}`, title: `Calibrate detector threshold from scored predictions (${pid}, cycle ${n})`, kind: 'plus', owner_role: 'analyst', priority: 55, surface: 'ps_calibrate', action_class: 'calibrate',
    done_check: 'threshold decision recorded with evidence', closing_probe: 'ps_decisions row or insufficient-data note' }, item.id);
  return { evidence: `cycle ${n}: ${ds.units.length} units, ${d.spots.length} spots, ${created} new briefs, predictions scored ${scored.hit} hit ${scored.miss} miss` };
}

async function verify(item, S) {
  const id = item.id.slice('ps:verify:'.length);
  const row = await first(S.db, `SELECT * FROM ps_briefs WHERE id=?`, id);
  if (!row) throw new Error('brief missing');
  if (row.created_by === REVIEWER) throw new Error('reviewer equals author');
  const ds = await loadDataset(S, row.dataset_id);
  const b = JSON.parse(row.payload);
  const v = verifyBrief(ds, b, { perms: S.config.ps?.perms ?? 500 });
  const status = v.verdict === 'verified' ? 'verified' : v.verdict === 'unit_only' ? 'unit_only' : 'rejected';
  await run(S.db, `UPDATE ps_briefs SET status=?, verified_by=?, verification=? WHERE id=?`, status, REVIEWER, JSON.stringify(v), id);
  if (status !== 'rejected') {
    // The prediction is registered after the independent check, with a probability learned from how this class of brief has fared.
    const problem = await first(S.db, `SELECT config FROM ps_problems WHERE id=?`, row.problem_id);
    const refresh = (JSON.parse(problem.config).refresh_days || 30) * DAY;
    const params = await getParams(S.db);
    const hist = await first(S.db, `SELECT COUNT(*) n, SUM(CASE WHEN verdict='hit' THEN 1 ELSE 0 END) h FROM ps_predictions WHERE problem_id=? AND klass=? AND verdict IS NOT NULL`, row.problem_id, status);
    // Q-YEARSIM-calibration: a flat 0.5 prior was worse than a coin (Brier 0.278). A bright spot regresses toward its peers, and a brief that only
    // passed the unit check (not leave-one-out and permutation) regresses more, so the prior is by class, below 0.5 for unit_only, and the
    // per-problem record moves it with four pseudo-observations. Bootstrap stability is not used: it is ~1 for almost every spot and was overconfident (Brier 0.57).
    const prior = status === 'verified' ? 0.55 : 0.3;
    const prob = ((hist.h || 0) + prior * 4) / (hist.n + 4);
    await run(S.db, `INSERT OR IGNORE INTO ps_predictions (id, brief_id, problem_id, unit, klass, metric, op, target, probability, due_at) VALUES (?,?,?,?,?,?,?,?,?,?)`,
      `pred:${id}`, id, row.problem_id, row.unit, status, 'ps_residual_z', '>=', params.stableZ, Math.min(0.99, Math.max(0.01, prob)), iso(S.now + refresh));
    await run(S.db, `INSERT OR IGNORE INTO predictions (id, item_id, metric, op, target, due_at) VALUES (?,?,?,?,?,?)`, `core:pred:${id}`, `ps:brief:${id}`, 'ps_residual_z', '>=', params.stableZ, iso(S.now + refresh)); // graded by core through the registered domain metric
  }
  if (status !== 'rejected') await addItem(S, { id: `ps:extract:${id}`, title: `Extract candidate practices for ${b.name} (${b.problem})`, owner_role: 'analyst', priority: 25, surface: 'ps_extract', action_class: 'extract',
    done_check: 'model practice hypotheses stored on the brief, or the missing model route recorded', closing_probe: 'ps_extractions row for the brief' }, item.id);
  return { evidence: `${b.name}: ${v.verdict} (${v.reason || ''})` };
}

// The model reads the verified brief and lists named practices as unverified hypotheses. No model route is not a failure of the loop: it is recorded,
// the brief still publishes, and criticality test C9 stays red until a route works. A model answer that is not the expected JSON is recorded as a failed call (ok=0)
// with its reason and the brief still publishes: the statistical record never waits on a model.
async function extract(item, S) {
  const id = item.id.slice('ps:extract:'.length);
  const row = await first(S.db, `SELECT payload, status FROM ps_briefs WHERE id=?`, id);
  if (!row || !['verified', 'unit_only', 'published'].includes(row.status)) throw new Error('brief not verified');
  const r = await extractPractices({ fetch: S.fetch, secrets: S.secrets, brief: JSON.parse(row.payload) });
  if (r.called) await run(S.db, `INSERT INTO ps_model_calls (at, role, model, ok, cost_usd) VALUES (?,?,?,?,0)`, S.nowIso, EXTRACTOR, `${r.route || 'none'}:${r.model || 'unknown'}`, r.ok ? 1 : 0);
  const stored = r.ok ? { practices: r.practices, artefact_risks: r.artefact_risks, route: r.route, model: r.model, at: S.nowIso } : { practices: [], artefact_risks: [], route: null, skipped: r.reason, routes: fingerprint(S.secrets), at: S.nowIso };
  await run(S.db, `INSERT OR REPLACE INTO ps_extractions (brief_id, payload, route, at) VALUES (?,?,?,?)`, id, JSON.stringify(stored), stored.route, S.nowIso);
  const b = JSON.parse(row.payload);
  if (row.status !== 'published') await addItem(S, { id: `ps:publish:${id}`, title: `Publish brief ${b.name} (${b.problem})`, owner_role: 'operations', priority: 30, surface: 'ps_publish', action_class: 'publish',
    done_check: 'brief status is published and its prediction is registered', closing_probe: 'ps_briefs.status = published' }, item.id);
  return { evidence: r.ok ? `${b.name}: ${r.practices.length} practice hypothesis(es) via ${r.route}` : `${b.name}: no model route (${r.reason})` };
}

async function publish(item, S) {
  const id = item.id.slice('ps:publish:'.length);
  const row = await first(S.db, `SELECT * FROM ps_briefs WHERE id=?`, id);
  if (!row || !['verified', 'unit_only'].includes(row.status)) throw new Error('brief not verified');
  let narrative = null;
  const key = S.secrets.ANTHROPIC_API_KEY;
  if (key || (S.secrets.AI && S.secrets.AI.run)) {
    const r = await narrate({ fetch: S.fetch, key, ai: S.secrets.AI, brief: JSON.parse(row.payload) });
    await run(S.db, `INSERT INTO ps_model_calls (at, role, model, ok, cost_usd) VALUES (?,?,?,?,0)`, S.nowIso, NARRATOR, r.model || 'unknown', r.ok ? 1 : 0);
    narrative = r.text;
  }
  await run(S.db, `UPDATE ps_briefs SET status='published', published_at=?, narrative=? WHERE id=?`, S.nowIso, narrative, id);
  // Depositing into a public research record speaks as the owner: a gate card with its default in effect and a probe, never prose.
  await run(S.db, `INSERT OR IGNORE INTO gate_cards (id, what, why_gated, default_in_effect, prepared_by_fleet, closing_probe)
    VALUES ('ps-deposit-external', 'Deposit published briefs into the public research record', 'outward publication under the owner''s name',
            'briefs stay in this instance and its repository export', 'briefs rendered and checksummed', 'env:PS_DEPOSIT_TOKEN')`);
  return { evidence: `published ${row.unit}${narrative ? ' with model narrative' : ''}` };
}

async function audit(item, S) {
  const [, , pid] = item.id.split(':');
  const row = await first(S.db, `SELECT id FROM ps_datasets WHERE problem_id=? ORDER BY id DESC LIMIT 1`, pid);
  if (!row) throw new Error('no dataset');
  const ds = await loadDataset(S, row.id);
  const params = await getParams(S.db);
  const set = o => new Set(detect(ds, { z: params.z, topK: 8, boot: 30, ...o }).spots.map(s => s.id));
  const base = set({}), variants = [set({ lambda: 0.5 }), set({ z: params.z + 0.5 }), set({ peers: 8 })];
  const jac = (a, b) => (a.size + b.size === 0 ? 1 : [...a].filter(x => b.has(x)).length / new Set([...a, ...b]).size);
  const j = variants.reduce((s, v) => s + jac(base, v), 0) / variants.length;
  await run(S.db, `INSERT INTO ps_audits (problem_id, at, jaccard, detail) VALUES (?,?,?,?)`, pid, S.nowIso, j, JSON.stringify({ base: [...base] }));
  if (j < 0.5) throw new Error(`spot set unstable across settings (jaccard ${j.toFixed(2)})`);
  return { evidence: `spot set stable across settings, jaccard ${j.toFixed(2)}` };
}

async function calibrate(item, S) {
  const [, , pid] = item.id.split(':');
  const rows = await all(S.db, `SELECT verdict FROM ps_predictions WHERE problem_id=? AND verdict IS NOT NULL`, pid);
  if (rows.length < 5) return { evidence: `only ${rows.length} resolved predictions; threshold unchanged` };
  const rate = rows.filter(r => r.verdict === 'hit').length / rows.length;
  const params = await getParams(S.db);
  let to = params.z;
  if (rate < 0.5) to = Math.min(3, params.z + 0.25);
  else if (rate > 0.85) to = Math.max(1, params.z - 0.25);
  if (to !== params.z) await setParam(S, 'z', to, `hit rate ${(rate * 100).toFixed(0)}% over ${rows.length} resolved predictions`);
  return { evidence: `hit rate ${(rate * 100).toFixed(0)}% over ${rows.length}; z ${params.z} -> ${to}` };
}

async function rebalance(item, S) {
  const params = await getParams(S.db);
  const to = Math.min(3, params.audits_per_cycle + 1);
  if (to !== params.audits_per_cycle) await setParam(S, 'audits_per_cycle', to, `plus share below target: ${item.title}`);
  return { evidence: `audits per cycle ${params.audits_per_cycle} -> ${to}` };
}

// A ladder move is applied to the instance's own ledger only after the reliability is recomputed from raw outcomes by a separate query.
async function ladder(item, S) {
  const [surface, action] = [item.surface, item.action_class];
  const to = item.id.split('-').pop();
  const o = await first(S.db, `SELECT COUNT(*) n, SUM(CASE WHEN result='verified' THEN 1 ELSE 0 END) ok FROM outcomes WHERE surface=? AND action_class=?`, surface, action);
  const { trust, ladder: lad } = S.config.policy;
  const rel = (o.ok + trust.baseline * trust.prior_weight) / (o.n + trust.prior_weight);
  const cur = await first(S.db, `SELECT rung FROM trust_ledger WHERE surface=? AND action_class=?`, surface, action);
  if (!cur) throw new Error('no ledger row');
  const up = lad.rungs.indexOf(to) > lad.rungs.indexOf(cur.rung);
  if (up && rel < lad.promote_when.min_reliability) return { evidence: `promotion to ${to} not supported by recomputed reliability ${rel.toFixed(2)}; closed without change` };
  await run(S.db, `UPDATE trust_ledger SET rung=?, updated_at=? WHERE surface=? AND action_class=?`, to, S.nowIso, surface, action);
  await run(S.db, `INSERT INTO ps_decisions (at, param, from_value, to_value, evidence) VALUES (?,?,?,?,?)`, S.nowIso, `rung:${surface}/${action}`, lad.rungs.indexOf(cur.rung), lad.rungs.indexOf(to), `recomputed reliability ${rel.toFixed(2)} over ${o.n}`);
  return { evidence: `${surface}/${action}: ${cur.rung} -> ${to} (recomputed reliability ${rel.toFixed(2)} over ${o.n})` };
}

async function tickfail(item, S) {
  const last = await first(S.db, `SELECT errors, steps_completed, steps_total FROM tick_runs WHERE finished_at IS NOT NULL ORDER BY id DESC LIMIT 1`);
  if (last && !last.errors && last.steps_completed === last.steps_total) return { evidence: 'recovered: the latest tick completed every step' };
  throw new Error('latest tick still has errors');
}

async function fix(item, S) {
  const target = item.id.slice('ps:fix:'.length);
  await run(S.db, `UPDATE items SET status='ready', blocker=NULL, updated_at=? WHERE id=? AND status='blocked'`, S.nowIso, target);
  await run(S.db, `DELETE FROM ps_attempts WHERE item_id=?`, target);
  return { evidence: `released ${target} for one more run` };
}

const ROUTES = [
  ['ps:cycle:', cycle], ['ps:verify:', verify], ['ps:extract:', extract], ['ps:publish:', publish], ['ps:audit:', audit], ['ps:calibrate:', calibrate],
  ['REBALANCE-', rebalance], ['LADDER-', ladder], ['TICKFAIL-', tickfail], ['ps:fix:', fix],
];
const handlerFor = id => (ROUTES.find(([p]) => id.startsWith(p)) || [])[1];

// ---- the tick steps ----

export function psSteps({ fetch: f = globalThis.fetch, secrets = {}, sourceFor, config }) {
  const work = {
    name: 'ps_work',
    async run(db, ctx) {
      const S = { db, now: ctx.now, nowIso: ctx.nowIso, config, fetch: f, secrets, sourceFor };
      const limit = config.ps?.max_per_tick ?? 8;
      // Briefs that predate the extraction stage (or whose item was never filed) get one: nothing published is left without its model pass.
      for (const b of await all(db, `SELECT id, payload FROM ps_briefs WHERE status IN ('verified','unit_only','published') AND id NOT IN (SELECT brief_id FROM ps_extractions)`)) {
        const nm = JSON.parse(b.payload);
        await addItem(S, { id: `ps:extract:${b.id}`, title: `Extract candidate practices for ${nm.name} (${nm.problem})`, owner_role: 'analyst', priority: 25, surface: 'ps_extract', action_class: 'extract',
          done_check: 'model practice hypotheses stored on the brief, or the missing model route recorded', closing_probe: 'ps_extractions row for the brief' });
      }
      // A brief whose model pass was skipped is retried when the set of bound model routes has changed since, or after 6 hours, so a route that comes up later fills it in.
      const routesNow = fingerprint(secrets);
      for (const x of await all(db, `SELECT brief_id, at, payload FROM ps_extractions WHERE payload LIKE '%"skipped"%'`)) {
        const was = (JSON.parse(x.payload).routes || '');
        if (was === routesNow && x.at >= iso(ctx.now - 6 * 3600e3)) continue;
        await run(db, `UPDATE items SET status='ready', updated_at=? WHERE id=? AND status='done'`, ctx.nowIso, `ps:extract:${x.brief_id}`);
        await run(db, `DELETE FROM ps_extractions WHERE brief_id=?`, x.brief_id);
      }
      const ready = await all(db, `SELECT * FROM items WHERE status='ready' ORDER BY priority, created_at LIMIT 300`);
      let done = 0, failed = 0;
      for (const item of ready) {
        if (done + failed >= limit) break;
        const h = handlerFor(item.id);
        if (!h) continue;
        const sched = await first(db, `SELECT due_at FROM ps_schedule WHERE item_id=?`, item.id);
        if (sched && sched.due_at > ctx.nowIso) continue;
        const cctx = { db, now: () => ctx.now, config };
        const got = await claims.acquire(cctx, { kind: 'work', key: `item:${item.id}`, holder: `ps-${item.owner_role}`, item_id: item.id, ttl_minutes: 30, intent: item.title });
        if (!got.ok) continue;
        try {
          const r = await h(item, S);
          await run(db, `UPDATE items SET status='done', disposition=?, updated_at=? WHERE id=?`, `completed: ${r.evidence}`.slice(0, 400), ctx.nowIso, item.id);
          await outcome(S, item, 'verified', r.evidence);
          done++;
        } catch (e) {
          const a = (await first(db, `SELECT n FROM ps_attempts WHERE item_id=?`, item.id))?.n ?? 0;
          await run(db, `INSERT INTO ps_attempts (item_id, n, last_error) VALUES (?,?,?) ON CONFLICT(item_id) DO UPDATE SET n=excluded.n, last_error=excluded.last_error`, item.id, a + 1, String(e.message).slice(0, 300));
          await outcome(S, item, 'failed', e.message);
          if (a + 1 >= 3) {
            await run(db, `UPDATE items SET status='blocked', blocker=?, updated_at=? WHERE id=?`, String(e.message).slice(0, 200), ctx.nowIso, item.id);
            await addItem(S, { id: `ps:fix:${item.id}`, title: `Retry blocked item ${item.id}`, kind: 'fix', owner_role: 'operations', priority: 0, done_check: 'the blocked item is released', closing_probe: 'blocked item ready again' }, item.id);
          } else await run(db, `UPDATE items SET status='ready', updated_at=? WHERE id=?`, ctx.nowIso, item.id);
          failed++;
        } finally {
          await claims.release(cctx, { kind: 'work', key: `item:${item.id}`, token: got.token, outcome: 'done' });
        }
      }
      ctx.notes.push(`ps_work: ${done} done, ${failed} failed`);
    },
  };
  const snapshot = {
    name: 'ps_trust_snapshot',
    async run(db, ctx) {
      const rows = await all(db, `SELECT surface, action_class, reliability, rung FROM trust_ledger`);
      for (const r of rows) await run(db, `INSERT INTO ps_trust_history (at, surface, action_class, reliability, rung) VALUES (?,?,?,?,?)`, ctx.nowIso, r.surface, r.action_class, r.reliability, r.rung);
    },
  };
  const crit = {
    name: 'ps_criticality',
    async run(db, ctx) {
      const rep = await evaluate(db, { now: ctx.now, config });
      await run(db, `INSERT INTO ps_criticality (at, critical, payload) VALUES (?,?,?)`, ctx.nowIso, rep.critical ? 1 : 0, JSON.stringify(rep));
      ctx.notes.push(`criticality: ${rep.critical ? 'CRITICAL' : 'not yet'} (${rep.failing.join(',') || 'all measured tests pass'})`);
    },
  };
  // UPSTREAM-1 closes only on evidence that the upstream fix works here: core itself graded a ps_residual_z prediction.
  const upstream = {
    name: 'ps_upstream',
    async run(db, ctx) {
      // UPSTREAM-2 closes on evidence that the vendored core outreach migration is applied here.
      const up2 = await first(db, `SELECT id FROM items WHERE id='UPSTREAM-2' AND status!='done'`);
      if (up2 && await first(db, `SELECT name FROM sqlite_master WHERE type='table' AND name='outreach_intents'`)) {
        const ev2 = 'core/feed and core/outreach are vendored from ultrastable/workers#206 and the outreach tables exist in this database';
        await run(db, `UPDATE items SET status='done', disposition=?, updated_at=? WHERE id='UPSTREAM-2'`, `completed: ${ev2}`, ctx.nowIso);
        await run(db, `INSERT INTO outcomes (item_id, agent, surface, action_class, result, evidence, at) VALUES ('UPSTREAM-2', ?, 'ps_upstream', 'verify', 'verified', ?, ?)`, ANALYST, ev2, ctx.nowIso);
        ctx.notes.push('upstream: UPSTREAM-2 closed on evidence');
      }
      const it = await first(db, `SELECT id FROM items WHERE id='UPSTREAM-1' AND status!='done'`);
      if (!it) return;
      const r = await first(db, `SELECT COUNT(*) n FROM predictions WHERE metric='ps_residual_z' AND verdict IS NOT NULL AND observed IS NOT NULL`);
      if (!r.n) { ctx.notes.push('upstream: UPSTREAM-1 waits for core to grade its first ps_residual_z prediction'); return; }
      const ev = `core graded ${r.n} prediction(s) through the registered domain metric (ultrastable/workers#175)`;
      await run(db, `UPDATE items SET status='done', disposition=?, updated_at=? WHERE id='UPSTREAM-1'`, `completed: ${ev}`, ctx.nowIso);
      await run(db, `INSERT INTO outcomes (item_id, agent, surface, action_class, result, evidence, at) VALUES ('UPSTREAM-1', ?, 'ps_upstream', 'verify', 'verified', ?, ?)`, ANALYST, ev, ctx.nowIso);
      ctx.notes.push('upstream: UPSTREAM-1 closed on evidence');
    },
  };
  const modes = {
    name: 'ps_failure_modes',
    async run(db, ctx) { for (const fm of FAILURE_MODES) await registerFailureMode(db, fm, ctx.now); return { registered: FAILURE_MODES.length }; },
  };
  return [modes, work, snapshot, upstream, crit];
}
