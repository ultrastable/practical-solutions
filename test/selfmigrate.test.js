import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { openDb } from '../ps/db.js';
import { splitSql, applyPending } from '../ps/selfmigrate.js';
import { ALLOW, FILES } from '../worker/src/selfmigrate.gen.js';

test('splitSql keeps a trigger body in one statement and drops comments', () => {
  const st = splitSql(readFileSync(new URL('../worker/migrations/0052_access_access.sql', import.meta.url), 'utf8'));
  const trig = st.filter(s => /^CREATE TRIGGER/i.test(s));
  assert.equal(trig.length, 2);
  assert.ok(trig.every(s => /\bEND;$/.test(s)));
  assert.ok(trig[1].includes('INSERT OR IGNORE INTO items'));
});

// The applier takes a few migrations per run (MIGRATE-GAP-1), so a database far behind catches up over several ticks; a run that applies
// nothing while migrations are still pending is a failure, never a wait.
async function catchUp(db, at) {
  const out = [];
  for (let i = 0; i < ALLOW.length + 1; i++) {
    const r = await applyPending(db, FILES, ALLOW, at, 'ps_applied_migrations');
    out.push(...r.filter(x => !x.waiting));
    if (!r.some(x => x.waiting)) return out;
    if (!r.some(x => x.ok)) throw new Error('pending migrations and none applied: ' + JSON.stringify(r.slice(0, 3)));
  }
  throw new Error('did not converge');
}

test('a database missing the access triggers gets them from the allow-listed migration, once, and re-applying is a no-op', async () => {
  const db = openDb();
  for (const t of ['access_permit_guard', 'access_ask_guard']) db.raw.exec(`DROP TRIGGER IF EXISTS ${t}`);
  const has = () => db.raw.prepare("SELECT name FROM sqlite_master WHERE type='trigger' AND name LIKE 'access_%'").all().length;
  assert.equal(has(), 0);
  const r = await catchUp(db, '2026-11-17 14:00:00');
  assert.deepEqual(r.filter(x => !x.ok), []);
  assert.equal(has(), 2);
  assert.deepEqual(await applyPending(db, FILES, ALLOW, '2026-11-17 14:10:00', 'ps_applied_migrations'), []);
});

test('a migration that fails is reported, not thrown, and not recorded', async () => {
  const db = openDb();
  const r = await applyPending(db, { 'x.sql': 'CREATE TABLE a (' }, ['x.sql'], 'now', 'ps_applied_migrations');
  assert.equal(r[0].ok, false);
  assert.equal((await db.prepare('SELECT COUNT(*) n FROM ps_applied_migrations').first()).n, 0);
});

// MIGRATE-GAP-1 (2026-11-25): the deploy's migration step stopped at an old numbering, so the live database never received 23 migrations and
// the backend tick failed 12 of 41 steps on "no such table" while /health had been reporting ok. Every migration is now either one the
// database's own ledger held on that day (APPLIED_BY_DEPLOY, matched by name without its number, since the vendor renumbered) or on the
// allow list the backend applies to itself. A new migration that is on neither fails here, before it can be missing in production.
const APPLIED_BY_DEPLOY = 'core_init core_console claims_claims router_router router_calibration kernel_kernel kernel_lifecycle runner_runner runner_ownerwatch describe_describe packs_packs packs_packs_migrations packs_guard_bounces vault_vault yield_yield docgate_docgate codeloop_codeloop graph_graph tasks_tasks steward_steward agents_agents doors_doors elicit_elicit console_l3_console_l3 stewardruns_steward agentsapprovals_agents containers_containers infra_infra waste_waste ps'.split(' ');
test('every migration reaches the live database: the deploy ledger held it, or the backend applies it to itself', async () => {
  const { planMigrations } = await import('../tools/build_migrations.mjs');
  const orphan = [...planMigrations().keys()].filter(f => !ALLOW.includes(f) && !APPLIED_BY_DEPLOY.includes(f.replace(/^\d+_/, '').replace(/\.sql$/, '')));
  // outreach_plan and outreach created their tables through an earlier route; the live table list of 2026-11-25 holds them
  assert.deepEqual(orphan.filter(f => !['0051_outreach_outreach.sql', '0900_outreach_plan.sql'].includes(f)), []);
});

test('the allow-listed migrations create their tables on a database that lacks them, and applying again changes nothing', async () => {
  const db = openDb();
  const lacking = ['staff_personas', 'plus_ledger', 'fleet_crons', 'signals_artifacts', 'remediation_hits', 'claims_closure_blocks', 'predict_predictions', 'governance_false_stop_register', 'lifecycle_comm_plans'];
  db.raw.exec('PRAGMA foreign_keys=OFF');
  for (const v of db.raw.prepare("SELECT name FROM sqlite_master WHERE type='view'").all()) db.raw.exec(`DROP VIEW IF EXISTS ${v.name}`);
  for (const t of lacking) db.raw.exec(`DROP TABLE IF EXISTS ${t}`);
  const r = await catchUp(db, '2026-11-25 23:40:00');
  assert.deepEqual(r.filter(x => !x.ok), []);
  assert.ok(r.length <= ALLOW.length);
  const have = new Set(db.raw.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(x => x.name));
  assert.deepEqual(lacking.filter(t => !have.has(t)), []);
  assert.deepEqual(await applyPending(db, FILES, ALLOW, '2026-11-25 23:50:00', 'ps_applied_migrations'), []);
});
