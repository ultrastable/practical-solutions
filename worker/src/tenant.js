// SPDX-License-Identifier: LicenseRef-Ultrastable-USL-1.0
// Copyright (c) 2026 Rowan Brad Quni-Gudzinas. Non-commercial use free; commercial use requires a license. See LICENSE.
// tenant-ps-web: the tenant's own Worker. Cron runs the improvement tick; fetch serves the page and the data it reads.
// Bindings: STATE (tenant-ps-kv) only. Core is never called; the loop backend is reached by plain HTTP (BACKEND var).
import { socialQueue, recentIds } from './social-voice.js';
import { PAGE } from './ui.js';
import { rankProblems } from './problems.js';
import { tick, verifiedText, recordErrors } from './improve.js';
import { indexnowKey } from '../../vendor/ultrastable/core/promote/index.js';
import { toRss, toJsonFeed, itemsFrom } from '../../vendor/ultrastable/core/feed/index.js';
import { describeChange } from './publish.js';
import { SOLUTIONS } from './solutions.js';
import { contentFeed } from './content-feed.js';  // STICKY-1
import { buildCatalog } from './catalog.js';
import { mergeChanges } from './loop-events.js';  // CHANGES-FEED-1
import { route, notFoundResponse } from './site.js';
import { recordView, summary } from './reach.js';
import { ignoranceTick, ignView } from './unknowns.js';
import { bcaTick, KEY as BCA_KEY } from './bca.js';
import * as PV from '../../ps/provenance.js';  // PROVENANCE-1
import { goalsTick, knob } from './goals.js';  // GOALS-1
import { askRoute, LIMITS as ASK_LIMITS } from './ask.js';  // ASK-1
import { connectionsRoute } from './connections.js';  // DISCOVER-1
import { allow, callerId } from '../../vendor/ultrastable/core/ask/index.js';
import { sitePage } from './site.js';
import { freshnessResponse } from './freshness.js';  // PAGES-FRESH-1
import { sitemapFor, sitemapIndex, parsePath, localizable } from '../../vendor/ultrastable/core/i18n/index.js';  // I18N-1
import { CODES, manifest, liveLangs, decorate, syncDictionaries, SOURCE_LANG } from './i18n.js';
import { sitemapPaths } from './site.js';

// Behind the ultrastable.org edge the request arrives on the workers.dev host with x-forwarded-host set; links and canonicals use the public host.
const PUBLIC_HOSTS = new Set(['ultrastable.org', 'solutions.ultrastable.org']);
export const canonicalOrigin = (r, u) => { const f = (r.headers.get('x-forwarded-host') || '').toLowerCase(); return PUBLIC_HOSTS.has(f) ? 'https://' + (f === 'solutions.ultrastable.org' ? 'ultrastable.org' : f) : u.origin; };
const BACKEND = 'https://tenant-ps-core.ultrastable.workers.dev';
const j = async (env, k, d) => { const v = await env.STATE.get(k); return v ? JSON.parse(v) : d; };
const headers = { 'content-type': 'text/html; charset=utf-8', 'content-security-policy': "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'", 'x-content-type-options': 'nosniff' };

const catalog = async env => buildCatalog({ problems: await j(env, 'problems', null), solutions: SOLUTIONS, verif: await j(env, 'verif', {}), cands: await j(env, 'candidates', {}), drafts: await j(env, 'drafts', {}), spots: await j(env, 'brightspots', {}), changes: mergeChanges(await j(env, 'changes', [])), lastTick: await j(env, 'last_tick', null), bcaState: await j(env, BCA_KEY, null) });

