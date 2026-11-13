// SPDX-License-Identifier: LicenseRef-Ultrastable-USL-1.0
// Copyright (c) 2026 Rowan Brad Quni-Gudzinas. Non-commercial use free; commercial use requires a license. See LICENSE.
// The single entrypoint. From an empty checkout plus secrets it creates everything, and it is idempotent.
//   node tools/bootstrap.mjs up        build migrations, create-or-reuse D1, deploy the Worker, set secrets, run the first
//                                      cycle, write ledger/state.json
//   node tools/bootstrap.mjs down      export the ledger, then delete the Worker and the D1 database
//   node tools/bootstrap.mjs rebuild   down, then up
//   node tools/bootstrap.mjs plan      print the plan; touches nothing
// Secrets (from the environment, set by the platform): CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID; optional ANTHROPIC_API_KEY.
// Only the Quniverse account may be used. The Ultrastable account is refused by an allow-list, not by a deny-list.
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHmac } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NAMES, seedSql } from './deploy.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const ALLOWED = (process.env.PS_ALLOWED_ACCOUNT || 'edb167b78c9fb901ea5bca3ce58ccc4b').split(',');
const log = (...a) => console.log('[bootstrap]', ...a);

export function guard(env = process.env) {
  const miss = ['CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID'].filter(k => !env[k]);
  if (miss.length) throw new Error('missing secrets: ' + miss.join(', '));
  if (!ALLOWED.includes(env.CLOUDFLARE_ACCOUNT_ID)) throw new Error('refusing: CLOUDFLARE_ACCOUNT_ID is not in the allow-list for this instance');
}
// Derived, never stored: the same secrets give the same token after a teardown, so a rebuild needs nothing remembered.
export const tickToken = (env = process.env) => createHmac('sha256', env.CLOUDFLARE_API_TOKEN).update('ps-tick-token/1').digest('hex');

function run(args, { input, allowFail = false } = {}) {
  const r = spawnSync('npx', ['--yes', 'wrangler@4', ...args], { cwd: ROOT, encoding: 'utf8', input, shell: process.platform === 'win32' });
  const out = (r.stdout || '') + (r.stderr || '');
  if (r.status !== 0 && !allowFail) throw new Error(`wrangler ${args.join(' ')} failed (${r.status}):\n${out.slice(-1500)}`);
  return { ok: r.status === 0, out };
}
const cfg = ['--config', 'worker/wrangler.jsonc'];

async function cf(pathname, { method = 'GET', body } = {}) {
  const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}${pathname}`, {
    method, headers: { authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}`, 'content-type': 'application/json' }, body: body && JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({}));
  return { status: r.status, j };
}
async function findD1() {
  const { j } = await cf(`/d1/database?name=${NAMES.d1}&per_page=50`);
  return (j.result || []).find(d => d.name === NAMES.d1) || null;
}
async function workerExists() { return (await cf(`/workers/scripts/${NAMES.worker}`)).status === 200; }
async function subdomain() { const { j } = await cf('/workers/subdomain'); return j.result && j.result.subdomain; }

