// SPDX-License-Identifier: LicenseRef-Ultrastable-USL-1.0
// Copyright (c) 2026 Rowan Brad Quni-Gudzinas. Non-commercial use free; commercial use requires a license. See LICENSE.
// One scheduled cycle on persisted state. The database file is committed with the ledger, so predictions registered in one cycle
// are scored by a later one. Each cycle: tick, read the essential variables, record what the loop changed about itself (the
// corrective actions the tick took) and what is out of bounds, publish the verified briefs as open data with a changelog.
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { openDb } from './db.js';
import { createPs } from './org.js';
import { seedOrg } from './seed.js';
import { evaluate } from './criticality.js';
import { buildConfig } from './config.js';
import { getParams } from './steps.js';
import { renderBrief } from './brief.js';

const all = async (db, sql, ...a) => (await db.prepare(sql).bind(...a).all()).results || [];
const first = async (db, sql, ...a) => (await db.prepare(sql).bind(...a).first()) || null;

const ex = async (db, id) => ((await first(db, `SELECT payload FROM ps_extractions WHERE brief_id=?`, id)) || {}).payload;

export async function essentials(db) {
  const briefs = Object.fromEntries((await all(db, `SELECT status, COUNT(*) n FROM ps_briefs GROUP BY status`)).map(r => [r.status, r.n]));
  const res = await all(db, `SELECT probability p, verdict FROM ps_predictions WHERE verdict IS NOT NULL`);
  const open = (await first(db, `SELECT COUNT(*) n FROM ps_predictions WHERE verdict IS NULL`)).n;
  const brier = res.length ? res.reduce((s, r) => s + (r.p - (r.verdict === 'hit' ? 1 : 0)) ** 2, 0) / res.length : null;
  const errs = await first(db, `SELECT COUNT(*) n FROM tick_runs WHERE errors IS NOT NULL AND errors <> '' AND errors <> '[]'`);
  return {
    briefs, predictions_resolved: res.length, predictions_open: open, hit_rate: res.length ? res.filter(r => r.verdict === 'hit').length / res.length : null,
    brier, active_items: (await first(db, `SELECT COUNT(*) n FROM items WHERE status IN ('open','ready','claimed','blocked')`)).n, tick_runs_with_errors: errs.n,
  };
}

export async function publish(db, out, cycleNo, at) {
  mkdirSync(out, { recursive: true });
  const rows = await all(db, `SELECT * FROM ps_briefs WHERE status='published' ORDER BY published_at`);
  const idxFile = path.join(out, 'index.json');
  const prev = existsSync(idxFile) ? JSON.parse(readFileSync(idxFile, 'utf8')) : [];
  const known = new Set(prev.map(x => x.id));
  const index = [], added = [];
  for (const r of rows) {
    const b = JSON.parse(r.payload), md = renderBrief(b, JSON.parse(r.verification || 'null'), r.narrative, JSON.parse((await ex(db, r.id)) || 'null'));
    const f = `${b.problem}-${b.unit}.md`;
    writeFileSync(path.join(out, f), md + '\n');
    const e = { file: f, id: b.id, z: b.z, status: 'hypothesis, to be checked by a person or partner', sha256: createHash('sha256').update(md).digest('hex') };
    index.push(e);
    if (!known.has(b.id)) added.push(b.id);
  }
  writeFileSync(idxFile, JSON.stringify(index, null, 1) + '\n');
  if (added.length) appendFileSync(path.join(out, 'CHANGELOG.jsonl'), JSON.stringify({ cycle: cycleNo, at, added }) + '\n');
  return { published_total: index.length, added };
}

async function birthHash(problems, now) {
  const db = openDb(':memory:');
  await seedOrg(db, { problems, now });
  const schema = db.raw.prepare(`SELECT sql FROM sqlite_master WHERE sql IS NOT NULL ORDER BY name`).all().map(r => r.sql).join('\n');
  return createHash('sha256').update(schema + JSON.stringify(db.raw.prepare(`SELECT id, owner_role, status FROM items ORDER BY id`).all())).digest('hex');
}

export async function runCycle({ db: file, ledger, out, n = 4, run = '0', problems, now = Date.now, env = process.env, fetch: f = globalThis.fetch }) {
  mkdirSync(path.dirname(file), { recursive: true }); mkdirSync(path.dirname(ledger), { recursive: true });
  const fresh = !existsSync(file);
  const db = openDb(file);
  if (fresh) await seedOrg(db, { problems, now: now() });
  const t0 = new Date(now()).toISOString().replace('T', ' ').slice(0, 19);
  const before = await essentials(db), params0 = await getParams(db);
  const ps = createPs({ db, env, secrets: env, fetch: f, now });
  const notes = [];
  for (let i = 0; i < n; i++) notes.push((await ps.tick()).report);
  const rep = await evaluate(db, { now: now(), config: buildConfig(), birth: (await birthHash(problems, now())) === (await birthHash(problems, now())) });
  const after = await essentials(db), params1 = await getParams(db);
  const corrective = await all(db, `SELECT at, param, from_value, to_value, evidence FROM ps_decisions WHERE at >= ? ORDER BY id`, t0);
  const published = await publish(db, out, run, t0);
  const rec = {
    schema: 'ps-cycle/1', run, at: t0, ticks: n, fresh_state: fresh,
    essential: { before, after }, params: { before: params0, after: params1 },
    out_of_bounds: rep.tests.filter(t => t.status === 'fail').map(t => t.id), unmeasured: rep.unmeasured, critical: rep.critical,
    corrective_actions: corrective, published,
    problems: problems.map(p => ({ id: p.id, source: p.source.type, outcome: p.source.outcome?.id, context: p.source.context, why: p.title })),
    caveat: 'findings are leads that need a person or partner to check; unsupervised discovery has not been shown end to end to produce implemented solutions',
  };
  appendFileSync(ledger, JSON.stringify(rec) + '\n');
  db.raw.close?.();
  return rec;
}