// BACKEND-PULSE-1: the backend (tenant-ps-core) has no cron; this schedule is its first route (the impact-loop workflow is the second). It calls
// POST /pulse/watch through the CORE service binding, or over plain HTTP when the binding is missing, and never drops a failure: the outcome is
// logged and kept in STATE under core:pulse, so a silent backend shows up in the store and in the backend's own GET /pulse reading.
export async function pulseCore(env, fetchFn = fetch) {
  const init = { method: 'POST', headers: { 'x-ps-internal': '1', accept: 'application/json' } };
  let out;
  try {
    const r = env.CORE ? await env.CORE.fetch('https://core.internal/pulse/watch', init) : await fetchFn(BACKEND + '/pulse/watch', init);
    let body = null; try { body = await r.json(); } catch { body = null; }
    out = { at: new Date().toISOString(), via: env.CORE ? 'CORE' : 'http', status: r.status, ok: r.ok && Boolean(body && body.ok), ran: Boolean(body && body.ran), error: r.ok ? (body && body.error) || null : `HTTP ${r.status}` };
  } catch (e) { out = { at: new Date().toISOString(), via: env.CORE ? 'CORE' : 'http', status: 0, ok: false, ran: false, error: String(e && e.message || e).slice(0, 300) }; }
  if (!out.ok) console.error('ps core pulse', JSON.stringify(out));
  try { await env.STATE.put('core:pulse', JSON.stringify(out)); } catch (e) { console.error('ps core pulse: STATE write failed', e && e.message || e); }
  return out;
}

