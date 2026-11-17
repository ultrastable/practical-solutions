// SPDX-License-Identifier: LicenseRef-Ultrastable-USL-1.0
// Copyright (c) 2026 Rowan Brad Quni-Gudzinas. Non-commercial use free; commercial use requires a license. See LICENSE.
// The encyclopedia's routes. Server-rendered HTML, no executable script, every page reachable by a plain link. Every entry shows its
// label, sources and limits. Templates are in pages.js and are built only from core/ui components (kit/).
import * as ui from './kit/index.js';
import { LABELS, DESIGN, RULE, search, searchIndex } from './catalog.js';
import { SECURITY_HEADERS } from './kit/index.js';
import * as P from './pages.js';
import { AUDIENCES, audience } from './audiences.js';

const { esc } = ui;
export const HEADERS = { ...SECURITY_HEADERS, 'cache-control': 'public, max-age=300' };
export const legend = P.legend;
const SITE_PATHS = ['/', '/problems', '/solutions', '/domains', '/for', '/compare', '/leads', '/method', '/impact', '/changes', '/api'];

const solutionJson = (s, c, o) => ({ id: s.id, title: s.title, claim: s.claim, label: s.label, implementability: s.impl, design: s.design, verdict: s.verdict, problems: s.problem_ids, domains: s.domains, verified: s.verified,
  works_where: s.works_where, takes: s.takes, who: s.who, first_test: s.first_test, limits: s.limits, sources: s.links.map(l => ({ cite: l.cite, finding: l.finding, links: [...l.direct.map(d => d.url), l.search] })), url: o + '/solutions/' + s.id, cite: P.citation(s.title, '/solutions/' + s.id, o) });
const problemJson = (p, c, o) => ({ id: p.id, title: p.title, domain: p.domain, indicator: p.ind, value: p.value ?? null, year: p.year ?? null, target: p.target ?? null, target_source: p.target_src, shortfall: p.shortfall ?? null, rank: p.rank ?? null,
  solutions: (c.byProblem[p.id] || []).map(s => s.id), url: o + '/problems/' + p.id });

export function sitemap(c, origin) {
  const urls = [...SITE_PATHS, ...AUDIENCES.map(a => '/for/' + a.id), ...c.probs.map(p => '/problems/' + p.id), ...c.sols.map(s => '/solutions/' + s.id), ...c.domains.map(d => '/domains/' + d.slug)];
  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map(u => `<url><loc>${esc(origin + u)}</loc></url>`).join('')}</urlset>`;
}

export function indexJson(c, origin) {
  return { generated: new Date().toISOString(), origin, labels: LABELS, problems: c.probs.map(p => problemJson(p, c, origin)), solutions: c.sols.map(s => solutionJson(s, c, origin)), domains: c.domains.map(d => ({ name: d.name, slug: d.slug, url: origin + '/domains/' + d.slug })) };
}

const csvCell = v => { const s = String(v ?? ''); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
export function solutionsCsv(c, o) {
  const head = ['id', 'title', 'domains', 'label', 'design', 'implementability_score', 'band', 'cost', 'adoption', 'delivery_channel', 'url'];
  return [head, ...c.sols.map(s => [s.id, s.title, s.domains.join('; '), s.label, s.design, s.impl ? s.impl.score : '', s.impl ? s.impl.band : '', s.impl ? s.impl.cost : '', s.impl ? s.impl.adoption : '', s.impl ? s.impl.channel || '' : '', o + '/solutions/' + s.id])].map(r => r.map(csvCell).join(',')).join('\n') + '\n';
}

export function llmsTxt(c, o) {
  return `# Practical Solutions\n\n> An evidence-based encyclopedia of practical solutions to pressing problems. ${c.sols.length} solutions, ${c.probs.length} problems, ${c.domains.length} domains. Each solution carries an evidence label, sources, implementability and limits. Keep the label and limits when quoting.\n\n## Data\n- [Whole catalogue](${o}/index.json)\n- [Solutions as CSV](${o}/solutions.csv)\n- [Solution entry](${o}/solutions/{id}.json)\n- [Problem entry](${o}/problems/{id}.json)\n- [Changes feed](${o}/feed.json)\n\n## Pages\n- [Method](${o}/method)\n- [Data and API](${o}/api)\n\n## Solutions\n${c.sols.map(s => `- [${s.title}](${o}/solutions/${s.id}): ${s.label}; ${s.impl ? s.impl.band : 'not scored'}`).join('\n')}\n`;
}

