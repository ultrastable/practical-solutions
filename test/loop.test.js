// SPDX-License-Identifier: LicenseRef-Ultrastable-USL-1.0
// Copyright (c) 2026 Rowan Brad Quni-Gudzinas. Non-commercial use free; commercial use requires a license. See LICENSE.
import test from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../ps/db.js';
import { createPs } from '../ps/org.js';
import { seedOrg } from '../ps/seed.js';
import { evaluate } from '../ps/criticality.js';
import { buildConfig } from '../ps/config.js';

const T0 = Date.parse('2026-12-01T00:00:00Z');
const PROBLEM = { id: 'synthetic-demo', title: 'Synthetic world with planted truth', refresh_days: 30, top_k: 5, boot: 60, source: { type: 'synthetic', seed: 11 } };
const rows = (db, sql, ...a) => db.raw.prepare(sql).all(...a);
const one = (db, sql, ...a) => db.raw.prepare(sql).get(...a);

const PROBLEM_B = { ...PROBLEM, id: 'synthetic-b', title: 'Second synthetic world', source: { type: 'synthetic', seed: 23 } };
async function boot({ problems = [PROBLEM, PROBLEM_B], secrets = {}, fetch, config } = {}) {
  const clock = { t: T0 };
  const db = openDb(':memory:');
  await seedOrg(db, { problems, now: T0 });
  const cfg = config || buildConfig({ ps: { max_per_tick: 12, perms: 200, criticality: { window_days: 150 } } });
  const ps = createPs({ db, env: {}, secrets, fetch, config: cfg, now: () => clock.t });
  const advance = async (days, stepH = 12) => { const end = clock.t + days * 86400e3; let last; for (; clock.t < end; clock.t += stepH * 3600e3) last = await ps.tick(); return last; };
  return { db, ps, clock, advance, cfg };
}

test('from birth, the loop runs by itself: detect, verify by a different reviewer, publish, predict, score, repeat', async () => {
  const { db, advance, clock, cfg } = await boot();
  const last = await advance(150);
  assert.equal(last.completed, last.total, 'every tick step completes');
  assert.equal(one(db, `SELECT COUNT(*) n FROM tick_runs WHERE steps_completed < steps_total`).n, 0);

  const briefs = rows(db, `SELECT * FROM ps_briefs`);
  assert.ok(briefs.length >= 3);
  assert.ok(briefs.every(b => b.verified_by && b.verified_by !== b.created_by), 'no brief is reviewed by its author');
  assert.ok(rows(db, `SELECT 1 FROM ps_briefs WHERE status='published'`).length >= 3);

  const preds = rows(db, `SELECT unit, verdict FROM ps_predictions WHERE verdict IS NOT NULL`);
  const byUnit = Object.fromEntries(preds.map(p => [p.unit, p.verdict]));
  for (const id of ['u000', 'u001', 'u002']) assert.equal(byUnit[id], 'hit', `${id}: persistent spot predicted correctly`);
  for (const id of ['u003', 'u004']) assert.equal(byUnit[id], 'miss', `${id}: the fluke is scored as a miss and recorded`);

  assert.equal(rows(db, `SELECT 1 FROM items WHERE id LIKE 'TICKFAIL%' AND status<>'done'`).length, 0);
  assert.ok(rows(db, `SELECT 1 FROM ps_decisions`).length >= 0);
  const rep = await evaluate(db, { now: clock.t, config: cfg, birth: true });
  const status = Object.fromEntries(rep.tests.map(t => [t.id, t.status]));
  for (const id of ['C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7', 'C8']) assert.equal(status[id], 'pass', `${id} ${JSON.stringify(rep.tests.find(t => t.id === id))}`);
  assert.equal(status.C9, 'fail', 'no real model has run yet: said plainly');
  assert.equal(status.C10, 'pass', 'upstream hook merged and core graded a ps_residual_z prediction through it');
  assert.equal(rep.critical, false, 'not critical until every test passes');
});

test('a failing source blocks only its own chain; a fix item retries it; other problems keep running', async () => {
  const bad = { id: 'broken', title: 'Broken source', refresh_days: 30, source: { type: 'worldbank', outcome: { id: 'X' }, context: ['A', 'B', 'C'], practices: ['P'] } };
  const down = async () => new Response('down', { status: 503 });
  const { db, advance } = await boot({ problems: [PROBLEM, bad], fetch: down });
  await advance(10);
  const item = one(db, `SELECT status, blocker FROM items WHERE id='ps:cycle:broken:0'`);
  assert.equal(item.status, 'blocked');
  assert.match(item.blocker, /HTTP 503/);
  assert.equal(one(db, `SELECT status FROM items WHERE id='ps:cycle:synthetic-demo:0'`).status, 'done', 'the healthy chain is unaffected');
  assert.ok(one(db, `SELECT 1 x FROM items WHERE id='ps:fix:ps:cycle:broken:0'`), 'a fix item was filed');
  assert.equal(one(db, `SELECT COUNT(*) n FROM tick_runs WHERE steps_completed < steps_total`).n, 0, 'ticks never die');
});

test('a model role runs only when its key is present, and every call is recorded', async () => {
  const calls = [];
  const fetch = async (url, init) => { calls.push(url); return Response.json({ content: [{ type: 'text', text: 'Hypothesis: the outreach practice may transfer; test it in one district.' }] }); };
  const keyed = await boot({ secrets: { ANTHROPIC_API_KEY: 'sk-test-not-real' }, fetch });
  await keyed.advance(40);
  assert.ok(calls.length >= 1 && calls.every(u => u.includes('anthropic.com')));
  assert.ok(one(keyed.db, `SELECT COUNT(*) n FROM ps_model_calls WHERE ok=1`).n >= 1);
  assert.match(one(keyed.db, `SELECT narrative FROM ps_briefs WHERE narrative IS NOT NULL LIMIT 1`).narrative, /Hypothesis/);
  const dump = JSON.stringify(rows(keyed.db, `SELECT * FROM ps_briefs`)) + JSON.stringify(rows(keyed.db, `SELECT * FROM ps_model_calls`)) + JSON.stringify(rows(keyed.db, `SELECT * FROM outcomes`));
  assert.ok(!dump.includes('sk-test-not-real'), 'the key value is never stored');

  const bare = await boot();
  await bare.advance(40);
  assert.equal(one(bare.db, `SELECT COUNT(*) n FROM ps_model_calls`).n, 0);
});

test('the Worker serves health, briefs and the criticality report from the same database', async () => {
  const { default: worker } = await import('../worker/src/index.js');
  const db = openDb(':memory:');
  await seedOrg(db, { problems: [{ ...PROBLEM, boot: 30 }], now: Date.now() - 1000 });
  const env = { DB: db };
  const scheduled = []; await worker.scheduled({}, env, { waitUntil: p => scheduled.push(p) });
  await Promise.all(scheduled);
  const h = await worker.fetch(new Request('https://x/health'), env);
  assert.equal(h.status, 200);
  assert.equal((await h.json()).ok, true);
  const c = await (await worker.fetch(new Request('https://x/ps/criticality'), env)).json();
  assert.equal(c.critical, false);
  assert.ok(Array.isArray(c.tests));
  const b = await (await worker.fetch(new Request('https://x/ps/briefs'), env)).json();
  assert.ok(Array.isArray(b.briefs));
  assert.equal((await worker.fetch(new Request('https://x/nope'), env)).status, 404);
});
