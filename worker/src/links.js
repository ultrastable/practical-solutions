// SPDX-License-Identifier: LicenseRef-Ultrastable-USL-1.0
// Copyright (c) 2026 Rowan Brad Quni-Gudzinas. Non-commercial use free; commercial use requires a license. See LICENSE.
// LINKS-1: the connections between entries, shown where people read. Every problem, catalogue entry and solution lists what it is connected to,
// in three kinds that are never mixed: established (the catalogue itself links them: a solution cites evidence against a problem), alike in
// meaning (a vector index finds them close; a lead to read, not evidence) and open leads (the daily discovery run proposes the link and nothing
// has confirmed it). /graph is the same data as a browsable map: domains, then a domain's hubs, then any one entry's neighbourhood.
// The data is generated (links.gen.js, written by tools/connections.mjs every run), so a new entry gets its connections on the next run with no
// edit here. Pages run no script: the maps are numbered inline SVG with the same links repeated as a list.
import * as ui from './kit/index.js';
import { LINKS } from './links.gen.js';
import { slug } from './catalog.js';

const { esc } = ui;
const N = LINKS.nodes;
export const nodeInfo = id => { const n = N[id]; return n ? { id, label: n[0], url: n[1], domain: n[2], kind: id[0] === 's' ? 'solution' : 'problem' } : null; };
const KIND = { solution: 'Solution', problem: 'Problem' };
export const graphHref = id => '/graph?node=' + encodeURIComponent(id);
export const idOfEntity = (kind, id) => (kind === 'solution' ? 's:' : 'p:') + id;

// Edges the catalogue itself holds, read from the catalogue passed in (so they follow the catalogue as it grows).
export function established(id, c) {
  if (!c) return [];
  const own = id.slice(2), out = [];
  if (id[0] === 's') { const s = (c.sols || []).find(x => x.id === own); for (const p of (s && s.problem_ids) || []) if (N['p:' + p]) out.push('p:' + p); }
  else for (const s of c.sols || []) if ((s.problem_ids || []).includes(own)) out.push('s:' + s.id);
  return out;
}
const TYPE_WORDS = { transfer: 'proven elsewhere, never tried here', combination: 'worth combining', bridge: 'alike, in different clusters', frontier: 'nothing in the catalogue comes near' };

/** Everything known about one entry's connections, resolved to labelled nodes. */
export function connectionsOf(id, c) {
  if (!N[id]) return null;
  const est = established(id, c), seen = new Set([id, ...est]);
  const near = (LINKS.near[id] || []).filter(([o]) => !seen.has(o)).map(([o, pct]) => ({ ...nodeInfo(o), pct })).filter(x => x.label);
  const nearIds = new Set(near.map(x => x.id));
  const leads = (LINKS.leads[id] || []).filter(([, o]) => o && !est.includes(o)).map(([type, o, score, via]) => ({ type, other: nodeInfo(o), via: via && nodeInfo(via), score }))
    .filter(l => l.other && !nearIds.has(l.other.id)).slice(0, 6);
  const leadIds = new Set(leads.map(l => l.other.id));
  return { self: nodeInfo(id), established: est.map(nodeInfo).filter(Boolean), near: near.filter(x => !leadIds.has(x.id)), leads };
}
export const degree = (id, c) => { const k = connectionsOf(id, c); return k ? k.established.length + k.near.length + k.leads.length : 0; };

