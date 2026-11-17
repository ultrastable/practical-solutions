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

test('a database missing the access triggers gets them from the allow-listed migration, once, and re-applying is a no-op', async () => {
  const db = openDb();
  for (const t of ['access_permit_guard', 'access_ask_guard']) db.raw.exec(`DROP TRIGGER IF EXISTS ${t}`);
  const has = () => db.raw.prepare("SELECT name FROM sqlite_master WHERE type='trigger' AND name LIKE 'access_%'").all().length;
  assert.equal(has(), 0);
  const r = await applyPending(db, FILES, ALLOW, '2026-11-17 14:00:00');
  assert.deepEqual(r.map(x => x.ok), [true]);
  assert.equal(has(), 2);
  assert.deepEqual(await applyPending(db, FILES, ALLOW, '2026-11-17 14:10:00'), []);
});

test('a migration that fails is reported, not thrown, and not recorded', async () => {
  const db = openDb();
  const r = await applyPending(db, { 'x.sql': 'CREATE TABLE a (' }, ['x.sql'], 'now');
  assert.equal(r[0].ok, false);
  assert.equal((await db.prepare('SELECT COUNT(*) n FROM ps_applied_migrations').first()).n, 0);
});
