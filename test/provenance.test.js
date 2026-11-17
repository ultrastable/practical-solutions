// SPDX-License-Identifier: LicenseRef-Ultrastable-USL-1.0
// Copyright (c) 2026 Rowan Brad Quni-Gudzinas. Non-commercial use free; commercial use requires a license. See LICENSE.
import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/src/tenant.js';
import * as PV from '../ps/provenance.js';

const mem = () => { const m = new Map(); return { get: async k => m.get(k) ?? null, put: async (k, v) => { m.set(k, v); } }; };
const call = (env, path, body, token) => worker.fetch(new Request('https://ps.example' + path, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined }), env, {});

test('suggestions stay private, loops and owner are labelled, the public changelog is redacted', async () => {
  const env = { STATE: mem(), PS_PROVENANCE_TOKEN: 't0k' };
  assert.equal((await call(env, '/api/suggest', { text: 'add a map; reach me at jane@example.org or +31 6 1234 5678', page: '/problems/under5' })).status, 200);
  assert.equal((await call(env, '/api/suggest', { text: 'x' })).status, 400);
  await PV.recordChanges(env.STATE, [{ kind: 'brightspot_added', problem: 'under5', id: 'RWA', title: 'Rwanda' }, { kind: 'candidate_error', problem: 'tb' }], '2026-11-17T10:00:00Z');
  assert.equal((await call(env, '/api/provenance', { class: 'owner', actor: 'rowan', channel: 'thread', kind: 'input', summary: 'Rowan suggested clearer evidence labels', affected: ['site/ui'], public: true })).status, 403);
  assert.equal((await call(env, '/api/provenance', { class: 'owner', actor: 'rowan', channel: 'thread', kind: 'input', summary: 'Rowan suggested clearer evidence labels', affected: ['site/ui'], public: true }, 't0k')).status, 200);
  assert.equal((await call(env, '/api/provenance', { class: 'robot', actor: 'x', channel: 'api', kind: 'input', summary: 's' }, 't0k')).status, 400);
  const pub = await (await call(env, '/changelog.json')).json(), txt = JSON.stringify(pub);
  assert.deepEqual(pub.counts_by_origin, { owner: 1, loop: 1 });
  for (const leak of ['jane@', '5678', 'add a map', 'rowan', 'candidate error']) assert.ok(!txt.includes(leak), leak);
  const html = await (await call(env, '/changelog')).text(); assert.ok(html.includes('An automated loop') && html.includes('Send suggestion'));
  const full = await (await call(env, '/api/provenance', undefined, 't0k')).json();
  const sug = full.entries.find(r => r.origin.class === 'end_user'); assert.ok(sug && !sug.public && !sug.summary.includes('jane@') && sug.affected[0] === '/problems/under5');
  assert.ok(full.entries.find(r => r.kind === 'incident'));
  assert.equal(await PV.settle(env.STATE, sug.id, 'kept', 'applied'), true);
});