// ---- the map: numbered nodes around the entry; the numbers repeat in the list below, so the text is never small and the links work for everyone
const STYLE = { est: 'stroke:var(--ink);stroke-width:3', near: 'stroke:var(--accent);stroke-width:2;stroke-dasharray:7 5', lead: 'stroke:var(--warn);stroke-width:2;stroke-dasharray:2 5' };
function nodeShape(n, x, y, num, centre) {
  const fill = n.kind === 'solution' ? 'var(--accent)' : 'var(--surface)', ink = n.kind === 'solution' ? 'var(--accent-ink)' : 'var(--ink)';
  const shape = n.kind === 'solution' ? `<rect x="${x - 17}" y="${y - 17}" width="34" height="34" rx="8" style="fill:${fill};stroke:var(--ink);stroke-width:2"/>` : `<circle cx="${x}" cy="${y}" r="18" style="fill:${fill};stroke:var(--ink);stroke-width:2"/>`;
  return `${shape}<text x="${x}" y="${y + 5}" text-anchor="middle" font-size="15" font-weight="700" style="fill:${ink}">${centre ? '●' : num}</text>`;
}
/** items: [{ node, kind: 'est'|'near'|'lead' }] in list order. Returns inline SVG, no script. */
export function mapSvg(self, items, title) {
  const W = 400, H = 400, cx = 200, cy = 200, R = 140, n = items.length || 1;
  const pts = items.map((it, i) => { const a = -Math.PI / 2 + (2 * Math.PI * i) / n; return { it, x: Math.round(cx + R * Math.cos(a)), y: Math.round(cy + R * Math.sin(a)) }; });
  const lines = pts.map(p => `<line x1="${cx}" y1="${cy}" x2="${p.x}" y2="${p.y}" style="${STYLE[p.it.kind]}"/>`).join('');
  const nodes = pts.map((p, i) => `<a href="${esc(graphHref(p.it.node.id))}" aria-label="${esc(`${i + 1}. ${p.it.node.label}`)}">${nodeShape(p.it.node, p.x, p.y, i + 1, false)}</a>`).join('');
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" style="max-width:28rem;display:block;margin:.5rem auto" role="group" aria-label="${esc(title)}"><title>${esc(title)}</title>${lines}${nodes}<g>${nodeShape(self, cx, cy, 0, true)}</g></svg>`;
}
const keyLine = `<p class="m s">Round: a problem. Square: a solution. <b>Solid line</b>: the catalogue links them (a solution cites evidence against a problem). <b>Dashed line</b>: they read alike. <b>Dotted line</b>: an open lead from the daily discovery run. The last two are places to look, not evidence.</p>`;
const itemRow = (it, i) => {
  const n = it.node, why = it.kind === 'est' ? 'linked in the catalogue' : it.kind === 'near' ? `${it.pct}% alike in meaning` : `${TYPE_WORDS[it.type] || it.type}${it.via ? `, through ${esc(it.via.label)}` : ''}`;
  return `<li><b>${i + 1}.</b> ${ui.badge(KIND[n.kind])} ${n.url ? `<a href="${esc(n.url)}">${esc(n.label)}</a>` : esc(n.label)} <span class="m">${n.domain ? esc(n.domain) + ' · ' : ''}${why}</span> · <a href="${esc(graphHref(n.id))}">its connections</a></li>`;
};
export function listOf(k) {
  return [...k.established.map(node => ({ node, kind: 'est' })), ...k.near.map(x => ({ node: x, kind: 'near', pct: x.pct })), ...k.leads.map(l => ({ node: l.other, kind: 'lead', type: l.type, via: l.via }))];
}

/** The block every entry page shows. Empty string when the entry is not in the graph yet (the next run adds it). */
export function connectionsBlock(kind, entityId, c) {
  const k = connectionsOf(idOfEntity(kind, entityId), c); if (!k) return '';
  const items = listOf(k).slice(0, 12); if (!items.length) return '';
  const title = `Connections of ${k.self.label}: ${items.length} linked entries`;
  return `${mapSvg(k.self, items, title)}<ol class="list" style="list-style:none">${items.map(itemRow).join('')}</ol>${keyLine}<p><a href="${esc(graphHref(k.self.id))}">Open this entry in the graph</a> · <a href="/graph">The whole graph</a> · <a href="/connections">All open leads</a></p>`;
}

// ---- /graph ------------------------------------------------------------------------------------------------------------------------------------
let CACHE = null;
function whole() {
  if (CACHE) return CACHE;
  const ids = Object.keys(N), deg = new Map(), dom = new Map(), cross = new Map();
  const bump = (m, k, by = 1) => m.set(k, (m.get(k) || 0) + by);
  for (const id of ids) { bump(dom, N[id][2] || 'Other'); }
  for (const [id, list] of Object.entries(LINKS.near)) for (const [o] of list) { bump(deg, id); bump(deg, o); const a = N[id][2] || 'Other', b = (N[o] || [])[2] || 'Other'; if (a !== b) bump(cross, [a, b].sort().join('|')); }
  for (const [id, list] of Object.entries(LINKS.leads)) for (const [, o] of list) { if (!o) continue; bump(deg, id); const a = N[id][2] || 'Other', b = (N[o] || [])[2] || 'Other'; if (a !== b) bump(cross, [a, b].sort().join('|'), 0.5); }
  return (CACHE = { ids, deg, dom, cross });
}
export function graphStats(c) {
  const w = whole(), est = (c ? c.sols : []).reduce((n, s) => n + (s.problem_ids || []).filter(p => N['p:' + p]).length, 0);
  return { nodes: w.ids.length, solutions: w.ids.filter(i => i[0] === 's').length, problems: w.ids.filter(i => i[0] === 'p').length, domains: w.dom.size, established: est, alike: Object.values(LINKS.near).reduce((n, l) => n + l.length, 0) / 2 | 0, leads: Object.values(LINKS.leads).reduce((n, l) => n + l.length, 0) / 2 | 0 };
}
function domainRing(w) {
  const top = [...w.dom.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([d]) => d), idx = new Map(top.map((d, i) => [d, i])), W = 440, cx = 220, cy = 220, R = 160;
  const pt = d => { const a = -Math.PI / 2 + (2 * Math.PI * idx.get(d)) / top.length; return { x: Math.round(cx + R * Math.cos(a)), y: Math.round(cy + R * Math.sin(a)) }; };
  const pairs = [...w.cross.entries()].map(([k, n]) => [...k.split('|'), n]).filter(([a, b]) => idx.has(a) && idx.has(b)).sort((x, y) => y[2] - x[2]).slice(0, 40);
  const max = Math.max(1, ...pairs.map(p => p[2]));
  const lines = pairs.map(([a, b, n]) => { const p = pt(a), q = pt(b); return `<line x1="${p.x}" y1="${p.y}" x2="${q.x}" y2="${q.y}" style="stroke:var(--accent);opacity:.55;stroke-width:${(1 + (5 * n) / max).toFixed(1)}"/>`; }).join('');
  const nodes = top.map((d, i) => { const p = pt(d); return `<a href="/graph?domain=${encodeURIComponent(slug(d))}" aria-label="${esc(`${i + 1}. ${d}`)}"><circle cx="${p.x}" cy="${p.y}" r="19" style="fill:var(--surface);stroke:var(--ink);stroke-width:2"/><text x="${p.x}" y="${p.y + 5}" text-anchor="middle" font-size="15" font-weight="700" style="fill:var(--ink)">${i + 1}</text></a>`; }).join('');
  return { top, svg: `<svg viewBox="0 0 ${W} ${W}" width="100%" style="max-width:30rem;display:block;margin:.5rem auto" role="group" aria-label="Domains and the links between them"><title>The twelve largest domains and the links between them</title>${lines}${nodes}</svg>`, pairs };
}
const domOf = n => (N[n] || [])[2] || 'Other';
const linkOf = id => { const n = nodeInfo(id); return n ? (n.url ? `<a href="${esc(n.url)}">${esc(n.label)}</a>` : esc(n.label)) : esc(id); };

