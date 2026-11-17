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
import { route } from './site.js';
import { recordView, summary } from './reach.js';

const PUBLIC_HOST = 'solutions.ultrastable.org';
const BACKEND = 'https://ps-practical-solutions.q08.workers.dev';
const j = async (env, k, d) => { const v = await env.STATE.get(k); return v ? JSON.parse(v) : d; };
const headers = { 'content-type': 'text/html; charset=utf-8', 'content-security-policy': "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'", 'x-content-type-options': 'nosniff' };

const catalog = async env => buildCatalog({ problems: await j(env, 'problems', null), solutions: SOLUTIONS, verif: await j(env, 'verif', {}), cands: await j(env, 'candidates', {}), drafts: await j(env, 'drafts', {}), spots: await j(env, 'brightspots', {}), changes: await j(env, 'changes', []), lastTick: await j(env, 'last_tick', null) });

export default {
  async scheduled(_e, env, ctx) { ctx.waitUntil((async () => { await env.STATE.put('solutions', JSON.stringify(SOLUTIONS)); await tick({ store: env.STATE, rank: rankProblems }); })()); },
  async fetch(r, env, ctx) {
    const u = new URL(r.url);
    // behind the edge forwarder the public host is solutions.ultrastable.org; only that one host is accepted, so canonical links and the sitemap name it
    if (r.headers.get('x-forwarded-host') === PUBLIC_HOST) { u.protocol = 'https:'; u.host = PUBLIC_HOST; }
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
    if (u.pathname === '/changes.json') return Response.json({ changes: await j(env, 'changes', []), last_tick: await j(env, 'last_tick', null) });
    const origin = u.origin;
    if (['/feed.xml', '/feed.json'].includes(u.pathname)) {
      const meta = { title: 'Practical Solutions: what changed', link: origin, description: 'Every automatic change the improvement loop made: re-rankings, evidence checks, new candidate evidence.' };
      const items = itemsFrom(await j(env, 'changes', []), c => describeChange(c, origin));
      return u.pathname === '/feed.xml' ? new Response(toRss({ ...meta, items }), { headers: { 'content-type': 'application/rss+xml; charset=utf-8' } })
        : Response.json(toJsonFeed({ ...meta, feedUrl: origin + '/feed.json', items }));
    }
    const cat = await catalog(env); cat.reach = u.pathname === '/impact' ? await summary(env.STATE) : null;
    const site = route(u, cat);
    if (site) return site;
    if (['/health', '/ps/briefs', '/ps/criticality'].includes(u.pathname)) return fetch(BACKEND + u.pathname, { headers: { accept: 'application/json' } });
    return new Response('not found', { status: 404 });
  },
};
