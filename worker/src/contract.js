// SPDX-License-Identifier: LicenseRef-Ultrastable-USL-1.0
// Copyright (c) 2026 Rowan Brad Quni-Gudzinas. Non-commercial use free; commercial use requires a license. See LICENSE.
// FLEET-CONTRACT-1: Practical Solutions on the one contract every Ultrastable system serves (vendor/seed/contract.js, the core's
// seed/worker/src/contract.js). The statements stay where they are (method-claims.js, each with a probe of the real behaviour); this file adds
// the two things the fleet contract asks of each: the page that shows the sentence (/method renders every one) and the JSON endpoint that
// backs it. A statement with no endpoint of its own (the two accessibility statements describe the pages themselves) carries a page only.
// /claims.json keeps its fields and gains `contract`, `page` and `api`; /.well-known/ultrastable.json comes from the shared manifest();
// /health is this Worker's own reading (HEALTH-FRONT-1). Test: test/contract.test.js.
import { manifest, CONTRACT_VERSION } from '../../vendor/seed/contract.js';

export const PAGE = '/method';
// by statement id first, then by /method section
export const API_BY_ID = {
  'audit-log': '/audit/summary.json', 'knowledge-graph': '/api/graph', 'loop-candidates': '/candidates.json', 'loop-pipeline': '/pipeline.json',
  'loop-spots': '/brightspots.json', 'loop-quotes': '/drafts.json', 'loop-feed': '/feed.json', 'catalogue-scan': '/catalogue.json',
};
export const API_BY_SECTION = {
  intro: '/ensemble.json', loop: '/changes.json', problems: '/problems.json', solutions: '/solutions.json', labels: '/index.json', checks: '/changes.json',
  impl: '/index.json', bca: '/index.json', unknowns: '/unknowns.json', models: '/ensemble.json', not: '/index.json',
};
export const apiFor = s => API_BY_ID[s.id] || API_BY_SECTION[s.section] || null;

export const SPEC_BASE = {
  name: 'Practical Solutions',
  summary: 'An evidence-based encyclopedia of what works: ranked problems, solutions with their evidence, and a loop that re-checks them.',
  url: 'https://ultrastable.org',
  repo: 'ultrastable/practical-solutions',
};
// The site answers on its public domain and on its workers.dev address; like every page's canonical link, the manifest names the origin it was asked on.
export const manifestJson = (origin = SPEC_BASE.url) => manifest({ ...SPEC_BASE, url: origin });

// described: the output of core/statements describe(). Existing fields are kept; page and api are added.
export function claimsJson(described) {
  return { contract: CONTRACT_VERSION, system: SPEC_BASE.name, statements: described.map(s => { const api = apiFor(s); return { ...s, page: PAGE, ...(api ? { api } : {}) }; }) };
}
// The declaration the shared verify() reads: the statements that carry both a page and an endpoint.
export const specFrom = described => ({ ...SPEC_BASE, statements: claimsJson(described).statements.filter(s => s.api).map(s => ({ id: s.id, text: s.text, page: s.page, api: s.api })) });

// HEALTH-FRONT-1: the front end's own health. It was a plain fetch of the backend's workers.dev address, which Cloudflare refuses between two
// Workers of one account (error 1042), so the public /health read 404. Now it is computed here from the improvement tick this Worker runs, and
// the backend is read through the service binding when one is bound.
export const TICK_MAX_AGE_MIN = 120;
export async function health(env, now = Date.now()) {
  let last = null;
  try { const v = await env.STATE.get('last_tick'); last = v ? JSON.parse(v) : null; } catch (e) { last = { error: String(e && e.message || e) }; }
  const at = last && Date.parse(last.at), age = Number.isFinite(at) ? Math.round((now - at) / 60000) : null;
  const tick = { last_at: (last && last.at) || null, minutes_ago: age, max_minutes: TICK_MAX_AGE_MIN, ok: age !== null && age <= TICK_MAX_AGE_MIN };
  let backend = { bound: Boolean(env.CORE) };
  if (env.CORE) {
    try { const r = await env.CORE.fetch('https://core.internal/health', { headers: { accept: 'application/json' } }); backend = { bound: true, status: r.status, ok: r.status < 500 }; }
    catch (e) { backend = { bound: true, ok: false, error: String(e && e.message || e).slice(0, 160) }; }
  }
  const ok = tick.ok && (!env.CORE || backend.ok);
  return { ok, service: 'practical-solutions', tick, backend, checked_at: new Date(now).toISOString() };
}
