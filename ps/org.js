// SPDX-License-Identifier: LicenseRef-Ultrastable-USL-1.0
// Copyright (c) 2026 Rowan Brad Quni-Gudzinas. Non-commercial use free; commercial use requires a license. See LICENSE.
// The composition root of this instance: Ultrastable's org (tick, claims, kernel, describe, console routes) plus the Practical
// Solutions executor, on one tick. Both the Worker and the CLI call only this.
import { createOrg } from '../vendor/ultrastable/core/org/index.js';
import { runTick } from '../vendor/ultrastable/core/src/tick.js';
import { buildConfig } from './config.js';
import { psSteps } from './steps.js';
import { makeSource } from './sources.js';
import { evaluate } from './criticality.js';
import { renderBrief } from './brief.js';
import { psMetrics } from './metrics.js';
import { outreachStep } from './outreach_step.js';
import { selfMigrateStep } from './selfmigrate.js';

const presence = env => Object.fromEntries(Object.entries(env || {}).filter(([, v]) => typeof v === 'string' && v).map(([k]) => [k, true]));

export function createPs({ db, env = {}, secrets = env, fetch: f = globalThis.fetch, now = () => Date.now(), config, selfMigrate = null, solutions = [], footer = '', origin = '' } = {}) {
  const cfg = config || buildConfig();
  const org = createOrg({ db, env, config: cfg, fetch: f, now, metrics: psMetrics });
  const steps = psSteps({ fetch: f, secrets, config: cfg, sourceFor: spec => makeSource(spec, { fetch: f }) });
  const tick = (e = env) => runTick(db, { config: cfg, env: presence(e), now: now(), extraSteps: [...(selfMigrate ? [selfMigrateStep(selfMigrate)] : []), ...org.extraSteps(e), ...steps, ...(solutions.length ? [outreachStep({ solutions, fetch: f, env: e, footer, origin })] : [])], metrics: psMetrics });

  async function handle(request) {
    const url = new URL(request.url);
    if (url.pathname === '/ps/briefs') {
      const rows = (await db.prepare(`SELECT payload, verification, narrative, published_at, id FROM ps_briefs WHERE status='published' ORDER BY published_at DESC LIMIT 100`).all()).results;
      const out = await Promise.all(rows.map(async r => { const b = JSON.parse(r.payload), v = JSON.parse(r.verification || 'null'); return { id: b.id, unit: b.unit, name: b.name, z: b.z, published_at: r.published_at, markdown: renderBrief(b, v, r.narrative, JSON.parse(((await db.prepare(`SELECT payload FROM ps_extractions WHERE brief_id=?`).bind(r.id).first()) || {}).payload || 'null')) }; }));
      return Response.json({ briefs: out });
    }
    if (url.pathname === '/ps/criticality') {
      const last = await db.prepare(`SELECT payload FROM ps_criticality ORDER BY id DESC LIMIT 1`).first();
      return Response.json(last ? JSON.parse(last.payload) : await evaluate(db, { now: now(), config: cfg }));
    }
    return org.handle(request);
  }
  return { org, tick, handle, config: cfg };
}
