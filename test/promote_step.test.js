// SPDX-License-Identifier: LicenseRef-Ultrastable-USL-1.0
// Copyright (c) 2026 Rowan Brad Quni-Gudzinas. Non-commercial use free; commercial use requires a license. See LICENSE.
import test from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../ps/db.js';
import { promoteStep, entriesFrom } from '../ps/promote_step.js';
import { applyPending } from '../ps/selfmigrate.js';
import { ALLOW, FILES } from '../worker/src/selfmigrate.gen.js';

test('tick step pings IndexNow for every solution, skips social without credentials, snapshots views and alerts below target', async () => {
  const db = openDb(); await applyPending(db, FILES, ALLOW, 'now', 'ps_applied_migrations');
  const calls = [];
  const f = async (u, o) => { calls.push(u); return u.endsWith('/metrics.json') ? { ok: true, json: async () => ({ daily: [{ day: '2026-11-17', views: 3 }] }) } : { ok: true, status: 200, json: async () => ({}) }; };
  const sols = [{ id: 'a', title: 'A', claim: 'c', label: 'l', domains: ['health'] }];
  const r = await promoteStep({ solutions: sols, fetch: f, env: {}, origin: 'https://ps.example' }).run(db, { now: Date.parse('2026-11-17T12:00:00Z') });
  assert.equal(r.sent, 35); assert.ok(calls.some(u => u.includes('indexnow')));
  assert.equal(r.alerts[0].metric, 'views');
  assert.ok(entriesFrom(sols, 'https://ps.example').some(e => e.url === 'https://ps.example/solutions/a'));
});
