// SPDX-License-Identifier: LicenseRef-Ultrastable-USL-1.0
// Copyright (c) 2026 Rowan Brad Quni-Gudzinas. Non-commercial use free; commercial use requires a license. See LICENSE.
// DISCOVER-1 (tenant side): /connections, /connections.json and the vector half of /ask. The graph, the ledger and the ranking are built by
// tools/connections.mjs on its own daily run (core/discover); this file only shows what that run found and searches the vectors it made.
// A question's own vector comes from the Workers AI binding when there is one; without it the page and /ask still work on keywords.
import * as ui from './kit/index.js';
import { CONNECTIONS } from './connections.gen.js';
import { ASK_VECTORS } from './ask-vectors.gen.js';
import { ASK_INDEX } from './ask-index.gen.js';
import { unpack, nearest } from '../../vendor/ultrastable/core/discover/index.js';

const { esc } = ui;
export const VIEW = CONNECTIONS;
let M = null; // unpacked once per isolate, on first use
const index = () => (M ||= ASK_VECTORS && ASK_VECTORS.ids && ASK_VECTORS.ids.length ? unpack(ASK_VECTORS) : null);

/** A semantic retriever for core/ask: returns [{ id, score }] over the /ask documents, or [] when there is no model or no index. */
export const semanticFor = env => (env && env.AI && env.AI.run && ASK_VECTORS && ASK_VECTORS.model ? async text => {
  const I = index(); if (!I) return [];
  const out = await env.AI.run(ASK_VECTORS.model, { text: [String(text).slice(0, 500)] });
  const v = out && out.data && out.data[0]; if (!Array.isArray(v) || v.length !== I.dim) return [];
  return nearest(I, v, { k: 8 });
} : undefined);

const TYPES = [
  ['transfer', 'Proven solutions that may transfer', 'Each solution below has evidence against one problem. The problem it is paired with reads alike, and nothing in the catalogue links the two yet.'],
  ['combination', 'Combinations worth testing', 'Two solutions that act on related problems from different angles and have never been combined here.'],
  ['bridge', 'Hidden links', 'Items that read alike but sit in different clusters of the graph, with no known link between them.'],
  ['frontier', 'Open questions', 'Problems that no solution in the catalogue comes near. These are where new evidence is most needed.'],
];
const pct = x => Math.round(100 * x) + '%';
const day = s => String(s || '').slice(0, 10);
const titleOf = c => c.type === 'transfer' ? `${c.members[0].label} → ${c.members[1].label}` : c.type === 'frontier' ? c.members[0].label : `${c.members[0].label} + ${c.members[1].label}`;
const hrefOf = c => (c.type === 'transfer' ? c.members[1].url : c.members[0].url) || '/connections';

function card(c) {
  const badges = [ui.badge(c.novelty === 'none' ? 'no known path' : 'two steps apart', c.novelty === 'none' ? 'ok' : 'info'), c.cross ? ui.badge('across clusters', 'info') : '', ui.badge('lead, not evidence', 'warn')].filter(Boolean);
  const links = `<p class="m s">${c.members.map(m => m.url ? `<a href="${esc(m.url)}">${esc(m.label)}</a>` : esc(m.label)).join(' · ')}${c.via ? ` · via <a href="${esc(c.via.url || '#')}">${esc(c.via.label)}</a>` : ''} · first seen ${esc(day(c.first_seen))}</p>`;
  const model = c.why_model ? `<p class="s"><b>Possible mechanism:</b> ${esc(c.why_model.text)} <span class="m">(${esc(c.why_model.note)})</span></p>` : '';
  return ui.card({ title: titleOf(c), href: hrefOf(c), body: c.why, meta: `${c.type} · score ${c.score}`, badges, foot: model + links });
}

export function relatedBlock(q, hits) {
  if (!q) return '';
  if (!hits) return ui.callout({ tone: 'warn', title: 'Meaning search is unavailable right now', body: `<p>Try <a href="/ask?q=${encodeURIComponent(q)}">asking the question</a> or <a href="/search?q=${encodeURIComponent(q)}">searching by words</a>.</p>` });
  if (!hits.length) return ui.callout({ tone: 'warn', title: 'Nothing close in meaning', body: `<p>No page reads like “${esc(q)}”. <a href="/ask?q=${encodeURIComponent(q)}">Ask it as a question</a> instead.</p>` });
  return ui.section({ id: 'related', title: `Closest in meaning to “${q}”`, body: ui.list(hits.map(h => `<a href="${esc(h.url)}">${esc(h.title)}</a> <span class="m">${pct(h.score)} alike</span>`)) + `<p><a href="/ask?q=${encodeURIComponent(q)}">Ask this as a question</a></p>` });
}

