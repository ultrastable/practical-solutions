// SPDX-License-Identifier: LicenseRef-Ultrastable-USL-1.0
// Copyright (c) 2026 Rowan Brad Quni-Gudzinas. Non-commercial use free; commercial use requires a license. See LICENSE.
// BACKEND-PULSE-1: how the backend (tenant-ps-core) runs with no cron of its own. The account is at its cron limit, so tenant-ps-core has zero
// schedules (verified on Cloudflare 2026-11-25) and its tick and knowledge graph run only when something calls it:
//   route 1: the web Worker's */30 cron calls POST /pulse/watch through the CORE service binding (plain HTTP to the backend when unbound);
//   route 2: the impact-loop workflow (GitHub Actions, built-in token, no secret) calls POST /pulse/watch on the backend's public host.
// /pulse/watch is safe to call by anyone and idempotent: it runs one tick only when the newest tick is older than `every_min`, and an atomic
// claim row means two callers in the same window run it once. The graph step gates itself to once an hour (kg.js graphTick).
// GET /pulse is the live reading that decides "done": when the tick and the graph last ran and how many nodes the graph holds; 503 when the
// graph never ran, its last run failed or is stale, or the tick is older than `stale_tick_min`.
import { kgHealth } from '../../vendor/seed/knowledge.js';

export const PULSE = { every_min: 25, stale_tick_min: 90, graph_stale_h: 26 };
const CLAIM_DDL = `CREATE TABLE IF NOT EXISTS ps_pulse (id INTEGER PRIMARY KEY CHECK (id = 1), at INTEGER NOT NULL, by TEXT)`;
const sqlTime = s => (s ? Date.parse(String(s).replace(' ', 'T') + (/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? '' : 'Z')) : NaN);

// The newest tick_runs row's start time in ms, or null when the table is empty or missing (a database that has never ticked).
export async function lastTickAt(db) {
  let row = null;
  try { row = await db.prepare(`SELECT started_at FROM tick_runs ORDER BY id DESC LIMIT 1`).first(); } catch (e) { if (!/no such table/i.test(String(e && e.message))) throw e; }
  const t = row ? sqlTime(row.started_at) : NaN;
  return Number.isFinite(t) ? t : null;
}

// Atomic: true for exactly one caller per window. SQLite applies the conditional upsert as one statement, so a second concurrent claim changes 0 rows.
export async function claim(db, now, every_min = PULSE.every_min, by = 'pulse') {
  await db.prepare(CLAIM_DDL).run();
  const r = await db.prepare(`INSERT INTO ps_pulse (id, at, by) VALUES (1, ?, ?) ON CONFLICT(id) DO UPDATE SET at = excluded.at, by = excluded.by WHERE ps_pulse.at <= ?`)
    .bind(now, by, now - every_min * 60e3).run();
  return Boolean(r && r.meta && r.meta.changes);
}

// run(): runs the tick (and the graph); its result is returned as `result`. Never throws: a failed run is reported with ok:false.
export async function watch(db, { run, now = Date.now(), every_min = PULSE.every_min, by = 'pulse', halted = false } = {}) {
  if (halted) return { ok: true, ran: false, halted: true, why: 'HALT=1: the owner stopped every loop' };
  const last = await lastTickAt(db);
  if (last !== null && now - last < every_min * 60e3) return { ok: true, ran: false, why: 'the last tick is newer than the interval', last_tick_at: new Date(last).toISOString(), next_due_at: new Date(last + every_min * 60e3).toISOString() };
  if (!(await claim(db, now, every_min, by))) return { ok: true, ran: false, why: 'another caller claimed this interval', last_tick_at: last === null ? null : new Date(last).toISOString() };
  try { return { ok: true, ran: true, by, at: new Date(now).toISOString(), result: await run() }; }
  catch (e) { console.error('ps pulse', e && e.message || e); return { ok: false, ran: true, by, at: new Date(now).toISOString(), error: String(e && e.message || e).slice(0, 300) }; }
}

export async function reading(db, { tenant, now = Date.now(), stale_tick_min = PULSE.stale_tick_min, graph_stale_h = PULSE.graph_stale_h } = {}) {
  const last = await lastTickAt(db), g = await kgHealth(db, tenant, now, { stale_h: graph_stale_h });
  const tickAge = last === null ? null : (now - last) / 60e3;
  const graphAt = g.last_run_hours_ago === null ? null : new Date(now - g.last_run_hours_ago * 36e5).toISOString();
  const why = [];
  if (g.last_run_hours_ago === null) why.push('the knowledge graph has never run');
  else if (g.last_error) why.push('the last graph run failed: ' + String(g.last_error).slice(0, 200));
  else if (!g.ok) why.push(`the last graph run is ${g.last_run_hours_ago} h old (limit ${graph_stale_h} h)`);
  if (tickAge === null) why.push('the backend tick has never run');
  else if (tickAge > stale_tick_min) why.push(`the last tick is ${Math.round(tickAge)} min old (limit ${stale_tick_min} min)`);
  return { ok: why.length === 0, at: new Date(now).toISOString(), why,
    tick: { last_at: last === null ? null : new Date(last).toISOString(), age_min: tickAge === null ? null : Number(tickAge.toFixed(1)), limit_min: stale_tick_min },
    graph: { last_at: graphAt, age_h: g.last_run_hours_ago, nodes: g.nodes, edges: g.edges, communities: g.communities, last_error: g.last_error, limit_h: graph_stale_h },
    routes: { watch: 'POST /pulse/watch', callers: ['tenant-ps-web cron */30 via CORE', 'impact-loop workflow every 3 h'] } };
}

export const json = (body, status = 200) => Response.json(body, { status, headers: { 'cache-control': 'no-store', 'access-control-allow-origin': '*' } });