const handler = {
  // The account is at the free plan's cron limit, so the backend has no cron of its own: this Worker's schedule also runs the backend tick
  // and knowledge graph through POST /pulse/watch (pulseCore above), which runs them only when the newest tick is older than its interval.
  async scheduled(_e, env, ctx) {
    ctx.waitUntil(pulseCore(env));  // BACKEND-PULSE-1
    ctx.waitUntil((async () => { await env.STATE.put('solutions', JSON.stringify(SOLUTIONS)); const r = await tick({ store: env.STATE, rank: rankProblems, mailto: env.OPENALEX_MAILTO, maxVerify: knob(await j(env, 'goals:knobs', {}), 'ps.verify.per_tick', undefined) });  // GOALS-1: core's knob value, the default when unset
      try { await PV.recordChanges(env.STATE, [...r.changes, ...r.errors], r.at); } catch (e) { await env.STATE.put('provenance:error', String(e.message || e)); }
      try { const b = await bcaTick({ store: env.STATE }); const be = b.changes.filter(c => /_error$/.test(c.kind)), bc = b.changes.filter(c => !/_error$/.test(c.kind)); await recordErrors(env.STATE, be, b.at); if (b.changes.length) { await PV.recordChanges(env.STATE, b.changes, b.at); if (bc.length) await env.STATE.put('changes', JSON.stringify([...bc.map(c => ({ at: b.at, ...c })), ...(await j(env, 'changes', []))].slice(0, 200))); } } catch (e) { await env.STATE.put('bca:error', String(e.message || e)); }
      try { let backend = null; try { if (env.CORE) { const b = await env.CORE.fetch('https://core.internal/internal/goals', { headers: { 'x-ps-internal': '1' } }); if (b.ok) backend = await b.json(); } } catch { } await goalsTick({ store: env.STATE, cat: await catalog(env), reach: await summary(env.STATE), backend }); } catch (e) { await env.STATE.put('goals:error', String(e.message || e)); }  // GOALS-1
      try { await syncDictionaries(env); await env.STATE.delete('i18n:error'); } catch (e) { await env.STATE.put('i18n:error', String(e.message || e)); }  // I18N-1
      try { await ignoranceTick({ store: env.STATE, env, cat: await catalog(env), fetchFn: (u) => fetch(u) }); await env.STATE.delete('ignorance:error'); } catch (e) { await env.STATE.put('ignorance:error', String(e.message || e)); } })());
  },
  async inner(r, env, ctx) {
    const u = new URL(r.url);
    if (ctx && ctx.waitUntil) ctx.waitUntil(recordView(env.STATE, r).catch(() => {}));
    // PAGES-FRESH-1: the public front end reports the age of its own bundles. The route existed only on the backend Worker, so the core's
    // pages-live probe of this host read 404 and a stale front end could not be detected (found 2026-11-20).
    if (u.pathname === '/api/freshness') return freshnessResponse();
    if (u.pathname === '/metrics.json') return Response.json(await summary(env.STATE), { headers: { 'cache-control': 'public, max-age=300' } });
    // AUDIT-1: the public half of the audit log (counts, chain head, verification, Merkle proofs) is read from the backend through the service binding.
    if (env.CORE && (u.pathname === '/audit/summary.json' || u.pathname === '/audit/verify' || u.pathname === '/audit/proof') && r.method === 'GET') return env.CORE.fetch('https://core.internal' + u.pathname + u.search);
    // KGRAPH-1: the knowledge graph lives in the backend's D1; its public read side (graph, insights, node, method, health, and a reader's POST
    // follow) is served here through the service binding, since the backend has no public route.
    // BACKEND-PULSE-1: the backend's live reading and its watch route, on the public host too.
    if (u.pathname === '/pulse' && r.method === 'GET') return env.CORE ? env.CORE.fetch('https://core.internal/pulse') : fetch(BACKEND + '/pulse');
    if (u.pathname === '/pulse/watch' && r.method === 'POST') return env.CORE ? env.CORE.fetch('https://core.internal/pulse/watch', { method: 'POST' }) : fetch(BACKEND + '/pulse/watch', { method: 'POST' });
    if (env.CORE && u.pathname.startsWith('/api/graph') && (r.method === 'GET' || r.method === 'POST')) return env.CORE.fetch(new Request('https://core.internal' + u.pathname + u.search, r));
    if (u.pathname === '/goals.json') return Response.json(await j(env, 'goals:feed', { tenant: 'ps', goals: [], knobs: [], readings: {} }), { headers: { 'cache-control': 'public, max-age=300', 'access-control-allow-origin': '*' } });  // GOALS-1: the public feed core reads
    if (u.pathname === '/live') return new Response(PAGE, { headers });
    if (u.pathname === '/solutions.json') {
      const verif = await j(env, 'verif', {});
      const sols = (await j(env, 'solutions', [])).map(({ checks, ...s }) => ({ ...s, verified: verifiedText(verif[s.id]) || s.verified }));
      return Response.json({ solutions: sols });
    }
    if (u.pathname === '/problems.json') return Response.json(await j(env, 'problems', null) || await rankProblems());
    if (u.pathname === '/graph.json') return Response.json(await j(env, 'graph', { nodes: [], edges: [], stats: {} }), { headers: { 'cache-control': 'public, max-age=300' } });
    if (u.pathname === '/questions.json') return Response.json(await j(env, 'questions', { questions: [] }), { headers: { 'cache-control': 'public, max-age=300' } });
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
    if (u.pathname === '/social-queue.json') { const cat = await catalog(env), origin = canonicalOrigin(r, u); return Response.json(socialQueue(cat, { origin, recent: recentIds(await j(env, 'changes', [])) }), { headers: { 'cache-control': 'public, max-age=600' } }); }  // SOCIAL-VOICE-1
    if (u.pathname === '/changes.json') return Response.json({ changes: mergeChanges(await j(env, 'changes', [])), last_tick: await j(env, 'last_tick', null) });
    if (/^\/[a-f0-9]{32}\.txt$/.test(u.pathname) && u.pathname === '/' + await indexnowKey('practical-solutions') + '.txt') return new Response(u.pathname.slice(1, 33), { headers: { 'content-type': 'text/plain' } });
    const origin = canonicalOrigin(r, u);
    const asked = await askRoute(r, u, env, ctx, { origin, lang: r.headers.get('x-ps-lang') || SOURCE_LANG, headers });  // ASK-1
    if (asked) return asked;
    const conn = await connectionsRoute(u, env, { origin, page: sitePage, headers, allowFn: async () => (await allow(env.STATE, { caller: await callerId(r), ...ASK_LIMITS })).model });  // DISCOVER-1
    if (conn) return conn;
    if (u.pathname === '/sitemap.xml' || /^\/sitemap-[a-z]{2,3}\.xml$/.test(u.pathname)) {  // I18N-1: an index plus one sitemap per live language, with hreflang alternates
      const live = liveLangs(await manifest(env)), x = { headers: { 'content-type': 'application/xml', 'cache-control': 'public, max-age=3600' } };
      if (u.pathname === '/sitemap.xml') return new Response(sitemapIndex({ origin, langs: live }), x);
      const lang = u.pathname.slice(9, -4); if (lang !== SOURCE_LANG && !live.includes(lang)) return new Response('not found\n', { status: 404 });
      return new Response(sitemapFor({ origin, paths: sitemapPaths(await catalog(env)), lang, live, def: SOURCE_LANG }), x);
    }
    if (u.pathname === '/content.json') return Response.json(contentFeed(origin), { headers: { 'content-type': 'application/feed+json; charset=utf-8', 'cache-control': 'public, max-age=900', 'access-control-allow-origin': '*' } });  // STICKY-1
    if (['/feed.xml', '/feed.json'].includes(u.pathname)) {
      const meta = { title: 'Practical Solutions: what changed', link: origin, description: 'Every automatic change the improvement loop made: re-rankings, evidence checks, new candidate evidence.' };
      const items = itemsFrom(mergeChanges(await j(env, 'changes', [])), c => describeChange(c, origin));
      return u.pathname === '/feed.xml' ? new Response(toRss({ ...meta, items }), { headers: { 'content-type': 'application/rss+xml; charset=utf-8' } })
        : Response.json(toJsonFeed({ ...meta, feedUrl: origin + '/feed.json', items }));
    }
    // CPU-LIMIT-1: a cold isolate pays for compiling and rendering a page on its first request, which can pass the free plan's 10 ms. Rendered pages are
    // therefore cached at the edge (Cache API, keyed by the public URL) for the max-age they already declare, so only the first request per URL per location renders.
    const edge = typeof caches !== 'undefined' && r.method === 'GET' ? caches.default : null, ckey = edge && new Request(origin + u.pathname + u.search);
    if (edge) { const hit = await edge.match(ckey); if (hit) return hit; }
    const cat = await catalog(env); cat.ign = await ignView(env.STATE).catch(() => null); cat.reach = u.pathname === '/impact' ? await summary(env.STATE) : null;
    const site = route(new URL(u.pathname + u.search, origin), cat);
    if (site) { if (edge && site.status === 200 && ctx && ctx.waitUntil) ctx.waitUntil(edge.put(ckey, site.clone()).catch(() => {})); return site; }
    if (['/health', '/ps/briefs', '/ps/criticality'].includes(u.pathname)) return fetch(BACKEND + u.pathname, { headers: { accept: 'application/json' } });
    return notFoundResponse(cat, new URL(u.pathname + u.search, origin));
  },
};