/** The page body; `page` is the site's shell (path, origin, title, description, body). Without a view yet, says so plainly. */
export function connectionsPage(v = VIEW, o = '', page = (_p, _o, t, _d, b) => `<h1>${t}</h1>${b}`, { q = '', hits = null } = {}) {
  const form = `<form class="facets" action="/connections" method="get" role="search" aria-label="Find related"><div><label for="cq">Find what relates to</label><input id="cq" type="search" name="q" value="${esc(q)}" maxlength="200" autocomplete="off" placeholder="for example: dirty water in schools"></div><button type="submit">Find</button></form>`;
  const crumbs = ui.breadcrumbs([{ label: 'Home', href: '/' }, { label: 'Connections' }]);
  const lede = '<p class="lede">Every problem and solution on this site sits in one knowledge graph, and every one has a vector that captures what it means. Each day a loop reads the whole graph, looks for connections nobody has drawn, drops the ones the catalogue already knows, and later checks whether the catalogue adopted them. These are leads for people and for the site’s own loops, not findings.</p>';
  if (!v || !v.stats) return page('/connections', o, 'Connections', 'Connections between problems and solutions that nobody has drawn yet.', `${crumbs}<h1>Connections</h1>${lede}${form}${relatedBlock(q, hits)}${ui.callout({ tone: 'info', title: 'Waiting for the first run', body: '<p>The graph is built by the daily connections run. Its first run has not finished yet; this page fills in by itself when it does.</p>' })}`);
  const T = v.totals || {};
  const stats = ui.stats([
    { value: v.stats.nodes, label: 'items in the graph' }, { value: v.stats.known_edges, label: 'known links' }, { value: v.stats.semantic_links, label: 'links by meaning' },
    { value: v.stats.communities, label: 'clusters' }, { value: T.open ?? 0, label: 'open leads' }, { value: T.confirmed ?? 0, label: 'adopted later' },
  ]);
  const sections = TYPES.map(([t, title, note]) => (v[t] || []).length ? ui.section({ id: t, title, body: `<p>${esc(note)}</p>${ui.cardGrid(v[t].map(card))}` }) : '').join('');
  const confirmed = (v.confirmed || []).length ? ui.section({ id: 'adopted', title: 'Leads the catalogue later adopted', body: ui.cardGrid(v.confirmed.map(card)) }) : '';
  const clusters = (v.communities || []).length ? ui.section({ id: 'clusters', title: 'Largest clusters', body: ui.list(v.communities.map(c => `${c.size} items, such as ${c.sample.map(s => s.url ? `<a href="${esc(s.url)}">${esc(s.label)}</a>` : esc(s.label)).join(', ')}`)) }) : '';
  const runs = (v.runs || []).slice(-10).reverse();
  const loop = ui.section({ id: 'loop', title: 'How the loop scores and tunes itself', body: `<p>A lead counts as adopted when the catalogue later links its two items, or combines them; a lead that stops ranking for three runs is dropped, with that reason. Of the leads settled so far, <b>${T.hit_rate == null ? 'none yet' : pct(T.hit_rate)}</b> were adopted. The share of links that count as alike is tuned one step at a time, and each change carries a prediction the next run checks.</p>`
    + ui.table({ caption: 'Recent runs', head: ['Run', 'Threshold', 'Leads', 'New', 'Adopted', 'Dropped'], rows: runs.map(r => [esc(day(r.at)), esc(r.tau), esc(r.candidates), esc(r.new), esc(r.confirmed), esc(r.dropped)]) })
    + ((v.decisions || []).length ? ui.list(v.decisions.slice(-5).reverse().map(d => `${esc(day(d.at))}: ${esc(d.knob)} ${esc(d.from)} → ${esc(d.to)} because ${esc(d.why)}; predicted ${esc(d.prediction)}${d.kept == null ? ' (not scored yet)' : d.kept ? ' (held)' : ' (missed)'}`)) : '') });
  const foot = `<p class="m">Last run ${esc(day(v.at))}, embeddings ${esc(v.model)}. <a href="/connections.json">All as JSON</a> · <a href="/ask">Ask a question</a> · <a href="/method">Method</a></p>`;
  return page('/connections', o, 'Connections', 'Connections between problems and solutions that nobody has drawn yet, found by a knowledge graph and vector search that run every day.', `${crumbs}<h1>Connections</h1>${lede}${form}${relatedBlock(q, hits)}${stats}${sections}${confirmed}${clusters}${loop}${foot}`);
}

export function connectionsJson(v = VIEW, o = '') {
  const abs = x => (x && x.url ? { ...x, url: o + x.url } : x);
  const fix = c => ({ ...c, members: c.members.map(abs), via: abs(c.via) });
  if (!v || !v.stats) return { schema: 'ps-connections-view/1', status: 'waiting for the first run' };
  return { schema: 'ps-connections-view/1', at: v.at, model: v.model, threshold: v.tau, stats: v.stats, totals: v.totals,
    transfer: v.transfer.map(fix), combination: v.combination.map(fix), bridge: v.bridge.map(fix), frontier: v.frontier.map(fix), confirmed: (v.confirmed || []).map(fix),
    communities: v.communities, runs: v.runs, decisions: v.decisions, note: 'Leads found by code from a knowledge graph and vector index; not evidence. A lead is confirmed when the catalogue later adopts it.' };
}

/** /connections and /connections.json, or null. Meaning search reuses the /ask rate limit. */
export async function connectionsRoute(u, env, { origin, page, headers = {}, allowFn = null }) {
  if (u.pathname === '/connections.json') return Response.json(connectionsJson(VIEW, origin), { headers: { 'cache-control': 'public, max-age=300' } });
  if (u.pathname !== '/connections') return null;
  const q = (u.searchParams.get('q') || '').replace(/\s+/g, ' ').trim().slice(0, 200);
  let hits = null;
  if (q) {
    try {
      const ok = allowFn ? await allowFn() : true, sem = ok && semanticFor(env);
      if (sem) { const docs = new Map(ASK_INDEX.docs.map(d => [d.id, d])); hits = (await sem(q)).filter(h => h.score >= 0.55).map(h => ({ ...docs.get(h.id), score: h.score })).filter(h => h.url); }
    } catch { hits = null; }
  }
  return new Response(connectionsPage(VIEW, origin, page, { q, hits }), { headers: { ...headers, 'content-type': 'text/html; charset=utf-8', 'cache-control': q ? 'no-store' : 'public, max-age=600' } });
}