async function up() {
  guard();
  spawnSync('node', ['tools/build_migrations.mjs'], { cwd: ROOT, stdio: 'inherit' });
  let db = await findD1();
  if (!db) {
    const c = await cf('/d1/database', { method: 'POST', body: { name: NAMES.d1 } });
    if (!c.j.success) throw new Error('d1 create failed: ' + JSON.stringify(c.j.errors));
    db = c.j.result; log('created D1', db.name, db.uuid);
  } else log('reusing D1', db.name, db.uuid);
  const tpl = readFileSync(path.join(ROOT, 'worker/wrangler.template.jsonc'), 'utf8');
  writeFileSync(path.join(ROOT, 'worker/wrangler.jsonc'), tpl.replace('{worker_name}', NAMES.worker).replace(/\{d1_database\}/g, NAMES.d1).replace('{d1_database_id}', db.uuid));
  const problems = JSON.parse(readFileSync(path.join(ROOT, 'org/problems.json'), 'utf8')).filter(x => x.enabled);
  writeFileSync(path.join(ROOT, 'worker/seed.sql'), seedSql(problems, new Date().toISOString().replace('T', ' ').slice(0, 19)));
  run(['d1', 'migrations', 'apply', NAMES.d1, '--remote', ...cfg]);
  run(['d1', 'execute', NAMES.d1, '--remote', '--file', 'worker/seed.sql', ...cfg]);
  const dep = run(['deploy', ...cfg]);
  log('deployed', (dep.out.match(/https:\/\/\S+\.workers\.dev/) || ['(no url)'])[0]);
  run(['secret', 'put', 'PS_TICK_TOKEN', ...cfg], { input: tickToken() });
  if (process.env.ANTHROPIC_API_KEY) { run(['secret', 'put', 'ANTHROPIC_API_KEY', ...cfg], { input: process.env.ANTHROPIC_API_KEY }); log('model key set (value never printed)'); }
  else log('no ANTHROPIC_API_KEY: model roles stay off');
  const base = `https://${NAMES.worker}.${await subdomain()}.workers.dev`;
  const h = { 'x-ps-token': tickToken() };
  let tick;
  for (let i = 0; i < 12; i++) { // a fresh workers.dev route can take a short while to answer
    const r = await fetch(base + '/ps/tick', { method: 'POST', headers: h }).catch(e => ({ status: 0, json: async () => ({}), text: async () => String(e) }));
    if (r.status === 200) { tick = await r.json(); break; }
    log('tick attempt', i, r.status); await new Promise(s => setTimeout(s, 5000));
  }
  if (!tick) throw new Error('first cycle did not run at ' + base);
  log('first cycle ran:', String(tick.report).split('\n')[0]);
  const ledger = await (await fetch(base + '/ps/ledger', { headers: h })).json();
  mkdirSync(path.join(ROOT, 'ledger'), { recursive: true });
  writeFileSync(path.join(ROOT, 'ledger/state.json'), JSON.stringify({ exported_at: new Date().toISOString(), url: base, ...ledger }, null, 1) + '\n');
  log('ledger/state.json written; tick_runs:', ledger.tables.tick_runs.length, 'briefs:', ledger.tables.ps_briefs.length);
  return { base, ledger };
}

async function down() {
  guard();
  const base = `https://${NAMES.worker}.${await subdomain()}.workers.dev`;
  if (await workerExists()) { // never delete state that is not exported
    const r = await fetch(base + '/ps/ledger', { headers: { 'x-ps-token': tickToken() } });
    if (r.status !== 200) throw new Error('refusing to delete: ledger export failed with HTTP ' + r.status);
    mkdirSync(path.join(ROOT, 'ledger'), { recursive: true });
    writeFileSync(path.join(ROOT, 'ledger/pre-delete.json'), JSON.stringify(await r.json(), null, 1) + '\n');
    log('exported ledger/pre-delete.json');
    const d = await cf(`/workers/scripts/${NAMES.worker}?force=true`, { method: 'DELETE' });
    log('worker delete', d.status);
  }
  const db = await findD1();
  if (db) { const d = await cf(`/d1/database/${db.uuid}`, { method: 'DELETE' }); log('d1 delete', d.status); }
  log('worker exists:', await workerExists(), ' d1 exists:', Boolean(await findD1()));
}

const cmd = process.argv[2];
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    if (cmd === 'plan') console.log(JSON.stringify({ names: NAMES, allowed_account: ALLOWED[0], steps: ['guard', 'build migrations', 'create-or-reuse D1', 'render wrangler.jsonc', 'migrate', 'seed', 'deploy', 'secrets', 'first cycle', 'ledger'] }, null, 2));
    else if (cmd === 'up') await up();
    else if (cmd === 'down') await down();
    else if (cmd === 'rebuild') { await down(); await up(); }
    else { console.error('usage: bootstrap.mjs up|down|rebuild|plan'); process.exitCode = 2; }
  } catch (e) { console.error(e.message); process.exit(1); }
}