function leadsPage(c, o) {
  const withLeads = c.probs.filter(p => { const L = c.leads[p.id]; return L.drafts.length || L.candidates.length || L.spots.length; });
  const body = `${ui.breadcrumbs([{ label: 'Home', href: '/' }, { label: 'Leads' }])}<h1>Leads</h1>${ui.callout({ tone: 'warn', title: 'Not findings', body: '<p>Everything here was found by the automated loop. Each is a place to look. A lead becomes a solution entry only when a source with a study design is cited and checked.</p>' })}
${ui.list(withLeads.map(p => { const L = c.leads[p.id]; return `<a href="/problems/${esc(p.id)}">${esc(p.title)}</a> <span class="m">${L.drafts.length} reviewed quote(s), ${L.candidates.length} review(s) found, ${L.spots.length} bright spot(s)</span>`; })) || ''}${withLeads.length ? '' : '<p>The loop has not found any yet.</p>'}`;
  return page('/leads', o, 'Leads', 'What the loop found and has not yet turned into an entry.', body);
}
const page = (path, o, title, description, body, extra = {}) => ui.renderPage(P.SHELL, { path, title: `${title} | ${P.SITE}`, description, body, ...extra }, o);

function changesPage(c, o) {
  const body = `${ui.breadcrumbs([{ label: 'Home', href: '/' }, { label: 'Changes' }])}<h1>Changes</h1><p class="lede">Every change the loop made, newest first. <a href="/feed.xml">RSS</a> · <a href="/feed.json">JSON Feed</a></p>
${ui.list(c.changes.map(x => `${esc(String(x.kind).replace(/_/g, ' '))}: ${esc(x.id || x.title || x.problem || '')} <span class="m">${esc(String(x.at).slice(0, 16).replace('T', ' '))}</span>`)) || ''}${c.changes.length ? '' : '<p>No changes yet.</p>'}`;
  return page('/changes', o, 'Changes', 'Every automatic change.', body);
}

function impactPage(c, o) {
  const r = c.reach || { views: 0, sections: {}, referrers: {}, kinds: {}, countries: {} }, ready = c.sols.filter(s => s.impl && s.impl.score >= 7), held = c.sols.filter(s => s.impl && !s.impl.practical);
  const covered = c.probs.filter(p => (c.byProblem[p.id] || []).some(s => s.impl && s.impl.practical)), top = x => ui.list(Object.entries(x).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, n]) => `${esc(k)}: ${n}`)) || '';
  const body = `${ui.breadcrumbs([{ label: 'Home', href: '/' }, { label: 'Impact and reach' }])}<h1>Impact and reach</h1><p class="lede">Information is useless without implementation, so the site measures two things in public: whether it is being found, and whether what it lists can actually be done.</p>
${ui.stats([{ value: ready.length, label: `of ${c.sols.length} solutions ready to implement` }, { value: covered.length, label: `of ${c.probs.length} problems have a practical solution` }, { value: held.length, label: 'held back as not yet practical' }, { value: r.views, label: 'page views, last 30 days' }])}
${ui.section({ id: 'implementability', title: 'Implementability', body: `<p>${esc(RULE)}</p>` })}
${ui.section({ id: 'reach', title: 'Reach', body: `<p class="m">Counts are aggregate and approximate; no IP address or cookie is kept.</p><div class="cols2g">${ui.box('Sections', top(r.sections))}${ui.box('Who links here', top(r.referrers))}${ui.box('People and agents', top(r.kinds))}${ui.box('Countries', top(r.countries))}</div>` })}
${ui.section({ id: 'reported', title: 'Implementations reported', body: '<p>None yet. This is the number that matters most; it will be filled from reports by the organisations that act on an entry. <a href="/metrics.json">Raw counters</a></p>' })}`;
  return page('/impact', o, 'Impact and reach', 'How many people read this, who links to it, and how much of it is implementable.', body);
}

