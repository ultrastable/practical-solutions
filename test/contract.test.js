// SPDX-License-Identifier: LicenseRef-Ultrastable-USL-1.0
// Copyright (c) 2026 Rowan Brad Quni-Gudzinas. Non-commercial use free; commercial use requires a license. See LICENSE.
// FLEET-CONTRACT-1: the public Worker serves the fleet contract, and the shared verify() finds every surface and every statement that names an
// endpoint backed, front to back and back to front. HEALTH-FRONT-1: /health is this Worker's own reading, never a fetch of the backend's address.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import w from '../worker/src/tenant.js';
import { verify, SURFACES } from '../vendor/seed/contract.js';
import { specFrom, claimsJson, apiFor, health, TICK_MAX_AGE_MIN } from '../worker/src/contract.js';
import { STATEMENTS, CTX } from '../worker/src/method-claims.js';
import { describe } from '../vendor/ultrastable/core/statements/index.js';

const ORIGIN = 'https://ultrastable.org';
const kv = (init = {}) => { const m = new Map(Object.entries(init)); return { m, get: async k => m.get(k) ?? null, put: async (k, v) => { m.set(k, v); }, delete: async k => { m.delete(k); } }; };
// the backend as the service binding presents it: the graph, its health and the public half of the audit log
const core = { fetch: async req => { const p = new URL(typeof req === 'string' ? req : req.url).pathname; return ['/api/graph', '/health', '/audit/summary.json'].includes(p) ? Response.json({ ok: true }) : new Response('not found', { status: 404 }); } };
const env = (tickAgeMin = 5, withCore = true) => ({ STATE: kv({ last_tick: JSON.stringify({ at: new Date(Date.now() - tickAgeMin * 60000).toISOString(), changes: 0 }), problems: JSON.stringify([]) }), ...(withCore ? { CORE: core } : {}) });
const site = e => path => w.fetch(new Request(ORIGIN + path), e, { waitUntil() {} });
const described = describe(STATEMENTS, CTX);

test('every contract surface answers and every statement that names an endpoint is backed, both ways', async () => {
  const spec = specFrom(described);
  assert.ok(spec.statements.length >= described.length - 2, 'only the statements about the pages themselves lack an endpoint');
  const r = await verify(site(env()), spec);
  assert.deepEqual(r.failures, []);
  assert.ok(r.checks >= SURFACES.length + 2 * spec.statements.length);
});

test('/claims.json keeps its fields and adds the contract, a page and an endpoint; the manifest names this system', async () => {
  const c = await (await site(env())('/claims.json')).json();
  assert.equal(c.contract, 1);
  assert.equal(c.statements.length, STATEMENTS.length);
  for (const s of c.statements) { assert.ok(s.id && s.section && s.text && 'evidence' in s, s.id); assert.equal(s.page, '/method'); }
  assert.deepEqual(c.statements.filter(s => !s.api).map(s => s.section), ['a11y', 'a11y']);
  assert.deepEqual(claimsJson(described).statements.map(s => s.api || null), described.map(apiFor));
  const m = await (await site(env())('/.well-known/ultrastable.json')).json();
  assert.equal(m.ultrastable, 1); assert.equal(m.url, ORIGIN); assert.equal(m.repo, 'https://github.com/ultrastable/practical-solutions');
});

test('HEALTH-FRONT-1: /health is 200 while the tick is recent and 503 with its report when the tick is old or the backend fails', async () => {
  const ok = await site(env())('/health');
  assert.equal(ok.status, 200); assert.equal((await ok.json()).ok, true);
  const old = await site(env(TICK_MAX_AGE_MIN + 5))('/health'), o = await old.json();
  assert.equal(old.status, 503); assert.equal(o.ok, false); assert.equal(o.tick.ok, false);
  const noCore = await health(env(5, false)); assert.equal(noCore.ok, true); assert.equal(noCore.backend.bound, false);
  const down = await health({ ...env(), CORE: { fetch: async () => { throw new Error('binding down'); } } }); assert.equal(down.ok, false);
  const never = await health({ STATE: kv() }); assert.equal(never.ok, false); assert.equal(never.tick.minutes_ago, null);
});

test('the Worker reaches the backend through CORE first; the public address is only a fallback (Cloudflare refuses it with error 1042)', () => {
  const src = readFileSync(new URL('../worker/src/tenant.js', import.meta.url), 'utf8');
  // every use of the public address is the fallback arm of a route that tries the CORE binding first
  for (const line of src.split('\n').filter(l => /fetch(Fn)?\(\s*BACKEND/.test(l))) assert.match(line, /env\.CORE \?/, line.trim().slice(0, 120));
  assert.ok(!/includes\(u\.pathname\)\) return fetch\(BACKEND/.test(src), 'the /health and /ps proxy by plain fetch is gone');
});
