// SPDX-License-Identifier: LicenseRef-Ultrastable-USL-1.0
// Copyright (c) 2026 Rowan Brad Quni-Gudzinas. Non-commercial use free; commercial use requires a license. See LICENSE.
// tenant-ps-web: the tenant's own Worker. Cron runs the improvement tick; fetch serves the page and the data it reads.
// Bindings: STATE (tenant-ps-kv) only. Core is never called; the loop backend is reached by plain HTTP (BACKEND var).
import { PAGE } from './ui.js';
import { rankProblems } from './problems.js';
import { tick, verifiedText } from './improve.js';
import { toRss, toJsonFeed, itemsFrom } from '../../vendor/ultrastable/core/feed/index.js';
import { describeChange } from './publish.js';
import { SOLUTIONS } from './solutions.js';
import { buildCatalog } from './catalog.js';
import { route, notFoundResponse } from './site.js';
import { recordView, summary } from './reach.js';
import { ignoranceTick, ignView } from './unknowns.js';
import * as PV from '../../ps/provenance.js';  // PROVENANCE-1

// Behind the ultrastable.org edge the request arrives on the workers.dev host with x-forwarded-host set; links and canonicals use the public host.
const PUBLIC_HOSTS = new Set(['ultrastable.org', 'solutions.ultrastable.org']);
export const canonicalOrigin = (r, u) => { const f = (r.headers.get('x-forwarded-host') || '').toLowerCase(); return PUBLIC_HOSTS.has(f) ? 'https://' + (f === 'solutions.ultrastable.org' ? 'ultrastable.org' : f) : u.origin; };
const BACKEND = 'https://ps-practical-solutions.q08.workers.dev';
const j = async (env, k, d) => { const v = await env.STATE.get(k); return v ? JSON.parse(v) : d; };
const headers = { 'content-type': 'text/html; charset=utf-8', 'content-security-policy': "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'", 'x-content-type-options': 'nosniff' };

const catalog = async env => buildCatalog({ problems: await j(env, 'problems', null), solutions: SOLUTIONS, verif: await j(env, 'verif', {}), cands: await j(env, 'candidates', {}), drafts: await j(env, 'drafts', {}), spots: await j(env, 'brightspots', {}), changes: await j(env, 'changes', []), lastTick: await j(env, 'last_tick', null) });

export default {
  // The account is at the free plan's cron limit, so the backend has no cron of its own: this Worker's schedule also runs the backend tick
  // through a service binding (CORE). The backend has no public route, so only this call reaches /internal/tick.
  async scheduled(_e, env, ctx) {
    if (env.CORE) ctx.waitUntil(env.CORE.fetch('https://core.internal/internal/tick', { method: 'POST', headers: { 'x-ps-internal': '1' } }).catch(() => {}));
    ctx.waitUntil((async () => { await env.STATE.put('solutions', JSON.stringify(SOLUTIONS)); const r = await tick({ store: env.STATE, rank: rankProblems }); await PV.recordChanges(env.STATE, r.changes, r.at);
      try { await ignoranceTick({ store: env.STATE, cat: await catalog(env) }); await env.STATE.delete('ignorance:error'); } catch (e) { await env.STATE.put('ignorance:error', String(e.message || e)); } })());
  },
  async fetch(r, env, ctx) {
    const u = new URL(r.url);
    if (ctx && ctx.waitUntil) ctx.waitUntil(recordView(env.STATE, r).catch(() => {}));
    if (u.pathname === '/metrics.json') return Response.json(await summary(env.STATE), { headers: { 'cache-control': 'public, max-age=300' } });
    if (u.pathname === '/live') return new Response(PAGE, { headers });
    if (u.pathname === '/solutions.json') {
      const verif = await j(env, 'verif', {});
      const sols = (await j(env, 'solutions', [])).map(({ checks, ...s }) => ({ ...s, verified: verifiedText(verif[s.id]) || s.verified }));
      return Response.json({ solutions: sols });
    }
    if (u.pathname === '/problems.json') return Response.json(await j(env, 'problems', null) || await rankProblems());
    if (u.pathname === '/drafts.json') { const d = await j(env, 'drafts', {}); return Response.json({ drafts: Object.values(d).filter(x => x.status === 'reviewed') }); }
    if (u.pathname === '/brightspots.json') return Response.json(await j(env, 'brightspots', {}));
    if (u.pathname === '/candidates.json') return Response.json(await j(env, 'candidates', {}));
    // PROVENANCE-1: public changelog (public rows only, redacted); visitor suggestions are stored private; the owner and loops write with a token (PS_PROVENANCE_TOKEN).
    if (u.pathname === '/changelog') return new Response(PV.changelogHtml(await PV.publicView(env.STATE)), { headers });
    if (u.pathname === '/changelog.json') return Response.json(await PV.publicView(env.STATE), { headers: { 'cache-control': 'public, max-age=300' } });
    if (u.pathname === '/api/suggest' && r.method === 'POST') { let b = {}; try { b = await r.json(); } catch { } const x = await PV.suggest(env.STATE, b); return Response.json(x.body, { status: x.status }); }
    if (u.pathname.startsWith('/api/provenance')) {
      if (!env.PS_PROVENANCE_TOKEN || r.headers.get('authorization') !== 'Bearer ' + env.PS_PROVENANCE_TOKEN) return new Response('forbidden\n', { status: 403 });
      if (r.method === 'GET') return Response.json({ entries: await PV.full(env.STATE) });
      let b = {}; try { b = await r.json(); } catch { return Response.json({ error: 'body must be JSON' }, { status: 400 }); }
      try { return Response.json(b.settle ? { ok: await PV.settle(env.STATE, b.settle, b.effect, b.note) } : { ok: true, row: await PV.add(env.STATE, b) }); } catch (x) { return Response.json({ error: String(x.message || x) }, { status: 400 }); }
    }
    if (u.pathname === '/changes.json') return Response.json({ changes: await j(env, 'changes', []), last_tick: await j(env, 'last_tick', null) });
    const origin = canonicalOrigin(r, u);
    if (['/feed.xml', '/feed.json'].includes(u.pathname)) {
      const meta = { title: 'Practical Solutions: what changed', link: origin, description: 'Every automatic change the improvement loop made: re-rankings, evidence checks, new candidate evidence.' };
      const items = itemsFrom(await j(env, 'changes', []), c => describeChange(c, origin));
      return u.pathname === '/feed.xml' ? new Response(toRss({ ...meta, items }), { headers: { 'content-type': 'application/rss+xml; charset=utf-8' } })
        : Response.json(toJsonFeed({ ...meta, feedUrl: origin + '/feed.json', items }));
    }
    const cat = await catalog(env); cat.ign = await ignView(env.STATE).catch(() => null); cat.reach = u.pathname === '/impact' ? await summary(env.STATE) : null;
    const site = route(new URL(u.pathname + u.search, origin), cat);
    if (site) return site;
    if (['/health', '/ps/briefs', '/ps/criticality'].includes(u.pathname)) return fetch(BACKEND + u.pathname, { headers: { accept: 'application/json' } });
    return notFoundResponse(cat, new URL(u.pathname + u.search, origin));
  },
};