// I18N-1: /<lang>/... serves the same page in a live language; every HTML page also carries hreflang alternates and a language switcher. The finished
// page is cached at the edge by its public URL, so a request normally costs one cache read.
const htmlOk = res => res.status === 200 && /text\/html/.test(res.headers.get('content-type') || '');
export default {
  scheduled: handler.scheduled,
  async fetch(r, env, ctx) {
    const u = new URL(r.url);
    if (r.method !== 'GET' || !localizable(u.pathname + u.search)) return handler.inner(r, env, ctx);
    const { lang, rest } = parsePath(u.pathname, CODES), origin = canonicalOrigin(r, u);
    const edge = typeof caches !== 'undefined' ? caches.default : null, ckey = edge && new Request(origin + u.pathname + u.search + '#i18n');
    if (edge) { const hit = await edge.match(ckey); if (hit) return hit; }
    if (lang && !liveLangs(await manifest(env)).includes(lang)) return Response.redirect(origin + rest + u.search, 302);
    const inner = lang ? new Request(u.origin + rest + u.search, { headers: new Headers([...r.headers, ['x-ps-lang', lang]]) }) : r;
    const res = await handler.inner(inner, env, ctx);
    if (!htmlOk(res)) return res;
    const html = await decorate(await res.text(), { env, lang: lang || SOURCE_LANG, origin, path: rest + u.search });
    const out = new Response(html, { status: 200, headers: new Headers(res.headers) });
    if (lang) out.headers.set('content-language', lang);
    out.headers.set('vary', 'accept-encoding');
    if (edge && ctx && ctx.waitUntil) ctx.waitUntil(edge.put(ckey, out.clone()).catch(() => {}));
    return out;
  },
};
