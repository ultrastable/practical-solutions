// SPDX-License-Identifier: LicenseRef-Ultrastable-USL-1.0
// Copyright (c) 2026 Rowan Brad Quni-Gudzinas. Non-commercial use free; commercial use requires a license. See LICENSE.
// BACKEND-PULSE-1: tenant-ps-core has no cron (zero schedules on Cloudflare, 2026-11-25), so its tick and knowledge graph run only through
// POST /pulse/watch (web cron via CORE, and the impact-loop workflow), and "done" is decided by the live reading GET /pulse.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { openDb } from '../ps/db.js';
import { seedOrg } from '../ps/seed.js';
import { watch, claim, reading, lastTickAt, PULSE } from '../worker/src/pulse.js';
import { graphTick, TENANT } from '../worker/src/kg.js';
import { SOLUTIONS } from '../worker/src/solutions.js';
import backend from '../worker/src/index.js';
import { pulseCore } from '../worker/src/tenant.js';

const NOW = Date.parse('2026-11-25T20:00:00Z'), MIN = 60e3;
const sqlAt = t => new Date(t).toISOString().slice(0, 19).replace('T', ' ');
const addTick = (db, t) => db.raw.prepare(`INSERT INTO tick_runs (started_at, finished_at, steps_completed, steps_total) VALUES (?, ?, 1, 1)`).run(sqlAt(t), sqlAt(t));
const quiet = async f => { const e = console.error; console.error = () => {}; try { return await f(); } finally { console.error = e; } };

test('watch runs the tick when none ran, then not again inside the interval, then again after it', async () => {
  const db = openDb(':memory:'); let runs = 0;
  const run = async () => { runs++; addTick(db, clock); return 'ran'; };
  let clock = NOW;
  assert.equal(await lastTickAt(db), null, 'a database that never ticked has no last tick');
  const a = await watch(db, { run, now: clock });
  assert.equal(a.ok, true); assert.equal(a.ran, true); assert.equal(a.result, 'ran');
  clock = NOW + 10 * MIN;
  const b = await watch(db, { run, now: clock });
  assert.equal(b.ran, false); assert.match(b.why, /newer than the interval/);
  clock = NOW + (PULSE.every_min + 1) * MIN;
  assert.equal((await watch(db, { run, now: clock })).ran, true);
  assert.equal(runs, 2);
});

test('two callers in the same window run the tick once (atomic claim)', async () => {
  const db = openDb(':memory:'); let runs = 0;
  const rs = await Promise.all([1, 2, 3].map(() => watch(db, { run: async () => { runs++; }, now: NOW })));
  assert.equal(runs, 1); assert.equal(rs.filter(r => r.ran).length, 1);
  assert.equal(await claim(db, NOW + 5 * MIN), false);
  assert.equal(await claim(db, NOW + (PULSE.every_min + 1) * MIN), true);
});

test('watch honours HALT and reports a failed run instead of throwing', async () => {
  const db = openDb(':memory:');
  const h = await watch(db, { run: async () => { throw new Error('must not run'); }, now: NOW, halted: true });
  assert.equal(h.halted, true); assert.equal(h.ran, false);
  const f = await quiet(() => watch(db, { run: async () => { throw new Error('D1 down'); }, now: NOW }));
  assert.equal(f.ok, false); assert.equal(f.ran, true); assert.match(f.error, /D1 down/);
});

test('the reading is not ok when the graph never ran, and ok once the graph and a fresh tick exist', async () => {
  const db = openDb(':memory:');
  const never = await reading(db, { tenant: TENANT, now: NOW });
  assert.equal(never.ok, false); assert.ok(never.why.some(w => /never run/.test(w))); assert.equal(never.graph.nodes, 0); assert.equal(never.graph.last_at, null);
  await graphTick(db, SOLUTIONS, NOW - 30 * MIN); addTick(db, NOW - 20 * MIN);
  const ok = await reading(db, { tenant: TENANT, now: NOW });
  assert.equal(ok.ok, true, ok.why.join('; '));
  assert.ok(ok.graph.nodes > SOLUTIONS.length, `nodes ${ok.graph.nodes}`); assert.equal(ok.graph.last_at, new Date(NOW - 30 * MIN).toISOString());
  assert.equal(ok.tick.last_at, new Date(NOW - 20 * MIN).toISOString());
  const stale = await reading(db, { tenant: TENANT, now: NOW + 3 * 3600e3 });
  assert.equal(stale.ok, false); assert.ok(stale.why.some(w => /last tick is/.test(w)));
});