function methodPage(c, o) {
  const repo = 'https://github.com/QNFO/practical-solutions/blob/main/worker/src/';
  const body = `${ui.breadcrumbs([{ label: 'Home', href: '/' }, { label: 'Method' }])}<h1>Method</h1><p class="lede">This page describes exactly how the site is made. Nothing here is hidden behind a model: where a model is used it is named, and today the loop uses none.</p>
${ui.section({ id: 'problems', title: '1. How problems are chosen', body: `<p>A problem is on the list when a public global indicator (World Bank open data, world aggregate) sits away from an international target (SDG, WHO, World Bank). The score is the shortfall to target, between 0 and 1; the ranking is computed by code on every refresh, not edited by hand. The list of indicators is code in <a href="${repo}problems.js">problems.js</a>; adding one is a pull request. Limits: it ranks gap, not deaths or years of life lost, and ignores how solvable a problem is. A problem whose indicator has no usable data is still shown, marked as unranked.</p>` })}
${ui.section({ id: 'solutions', title: '2. How solutions get in', body: `<p>An entry is added only with a citation to a study, the study's own figures, where it was tested, what it takes, who can act, a cheapest first test, and its limits. Entries are written in <a href="${repo}solutions.js">code</a>, so every addition is reviewed and recorded in version history. The automated loop proposes leads; it does not promote a lead to an entry on its own.</p>` })}
${ui.section({ id: 'labels', title: '3. Labels and evidence grading', body: `<ul class="list">${Object.entries(DESIGN).map(([, v]) => `<li><b>${esc(v.name)}</b>: ${esc(v.note)}</li>`).join('')}</ul>${P.legend()}<p>The label comes from the strongest design the entry cites and from whether its sources agree. It is a transparent rule, not a judgement of quality: a trial can still be small, and one setting may not transfer.</p>` })}
${ui.section({ id: 'checks', title: '4. How sources are checked', body: `<p>Every day the loop searches Europe PMC for the cited paper and confirms that the quoted numbers appear in its abstract. When it finds the paper it records the DOI and PubMed ID, and the entry links to them. Results are shown on the entry as verified, mismatch or not found; a mismatch is shown, never hidden.</p>` })}
${ui.section({ id: 'impl', title: '5. How implementable is it', body: `<p>Information is only useful once somebody acts on it, so every solution is also scored for implementability from four facts shown on its page. ${esc(RULE)} Facts and scoring are in <a href="${repo}implementability.js">code</a>.</p>` })}
${ui.section({ id: 'loop', title: '6. How the loop iterates', body: '<ol><li>Refresh the problem ranking from World Bank data (every 6 hours).</li><li>Re-check the stalest solution citations.</li><li>For each problem without a solution, and for the top-ranked problems, search for recent Cochrane systematic reviews on mortality and survival.</li><li>Find bright spots: countries doing better than their income predicts in two separate periods. Leads only.</li><li>Quote results sentences from reviews, unchanged, and have a separate step confirm every quote and number against the abstract.</li><li>Record every change in the public <a href="/changes">changelog</a> and <a href="/feed.xml">feed</a>.</li></ol>' })}
${ui.section({ id: 'not', title: '7. What it will not do', body: `<p>It does not present a lead as a finding, paraphrase a result into a stronger claim, or hide a failed check. Corrections: every entry has a <b>Report an error</b> link.</p>` })}
${ui.section({ id: 'a11y', title: '8. Accessibility and speed', body: '<p>The site works without JavaScript, targets WCAG 2.2 AA, and is tested for contrast, structure, links and size on every change. Report anything that does not work for you using the correction link on the page.</p>' })}`;
  return page('/method', o, 'Method', 'How problems are chosen, how solutions are found and graded, and how the loop runs.', body);
}

const h = (b, s = 200) => new Response(b, { status: s, headers: HEADERS });
const json = (o, s = 200) => Response.json(o, { status: s, headers: { 'cache-control': 'public, max-age=300' } });

// Returns a Response or null when the path is not an encyclopedia page.
export function route(u, c) {
  const o = u.origin, p = u.pathname.replace(/\/$/, '') || '/';
  const table = { '/': () => P.home(c, o), '/problems': () => P.problemsIndex(c, u, o), '/solutions': () => P.solutionsIndex(c, u, o), '/domains': () => P.domainsIndex(c, o), '/for': () => P.forIndex(c, o), '/compare': () => P.comparePage(c, u, o),
    '/leads': () => leadsPage(c, o), '/impact': () => impactPage(c, o), '/changes': () => changesPage(c, o), '/method': () => methodPage(c, o), '/api': () => P.apiPage(c, o), '/search': () => P.searchPage(c, u, o) };
  if (table[p]) return h(table[p]());
  if (p === '/search.json') return json({ q: u.searchParams.get('q') || '', results: search(searchIndex(c), u.searchParams.get('q')) });
  if (p === '/index.json') return json(indexJson(c, o));
  if (p === '/solutions.csv') return new Response(solutionsCsv(c, o), { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': 'inline; filename="solutions.csv"', 'cache-control': 'public, max-age=300' } });
  if (p === '/llms.txt') return new Response(llmsTxt(c, o), { headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'public, max-age=300' } });
  if (p === '/sitemap.xml') return new Response(sitemap(c, o), { headers: { 'content-type': 'application/xml' } });
  if (p === '/robots.txt') return new Response(`User-agent: *\nAllow: /\nSitemap: ${o}/sitemap.xml\n`, { headers: { 'content-type': 'text/plain' } });
  let m;
  const nf = () => h(P.notFound(c, o, p), 404), nfj = () => json({ error: 'not found' }, 404);
  if ((m = /^\/problems\/([a-z0-9-]+)(\.json)?$/.exec(p))) { const x = c.probs.find(y => y.id === m[1]); return m[2] ? (x ? json(problemJson(x, c, o)) : nfj()) : x ? h(P.problemPage(x, c, o)) : nf(); }
  if ((m = /^\/solutions\/([a-z0-9-]+)(\.json)?$/.exec(p))) { const x = c.sols.find(y => y.id === m[1]); return m[2] ? (x ? json(solutionJson(x, c, o)) : nfj()) : x ? h(P.solutionPage(x, c, o)) : nf(); }
  if ((m = /^\/domains\/([a-z0-9-]+)$/.exec(p))) { const x = c.domains.find(y => y.slug === m[1]); return x ? h(P.domainPage(x, c, o)) : nf(); }
  if ((m = /^\/for\/([a-z0-9-]+)$/.exec(p))) { const a = audience(m[1]); return a ? h(P.forPage(a, c, o)) : nf(); }
  return null;
}
export const notFoundResponse = (c, u) => h(P.notFound(c, u.origin, u.pathname), 404);
export { P as pages };
