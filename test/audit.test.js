// SPDX-License-Identifier: LicenseRef-Ultrastable-USL-1.0
// Copyright (c) 2026 Rowan Brad Quni-Gudzinas. Non-commercial use free; commercial use requires a license. See LICENSE.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { makeDb } from '../vendor/ultrastable/core/_shared/testdb.js';
import { record, authorizer, auditFor } from '../ps/audit.js';
import { buildEvent, parseArgs, post } from '../tools/audit_post.mjs';
import { auditProbe } from './audit-probe.js';
const MIG = fileURLToPath(new URL('../vendor/ultrastable/core/audit/migrations/', import.meta.url));

test('the probe behind the /method statement passes', async () => { await auditProbe((c, m) => { if (!c) throw new Error(m); }); });
test('record returns a seq, or an error that the caller can show', async () => {
  const db = makeDb([MIG]); assert.equal((await record(db, {}, { actor: 'a', kind: 'deploy', summary: 'x' }, Date.now())).seq, 1);
  assert.match((await record(db, {}, { actor: 'a', kind: 'BAD', summary: 'x' }, Date.now())).error, /kind/);
  assert.equal((await auditFor(db).verify()).ok, true);
});
test('writes need the tick token or a valid Actions OIDC token for this repository and audience', async () => {
  const seen = []; const verify = async (t, o) => { seen.push(o); return { ok: t === 'good' }; };
  const mk = h => new Request('https://h/audit/event', { headers: h }); const a = authorizer({ PS_TICK_TOKEN: 'tick' }, verify);
  assert.equal(await a(mk({ authorization: 'Bearer tick' })), true); assert.equal(await a(mk({ authorization: 'Bearer good' })), true);
  assert.equal(await a(mk({ authorization: 'Bearer bad' })), false); assert.equal(await a(mk({})), false); assert.equal(await authorizer({}, verify)(mk({ authorization: 'Bearer tick' })), false);
  assert.deepEqual(seen[0], { audience: 'practical-solutions-audit', repository: 'ultrastable/practical-solutions' });
});
test('the workflow tool builds an event from the run and posts with an OIDC token', async () => {
  const env = { GITHUB_SHA: 'a'.repeat(40), GITHUB_RUN_ID: '9', GITHUB_WORKFLOW: 'deploy-tenant', ACTIONS_ID_TOKEN_REQUEST_URL: 'https://t/?x=1', ACTIONS_ID_TOKEN_REQUEST_TOKEN: 'rt' };
  const e = buildEvent(parseArgs(['--kind', 'deploy', '--subject', 'tenant-ps-web']), env); assert.equal(e.kind, 'deploy'); assert.equal(e.ref, 'sha:' + 'a'.repeat(12)); assert.equal(e.actor, 'workflow:deploy-tenant');
  const calls = []; const f = async (u, o) => { calls.push([u, o]); return u.startsWith('https://t/') ? { ok: true, json: async () => ({ value: 'jwt' }) } : { ok: true, json: async () => ({ seq: 4 }) }; };
  assert.equal((await post(e, { fetchImpl: f, env })).seq, 4); assert.match(calls[0][0], /audience=practical-solutions-audit/); assert.equal(calls[1][1].headers.authorization, 'Bearer jwt');
  await assert.rejects(post(e, { fetchImpl: async () => ({ ok: false, status: 403 }), env }));
});