test('the backend Worker: GET /pulse is 503 before any run, POST /pulse/watch runs tick and graph once, then /pulse is 200 with nodes', async () => {
  const db = openDb(':memory:');
  await seedOrg(db, { problems: [{ id: 'synthetic-demo', title: 'Synthetic', refresh_days: 30, top_k: 5, boot: 30, source: { type: 'synthetic', seed: 11 } }], now: Date.now() - 1000 });
  const env = { DB: db };
  const before = await backend.fetch(new Request('https://core.test/pulse'), env);
  assert.equal(before.status, 503); assert.match((await before.json()).why.join(' '), /never run/);
  assert.equal((await backend.fetch(new Request('https://core.test/pulse/watch'), env)).status, 405, 'GET does not run anything');
  const w = await quiet(() => backend.fetch(new Request('https://core.test/pulse/watch', { method: 'POST' }), env));
  assert.equal(w.status, 200); const wb = await w.json();
  assert.equal(wb.ran, true); assert.equal(wb.result.graph.ok, true, JSON.stringify(wb.result.graph));
  assert.ok(wb.result.graph.nodes > 0);
  const again = await (await backend.fetch(new Request('https://core.test/pulse/watch', { method: 'POST' }), env)).json();
  assert.equal(again.ran, false, 'idempotent inside the interval');
  const after = await backend.fetch(new Request('https://core.test/pulse'), env);
  const ab = await after.json();
  assert.equal(after.status, 200, ab.why.join('; ')); assert.ok(ab.graph.nodes > 0 && ab.graph.last_at && ab.tick.last_at);
  const h = await backend.fetch(new Request('https://core.test/pulse/watch', { method: 'POST' }), { ...env, HALT: '1' });
  assert.equal((await h.json()).halted, true);
});

test('the web cron reaches the backend through CORE, falls back to HTTP, and records every failure in STATE', async () => {
  const kv = new Map(), STATE = { get: async k => kv.get(k) ?? null, put: async (k, v) => { kv.set(k, v); } };
  const viaCore = await pulseCore({ STATE, CORE: { fetch: async (u, i) => { assert.equal(u, 'https://core.internal/pulse/watch'); assert.equal(i.method, 'POST'); return Response.json({ ok: true, ran: true }); } } });
  assert.equal(viaCore.ok, true); assert.equal(viaCore.via, 'CORE'); assert.equal(viaCore.ran, true);
  const seen = [];
  const http = await pulseCore({ STATE }, async (u, i) => { seen.push([u, i.method]); return Response.json({ ok: true, ran: false }); });
  assert.deepEqual(seen, [['https://tenant-ps-core.ultrastable.workers.dev/pulse/watch', 'POST']]); assert.equal(http.via, 'http'); assert.equal(http.ok, true);
  const down = await quiet(() => pulseCore({ STATE, CORE: { fetch: async () => new Response('boom', { status: 503 }) } }));
  assert.equal(down.ok, false); assert.equal(down.error, 'HTTP 503');
  assert.equal(JSON.parse(kv.get('core:pulse')).error, 'HTTP 503', 'the failure is kept, not swallowed');
  const thrown = await quiet(() => pulseCore({ STATE, CORE: { fetch: async () => { throw new Error('no route'); } } }));
  assert.equal(thrown.ok, false); assert.match(thrown.error, /no route/);
});

test('a second route that needs no Cloudflare cron calls /pulse/watch, and the deploy checks the live reading', () => {
  const wf = readFileSync(new URL('../.github/workflows/impact-loop.yml', import.meta.url), 'utf8');
  assert.match(wf, /-X POST[^\n]*tenant-ps-core\.ultrastable\.workers\.dev\/pulse\/watch/);
  const dep = readFileSync(new URL('../.github/workflows/deploy-backend.yml', import.meta.url), 'utf8');
  assert.match(dep, /\/pulse\/watch/); assert.match(dep, /workers\.dev\/pulse -o/);
  const web = readFileSync(new URL('../worker/src/tenant.js', import.meta.url), 'utf8');
  assert.match(web, /ctx\.waitUntil\(pulseCore\(env\)\)/);
  assert.ok(!/internal\/tick'[^\n]*\.catch\(\(\) => \{\}\)/.test(web), 'the backend call is never fire-and-forget with its error dropped');
});
