// SPDX-License-Identifier: LicenseRef-Ultrastable-USL-1.0
// Copyright (c) 2026 Rowan Brad Quni-Gudzinas. Non-commercial use free; commercial use requires a license. See LICENSE.
// Deploys the tenant front-end Worker (worker/src/tenant.js) to the host account and proves the deployed bytes are the built bytes.
// Needs CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID in the environment. Bindings (the STATE KV) and the cron are kept as they are.
//   node tools/deploy_tenant.mjs [--dry-run]
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const NAME = 'tenant-ps-web';
export const HOST_ACCOUNT = process.env.PS_TENANT_HOST_ACCOUNT || '81e3a4efb4eb66e613529b87682911bb'; // tenancy.json host_account (ultrastable)
export const metadata = () => ({ main_module: 'worker.js', compatibility_date: '2026-10-01', observability: { enabled: true }, keep_bindings: ['kv_namespace', 'plain_text', 'secret_text', 'ai'] });

export function build() {
  const out = path.join(ROOT, '.build-tenant.js');
  const r = spawnSync('npx', ['--yes', 'esbuild', 'worker/src/tenant.js', '--bundle', '--format=esm', '--platform=neutral', '--minify', `--outfile=${out}`], { cwd: ROOT, encoding: 'utf8' });
  if (r.status !== 0) throw new Error('build failed: ' + r.stderr);
  return readFileSync(out);
}

export function guard(env = process.env) {
  const miss = ['CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID'].filter(k => !env[k]);
  if (miss.length) throw new Error('missing secrets: ' + miss.join(', '));
  if (env.CLOUDFLARE_ACCOUNT_ID !== HOST_ACCOUNT) throw new Error('refusing: CLOUDFLARE_ACCOUNT_ID is not the tenant host account');
}

// Uploads, then reads the module back and requires the built bytes inside it. Throws on any failure; returns the proof.
export async function deployTenant({ fetchFn = fetch, env = process.env, code }) {
  guard(env);
  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(metadata())], { type: 'application/json' }));
  form.append('worker.js', new Blob([code], { type: 'application/javascript+module' }), 'worker.js');
  const base = `https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/workers/scripts/${NAME}`;
  const auth = { authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}` };
  const put = await fetchFn(base, { method: 'PUT', headers: auth, body: form });
  const j = await put.json();
  if (!put.ok || !j.success) throw new Error(`deploy failed ${put.status} ${JSON.stringify(j.errors)}`);
  const back = await fetchFn(base + '/content/v2', { headers: auth });
  if (!back.ok) throw new Error(`read-back failed ${back.status}`);
  const text = Buffer.from(await back.arrayBuffer()).toString('utf8');
  if (!text.includes(Buffer.from(code).toString('utf8'))) throw new Error('read-back does not contain the built bundle');
  return { deployed: true, sha256: createHash('sha256').update(code).digest('hex') };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const code = build();
  if (process.argv.includes('--dry-run')) { console.log(JSON.stringify({ worker: NAME, bytes: code.length, sha256: createHash('sha256').update(code).digest('hex'), metadata: metadata() })); process.exit(0); }
  try { console.log(JSON.stringify(await deployTenant({ code }))); } catch (e) { console.error(String(e.message || e)); process.exit(1); }
}
