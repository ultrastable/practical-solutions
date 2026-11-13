// SPDX-License-Identifier: LicenseRef-Ultrastable-USL-1.0
// Copyright (c) 2026 Rowan Brad Quni-Gudzinas. Non-commercial use free; commercial use requires a license. See LICENSE.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { planMigrations } from '../tools/build_migrations.mjs';
import { plan, seedSql } from '../tools/deploy.mjs';
import { readFileSync, readdirSync } from 'node:fs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

test('two fresh builds from the idea file are identical (CLI selfcheck)', () => {
  const out = execFileSync('node', ['--no-warnings', 'bin/ps.mjs', 'selfcheck'], { cwd: ROOT, encoding: 'utf8' });
  assert.match(out, /birth reproducible/);
});

test('committed worker migrations match the vendored core plus ours, and apply to a fresh database twice', async () => {
  const r = spawnSync('node', ['tools/build_migrations.mjs', '--check'], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  const { DatabaseSync } = await import('node:sqlite');
  const raw = new DatabaseSync(':memory:');
  for (let pass = 0; pass < 2; pass++) for (const [, sql] of planMigrations()) raw.exec(sql);
  assert.ok(raw.prepare(`SELECT name FROM sqlite_master WHERE name='ps_briefs'`).get());
});

test('deploy plan needs scoped credentials and the generated seed SQL is valid', async () => {
  assert.deepEqual(plan({ env: {} }).missing, ['CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID']);
  assert.deepEqual(plan({ env: { CLOUDFLARE_API_TOKEN: 'x', CLOUDFLARE_ACCOUNT_ID: 'y' } }).missing, []);
  const { DatabaseSync } = await import('node:sqlite');
  const raw = new DatabaseSync(':memory:');
  for (const [, sql] of planMigrations()) raw.exec(sql);
  const problems = JSON.parse(readFileSync(new URL('../org/problems.json', import.meta.url), 'utf8')).filter(p => p.enabled);
  raw.exec(seedSql(problems, '2026-12-01 00:00:00'));
  assert.equal(raw.prepare(`SELECT COUNT(*) n FROM items WHERE id LIKE 'ps:cycle:%'`).get().n, problems.length);
});

test('no secret value appears in source or configuration', () => {
  const hits = [];
  const walk = d => { for (const n of readdirSync(d, { withFileTypes: true })) { if (['node_modules', '.git', 'vendor'].includes(n.name)) continue; const p = d + '/' + n.name; if (n.isDirectory()) walk(p); else if (/\.(js|mjs|json|jsonc|sql|yml)$/.test(n.name) && /(sk-ant-[A-Za-z0-9]{10,}|AKIA[0-9A-Z]{16}|ghp_[A-Za-z0-9]{20,})/.test(readFileSync(p, 'utf8'))) hits.push(p); } };
  walk(ROOT);
  assert.deepEqual(hits, []);
});
