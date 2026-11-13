// SPDX-License-Identifier: LicenseRef-Ultrastable-USL-1.0
// Copyright (c) 2026 Rowan Brad Quni-Gudzinas. Non-commercial use free; commercial use requires a license. See LICENSE.
// The composition root of this instance: Ultrastable's org (tick, claims, kernel, describe, console routes) plus the Practical
// Solutions executor, on one tick. Both the Worker and the CLI call only this.
import { createOrg } from '../vendor/ultrastable/core/org/index.js';
import { runTick } from '../vendor/ultrastable/core/src/tick.js';
import { buildConfig } from './config.js';
import { psSteps, getParams } from './steps.js';
import { unitZ } from './detect.js';
import { makeSource } from './sources.js';
import { evaluate } from './criticality.js';
import { renderBrief } from './brief.js';

const presence = env => Object.fromEntries(Object.entries(env || {}).filter(([, v]) => typeof v === 'string' && v).map(([k]) => [k, true]));

// Domain metric registered with core's score_predictions (Ultrastable PR #175): the current residual z of a brief's unit.
const metrics = {
  async ps_residual_z(db, _now, p) {
    const pr = await db.prepare(`SELECT unit, problem_id FROM ps_predictions WHERE brief_id=? LIMIT 1`).bind(p.item_id).first();
    const d = pr && await db.prepare(`SELECT payload FROM ps_datasets WHERE problem_id=? ORDER BY id DESC LIMIT 1`).bind(pr.problem_id).first();
    if (!d) return NaN;
    const z = unitZ(JSON.parse(d.payload), pr.unit, { z: (await getParams(db)).z });
    return z == null ? NaN : z;
  },
};

export function createPs({ db, env = {}, secrets = env, fetch: f = globalThis.fetch, now = () => Date.now(), config } = {}) {
  const cfg = config || buildConfig();
  const org = createOrg({ db, env, config: cfg, fetch: f, now, metrics });
  const steps = psSteps({ fetch: f, secrets, config: cfg, sourceFor: spec => makeSource(spec, { fetch: f }) });
  const tick = (e = env) => runTick(db, { config: cfg, env: presence(e), now: now(), extraSteps: [...org.extraSteps(e), ...steps], metrics });

  async function handle(request) {
    const url = new URL(request.url);
    if (url.pathname === '/ps/briefs') {
      const rows = (await db.prepare(`SELECT payload, verification, narrative, published_at FROM ps_briefs WHERE status='published' ORDER BY published_at DESC LIMIT 100`).all()).results;
      const out = rows.map(r => { const b = JSON.parse(r.payload), v = JSON.parse(r.verification || 'null'); return { id: b.id, unit: b.unit, name: b.name, z: b.z, published_at: r.published_at, markdown: renderBrief(b, v, r.narrative) }; });
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
