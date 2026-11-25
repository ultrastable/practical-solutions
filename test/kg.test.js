// SPDX-License-Identifier: LicenseRef-Ultrastable-USL-1.0
// Copyright (c) 2026 Rowan Brad Quni-Gudzinas. Non-commercial use free; commercial use requires a license. See LICENSE.
// KGRAPH-1: the catalogue's every record lands in the shared D1 knowledge graph once an hour, incrementally, with findings that can be checked.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { graphTick, graphApi, records, TENANT } from '../worker/src/kg.js';
import { SOLUTIONS } from '../worker/src/solutions.js';
import { PROBLEMS } from '../worker/src/problems.js';

function d1() {
  const raw = new DatabaseSync(':memory:');
  const stmt = (sql) => { let a = []; const o = { bind(...x) { a = x; return o; },
    async all() { return { results: raw.prepare(sql).all(...a).map(r => ({ ...r })) }; },
    async first() { const r = raw.prepare(sql).get(...a); return r ? { ...r } : null; },
    async run() { const r = raw.prepare(sql).run(...a); return { meta: { changes: Number(r.changes) } }; } }; return o; };
  return { raw, prepare: stmt, async batch(list) { const out = []; for (const s of list) out.push(await s.run()); return out; } };
}
const NOW = Date.parse('2026-11-25T17:00:00Z');

test('every problem, solution and agency (with its matches) is a record of the graph', () => {
  const recs = records(SOLUTIONS);
  for (const t of ['problem', 'solution', 'agency']) assert.ok(recs.some(r => r.type === t), t);
  assert.equal(recs.filter(r => r.type === 'problem').length, PROBLEMS.length);
  assert.equal(new Set(recs.map(r => r.source)).size, recs.length, 'one source per record');
  assert.ok(recs.some(r => r.type === 'agency' && r.data.matches.length), 'matches ride on their agency');
});

test('the tick builds the graph once an hour, writes nothing when nothing changed, and serves it live', async () => {
  const db = d1();
  const r = await graphTick(db, SOLUTIONS, NOW);
  assert.ok(r.ok, r.error);
  assert.ok(r.nodes > SOLUTIONS.length + PROBLEMS.length, `nodes ${r.nodes}`);
  assert.ok(r.edges > SOLUTIONS.length * 3, `edges ${r.edges}`);
  assert.ok(r.insights_new > 0, 'the first run files findings');
  assert.equal((await graphTick(db, SOLUTIONS, NOW + 10 * 60e3)).skipped, true, 'throttled to once an hour');
  const again = await graphTick(db, SOLUTIONS, NOW + 3600e3);
  assert.ok(again.ok); assert.equal(again.added + again.changed + again.retired, 0);
  const kinds = db.raw.prepare('SELECT DISTINCT kind FROM kg_nodes WHERE tenant = ?').all(TENANT).map(x => x.kind).sort();
  for (const k of ['agency', 'level', 'problem', 'solution', 'study']) assert.ok(kinds.includes(k), k);
  assert.equal((await graphApi(new Request('https://ps.test/api/graph/health'), db, NOW + 3600e3)).status, 200);
  const ins = await (await graphApi(new Request('https://ps.test/api/graph/insights'), db, NOW + 3600e3)).json();
  assert.ok((ins.insights || ins).length > 0);
  const method = await (await graphApi(new Request('https://ps.test/api/graph/method'), db, NOW + 3600e3)).json();
  assert.ok(JSON.stringify(method).includes('provenance'));
});

test('a removed solution is retired from the graph, never deleted', async () => {
  const db = d1();
  await graphTick(db, SOLUTIONS, NOW);
  const r = await graphTick(db, SOLUTIONS.slice(1), NOW + 3600e3);
  assert.ok(r.ok, r.error); assert.ok(r.retired >= 1);
  const row = db.raw.prepare('SELECT retired_at FROM kg_nodes WHERE tenant = ? AND id = ?').get(TENANT, 'solution:' + SOLUTIONS[0].id);
  assert.ok(row && row.retired_at, 'kept with a retirement time');
});

test('the worker runs the graph from its cron and serves /api/graph', () => {
  const src = readFileSync(new URL('../worker/src/index.js', import.meta.url), 'utf8');
  assert.match(src, /graphTick\(env\.DB, SOLUTIONS\)/); assert.match(src, /pathname\.startsWith\('\/api\/graph'\)/);
});
