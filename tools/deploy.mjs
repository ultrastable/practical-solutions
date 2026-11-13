// SPDX-License-Identifier: LicenseRef-Ultrastable-USL-1.0
// Copyright (c) 2026 Rowan Brad Quni-Gudzinas. Non-commercial use free; commercial use requires a license. See LICENSE.
// Provision and deploy this instance to a Cloudflare account with its own scoped token (never the Ultrastable account's).
//   node tools/deploy.mjs --dry-run            print the plan; touches nothing
//   node tools/deploy.mjs                      needs CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID in the environment
// Steps: build migrations, create the D1 database, render wrangler.jsonc, apply migrations, seed the first items, deploy.
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
export const NAMES = { worker: 'ps-practical-solutions', d1: 'ps-practical-solutions' };

export function plan({ names = NAMES, env = process.env } = {}) {
  const missing = ['CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID'].filter(k => !env[k]);
  return {
    missing,
    steps: [
      'node tools/build_migrations.mjs',
      `wrangler d1 create ${names.d1}`,
      'render worker/wrangler.jsonc from worker/wrangler.template.jsonc',
      `wrangler d1 migrations apply ${names.d1} --remote --config worker/wrangler.jsonc`,
      `wrangler d1 execute ${names.d1} --remote --file worker/seed.sql --config worker/wrangler.jsonc`,
      'wrangler deploy --config worker/wrangler.jsonc',
    ],
  };
}

export function seedSql(problems, nowIso) {
  const q = s => `'${String(s).replace(/'/g, "''")}'`;
  const lines = [`INSERT OR REPLACE INTO org (key, value) VALUES ('org_slug', 'practical-solutions');`];
  for (const p of problems) {
    lines.push(`INSERT OR IGNORE INTO ps_problems (id, title, config) VALUES (${q(p.id)}, ${q(p.title)}, ${q(JSON.stringify(p))});`);
    lines.push(`INSERT OR IGNORE INTO items (id, title, kind, owner_role, done_check, closing_probe, priority, status, surface, action_class) VALUES (${q(`ps:cycle:${p.id}:0`)}, ${q(`Cycle 0 for ${p.id}: fetch data, find evidence cases and candidate solutions`)}, 'work', 'analyst', 'dataset stored and detector run', 'ps_datasets row for epoch 0', 40, 'ready', 'ps_detect', 'detect');`);
    lines.push(`INSERT OR REPLACE INTO ps_schedule (item_id, due_at) VALUES (${q(`ps:cycle:${p.id}:0`)}, ${q(nowIso)});`);
  }
  lines.push(`INSERT OR IGNORE INTO items (id, title, kind, owner_role, done_check, closing_probe, priority, status) VALUES ('UPSTREAM-1', 'Core score_predictions marks any metric it does not know as a miss; add a metric registration hook so domain metrics can be scored by core', 'fix', 'operations', 'PR merged in ultrastable/workers adding metric registration, then this repo drops its own scorer', 'upstream PR merged', 30, 'ready');`);
  return lines.join('\n') + '\n';
}

function sh(cmd, args) {
  const r = spawnSync(cmd, args, { stdio: 'inherit', cwd: ROOT });
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(' ')} failed (${r.status})`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const p = plan();
  if (process.argv.includes('--dry-run')) { console.log(JSON.stringify(p, null, 2)); process.exit(0); }
  if (p.missing.length) { console.error('missing environment: ' + p.missing.join(', ')); process.exit(2); }
  const problems = JSON.parse(readFileSync(path.join(ROOT, 'org/problems.json'), 'utf8')).filter(x => x.enabled);
  sh('node', ['tools/build_migrations.mjs']);
  const out = spawnSync('npx', ['wrangler', 'd1', 'create', NAMES.d1], { cwd: ROOT, encoding: 'utf8' });
  const idMatch = /"?database_id"?\s*[:=]\s*"([0-9a-f-]{36})"/.exec(out.stdout + out.stderr);
  if (!idMatch) throw new Error('could not read the database id from wrangler output: ' + (out.stdout + out.stderr).slice(0, 300));
  const tpl = readFileSync(path.join(ROOT, 'worker/wrangler.template.jsonc'), 'utf8');
  writeFileSync(path.join(ROOT, 'worker/wrangler.jsonc'), tpl.replace('{worker_name}', NAMES.worker).replace(/\{d1_database\}/g, NAMES.d1).replace('{d1_database_id}', idMatch[1]));
  writeFileSync(path.join(ROOT, 'worker/seed.sql'), seedSql(problems, new Date().toISOString().replace('T', ' ').slice(0, 19)));
  const cfg = ['--config', 'worker/wrangler.jsonc'];
  sh('npx', ['wrangler', 'd1', 'migrations', 'apply', NAMES.d1, '--remote', ...cfg]);
  sh('npx', ['wrangler', 'd1', 'execute', NAMES.d1, '--remote', '--file', 'worker/seed.sql', ...cfg]);
  sh('npx', ['wrangler', 'deploy', ...cfg]);
}
