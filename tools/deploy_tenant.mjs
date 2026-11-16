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
export const metadata = () => ({ main_module: 'worker.js', compatibility_date: '2026-10-01', keep_bindings: ['kv_namespace', 'plain_text', 'secret_text'] });

export function build() {
  const out = path.join(ROOT, '.build-tenant.js');
  const r = spawnSync('npx', ['--yes', 'esbuild', 'worker/src/tenant.js', '--bundle', '--format=esm', '--platform=neutral', '--minify', `--outfile=${out}`], { cwd: ROOT, encoding: 'utf8' });
  if (r.status !== 0) throw new Error('build failed: ' + r.stderr);
  return readFileSync(out);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const code = build();
  const sha = createHash('sha256').update(code).digest('hex');
  if (process.argv.includes('--dry-run')) { console.log(JSON.stringify({ worker: NAME, bytes: code.length, sha256: sha, metadata: metadata() })); process.exit(0); }
  const { CLOUDFLARE_API_TOKEN: token, CLOUDFLARE_ACCOUNT_ID: acct } = process.env;
  if (!token || !acct) { console.error('CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID are required'); process.exit(2); }
  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(metadata())], { type: 'application/json' }));
  form.append('worker.js', new Blob([code], { type: 'application/javascript+module' }), 'worker.js');
  const base = `https://api.cloudflare.com/client/v4/accounts/${acct}/workers/scripts/${NAME}`;
  const put = await fetch(base, { method: 'PUT', headers: { authorization: `Bearer ${token}` }, body: form });
  const j = await put.json();
  if (!put.ok || !j.success) { console.error('deploy failed', put.status, JSON.stringify(j.errors)); process.exit(1); }
  // Prove it: read the deployed module back and compare hashes.
  const back = await fetch(base + '/content/v2', { headers: { authorization: `Bearer ${token}` } });
  const got = createHash('sha256').update(Buffer.from(await back.arrayBuffer())).digest('hex');
  console.log(JSON.stringify({ deployed: true, built_sha256: sha, readback_sha256: got, same: got === sha }));
  if (got !== sha) console.error('read-back differs from the built bundle (the API may wrap the module in multipart); verify with /feed.xml and /brightspots.json');
}
