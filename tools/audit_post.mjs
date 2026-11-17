// SPDX-License-Identifier: LicenseRef-Ultrastable-USL-1.0
// Copyright (c) 2026 Rowan Brad Quni-Gudzinas. Non-commercial use free; commercial use requires a license. See LICENSE.
// Records one workflow action (deploy, merge, model vote, entry change) in the tenant's audit log (core/audit). Authenticates with the run's own
// GitHub OIDC token, so no secret is stored. A failed write prints a workflow warning and exits 0: the action already happened, and a missing
// record shows up as a sequence the log's own check cannot explain, never as a silent success.
//   node tools/audit_post.mjs --kind deploy --subject tenant-ps-web --summary "deployed from main" [--payload-file out.json]
import { readFileSync } from 'node:fs';
export const AUDIENCE = 'practical-solutions-audit';
export const URL_BASE = process.env.AUDIT_URL || 'https://tenant-ps-core.ultrastable.workers.dev';
export function parseArgs(argv) { const o = {}; for (let i = 0; i < argv.length; i += 2) o[argv[i].replace(/^--/, '')] = argv[i + 1]; return o; }
export function buildEvent(a, env = process.env) {
  const sha = (env.GITHUB_SHA || '').slice(0, 12), run = env.GITHUB_RUN_ID || '';
  return { actor: a.actor || ('workflow:' + (env.GITHUB_WORKFLOW || 'manual')).slice(0, 60), kind: a.kind, subject: a.subject || '', summary: a.summary || `${a.kind} (${env.GITHUB_WORKFLOW || 'manual'}, ${sha})`, ref: sha ? `sha:${sha}` : (run ? `run:${run}` : ''),
    payload: { run, sha, workflow: env.GITHUB_WORKFLOW || '', file: a['payload-file'] ? readFileSync(a['payload-file'], 'utf8') : undefined } };
}
export async function post(event, { fetchImpl = fetch, env = process.env, tries = 4, waitMs = 6000 } = {}) {
  // A Worker deployed seconds ago can still answer 404 for a short while, so a refusal is retried before it is reported.
  let last; for (let i = 0; i < tries; i++) { try { return await postOnce(event, { fetchImpl, env }); } catch (e) { last = e; if (i < tries - 1) await new Promise(r => setTimeout(r, waitMs)); } }
  throw last;
}
async function postOnce(event, { fetchImpl, env }) {
  const t = await fetchImpl(`${env.ACTIONS_ID_TOKEN_REQUEST_URL}&audience=${AUDIENCE}`, { headers: { authorization: 'Bearer ' + env.ACTIONS_ID_TOKEN_REQUEST_TOKEN } });
  if (!t.ok) throw new Error('could not mint an OIDC token: ' + t.status);
  const r = await fetchImpl(URL_BASE + '/audit/event', { method: 'POST', headers: { authorization: 'Bearer ' + (await t.json()).value, 'content-type': 'application/json' }, body: JSON.stringify(event) });
  if (!r.ok) throw new Error('audit endpoint answered ' + r.status + ': ' + (await r.text()).slice(0, 160));
  return r.json();
}
if (import.meta.url === `file://${process.argv[1]}`) {
  try { const out = await post(buildEvent(parseArgs(process.argv.slice(2)))); console.log('audit recorded', JSON.stringify(out)); }
  catch (e) { console.log(`::warning::audit record failed: ${String(e.message).slice(0, 200)}`); }
}