const pendingNote = c => { const miss = c ? [...c.sols.filter(s => !N['s:' + s.id]), ...c.probs.filter(p => !N['p:' + p.id])].length : 0; return miss ? `<p class="m">${miss} newer ${miss === 1 ? 'entry is' : 'entries are'} not in the graph yet; the next daily run adds ${miss === 1 ? 'it' : 'them'}.</p>` : ''; };
function overview(c, o, page) {
  const w = whole(), R = domainRing(w), S = graphStats(c);
  const hubs = [...w.deg.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
  const body = `${ui.breadcrumbs([{ label: 'Home', href: '/' }, { label: 'Graph' }])}<h1>The knowledge graph</h1><p class="lede">${S.solutions} solutions and ${S.problems} problems across ${S.domains} domains, and how they connect. The links are drawn from what the catalogue cites and from a daily search for entries that read alike. Pick a domain, then an entry, and follow the links hop by hop.</p>
${ui.stats([{ value: S.nodes, label: 'entries in the graph' }, { value: S.established, label: 'links the catalogue cites' }, { value: S.alike, label: 'links by meaning' }, { value: S.leads, label: 'open leads' }])}
${ui.section({ id: 'domains', title: 'Domains and the links between them', body: `${R.svg}<ol class="list" style="list-style:none">${R.top.map((d, i) => `<li><b>${i + 1}.</b> <a href="/graph?domain=${encodeURIComponent(slug(d))}">${esc(d)}</a> <span class="m">${w.dom.get(d)} entries</span></li>`).join('')}</ol><p class="m s">A thicker line means more links between two domains. Links by meaning cross domains where the same need shows up under two names; they are leads, not findings.</p>` })}
${ui.section({ id: 'bridges', title: 'Strongest links between domains', body: ui.list(R.pairs.slice(0, 8).map(([a, b, n]) => `<a href="/graph?domain=${encodeURIComponent(slug(a))}">${esc(a)}</a> and <a href="/graph?domain=${encodeURIComponent(slug(b))}">${esc(b)}</a> <span class="m">${Math.round(n)} links</span>`)) })}
${ui.section({ id: 'hubs', title: 'Most connected entries', body: ui.list(hubs.map(([id, d]) => `${linkOf(id)} <span class="m">${esc(domOf(id))} · ${d} links</span> · <a href="${esc(graphHref(id))}">its connections</a>`)) })}
${pendingNote(c)}<p class="m">Same data as JSON: <a href="/links.json">links.json</a> · <a href="/connections">open leads</a> · <a href="/method">method</a>. Last run ${esc(String(LINKS.at).slice(0, 10))}.</p>`;
  return page('/graph', o, 'Knowledge graph', 'A browsable map of how problems, solutions and domains connect, with every link labelled as cited, alike in meaning, or an open lead.', body);
}

function domainView(c, o, page, d) {
  const w = whole(), ids = w.ids.filter(i => domOf(i) === d), name = d;
  const hubs = ids.map(i => [i, w.deg.get(i) || 0]).sort((a, b) => b[1] - a[1]).slice(0, 12);
  const out = new Map();
  for (const id of ids) for (const [x] of LINKS.near[id] || []) { const e = domOf(x); if (e !== d) out.set(e, [...(out.get(e) || []), [id, x]]); }
  const rows = [...out.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, 10);
  const meta = (c && c.domains || []).find(x => slug(x.name) === slug(d));
  const body = `${ui.breadcrumbs([{ label: 'Home', href: '/' }, { label: 'Graph', href: '/graph' }, { label: name }])}<h1>${esc(name)} in the graph</h1><p class="lede">${ids.length} entries${meta ? `, with a full page at <a href="/domains/${esc(meta.slug)}">${esc(name)}</a>` : ''}. Below: its most connected entries and where it links to other domains.</p>
${ui.section({ id: 'hubs', title: 'Most connected entries', body: ui.list(hubs.map(([id, k]) => `${linkOf(id)} <span class="m">${nodeInfo(id).kind} · ${k} links</span> · <a href="${esc(graphHref(id))}">its connections</a>`)) })}
${ui.section({ id: 'across', title: 'Links to other domains', body: rows.length ? ui.list(rows.map(([e, ps]) => `<a href="/graph?domain=${encodeURIComponent(slug(e))}">${esc(e)}</a> <span class="m">${ps.length} links, for example</span> ${linkOf(ps[0][0])} and ${linkOf(ps[0][1])}`)) : '<p>No links to other domains found yet.</p>' })}`;
  return page('/graph', o, `${name} in the graph`, `How ${name} entries connect to each other and to other domains.`, body, { noindex: true });
}

function nodeView(c, o, page, id) {
  const k = connectionsOf(id, c), items = listOf(k), self = k.self;
  const body = `${ui.breadcrumbs([{ label: 'Home', href: '/' }, { label: 'Graph', href: '/graph' }, ...(self.domain ? [{ label: self.domain, href: '/graph?domain=' + encodeURIComponent(slug(self.domain)) }] : []), { label: self.label }])}<h1>${esc(self.label)}</h1><p>${ui.badge(KIND[self.kind])}${self.domain ? ui.badge(self.domain) : ''}</p><p class="lede">${items.length} connected ${items.length === 1 ? 'entry' : 'entries'}. Pick a number to move to that entry.</p>
${items.length ? mapSvg(self, items.slice(0, 16), `Connections of ${self.label}`) + `<ol class="list" style="list-style:none">${items.slice(0, 16).map(itemRow).join('')}</ol>${keyLine}` : ui.callout({ tone: 'warn', title: 'No connections yet', body: '<p>Nothing is linked to this entry yet. The discovery run adds links as the catalogue grows.</p>' })}
<p>${self.url ? `<a href="${esc(self.url)}">Read the full ${self.kind} entry</a> · ` : ''}<a href="/graph">The whole graph</a></p>`;
  return page('/graph', o, self.label + ' in the graph', `What ${self.label} is connected to, with each link labelled as cited, alike in meaning, or an open lead.`, body, { noindex: true });
}

/** /graph, /graph?domain=, /graph?node= as HTML, or null. `page` is the site's shell. */
export function graphPage(c, u, o, page) {
  const node = u.searchParams.get('node'), dom = u.searchParams.get('domain');
  if (node) return N[node] ? nodeView(c, o, page, node) : null;
  if (dom) { const d = Object.values(N).map(n => n[2]).find(x => slug(x) === dom); return d ? domainView(c, o, page, d) : null; }
  return overview(c, o, page);
}

/** /links.json: the whole graph for people who want to use it. */
export function linksJson(c, o = '') {
  const est = []; for (const s of (c && c.sols) || []) for (const p of s.problem_ids || []) if (N['p:' + p]) est.push({ from: 's:' + s.id, to: 'p:' + p, kind: 'cited' });
  const alike = []; for (const [id, l] of Object.entries(LINKS.near)) for (const [x, pct] of l) if (id < x || !(LINKS.near[x] || []).some(([y]) => y === id)) alike.push({ from: id, to: x, kind: 'alike', similarity: pct / 100 });
  const leads = []; for (const [id, l] of Object.entries(LINKS.leads)) for (const [type, x, score, via] of l) if (x && id < x) leads.push({ from: id, to: x, kind: 'lead', type, via, score: score / 100 });
  return { schema: 'ps-links/1', at: LINKS.at, model: LINKS.model, note: 'cited: the catalogue links them. alike: they read alike (a lead). lead: proposed by the daily discovery run, not confirmed.',
    nodes: Object.entries(N).map(([id, [label, url, domain]]) => ({ id, kind: id[0] === 's' ? 'solution' : 'problem', label, domain, url: url ? o + url : null })), edges: [...est, ...alike, ...leads] };
}
