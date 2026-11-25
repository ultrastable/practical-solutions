// SPDX-License-Identifier: LicenseRef-Ultrastable-USL-1.0
// Copyright (c) 2026 Rowan Brad Quni-Gudzinas. Non-commercial use free; commercial use requires a license. See LICENSE.
// The encyclopedia's routes. Server-rendered HTML, no executable script, every page reachable by a plain link. Every entry shows its
// label, sources and limits. Templates are in pages.js and are built only from core/ui components (kit/).
import * as ui from './kit/index.js';
import { LABELS, DESIGN, RULE, search, searchIndex } from './catalog.js';
import { methodSection } from './bca.js';
import { ENSEMBLE_LEDGER } from './ensemble-ledger.gen.js';
import { statement, region, live, describe } from '../../vendor/ultrastable/core/statements/index.js';
import { STATEMENTS, CTX } from './method-claims.js';
import { claimsJson, manifestJson } from './contract.js';  // FLEET-CONTRACT-1
import * as U from './unknowns.js';
import * as PL from './pipeline.js';
import { SECURITY_HEADERS } from './kit/index.js';
import * as P from './pages.js';
import { AUDIENCES, audience } from './audiences.js';
import * as CP from './country-pages.js';
import { LEVELS } from './context.js';
import * as SY from './syntheses-pages.js';
import { RELEASES } from './releases.gen.js';
import * as CAT from './catalogue-pages.js';
import { SCAN } from './problem-scan.gen.js';
import { askPage } from './ask.js';
import { graphPage, linksJson } from './links.js';  // LINKS-1
import { connectionsPage, connectionsJson } from './connections.js';  // DISCOVER-1
import * as X from './export.js';
import { autonomyPage, autonomyData } from './autonomy.js';  // AUTONOMY-1
import * as V from './views.js';
import { levelName } from './context.js';
import { INFRA, solutionsFor } from './countries.js';
import { changeBody, changeJson } from './behaviour.js';  // BEHAVIOUR-1

const { esc } = ui;
export const HEADERS = { ...SECURITY_HEADERS, 'cache-control': 'public, max-age=300' };
export const legend = P.legend;
const SITE_PATHS = ['/', '/ask', '/problems', '/catalogue', '/solutions', '/syntheses', '/connections', '/graph', '/evidence-map', '/ranking', '/glossary', '/accessibility', '/country/compare', '/domains', '/for', '/context', '/country', '/compare', '/leads', '/method', '/change', '/unknowns', '/pipeline', '/impact', '/changes', '/autonomy', '/releases', '/api', '/about', '/privacy'];

const solutionJson = (s, c, o) => ({ id: s.id, title: s.title, claim: s.claim, label: s.label, implementability: s.impl, design: s.design, verdict: s.verdict, problems: s.problem_ids, domains: s.domains, verified: s.verified,
  works_where: s.works_where, takes: s.takes, who: s.who, first_test: s.first_test, limits: s.limits, sources: s.links.map(l => ({ cite: l.cite, finding: l.finding, links: [...l.direct.map(d => d.url), l.search] })), url: o + '/solutions/' + s.id, cite: P.citation(s.title, '/solutions/' + s.id, o) });
const problemJson = (p, c, o) => ({ id: p.id, title: p.title, domain: p.domain, indicator: p.ind, value: p.value ?? null, year: p.year ?? null, target: p.target ?? null, target_source: p.target_src, shortfall: p.shortfall ?? null, rank: p.rank ?? null,
  solutions: (c.byProblem[p.id] || []).map(s => s.id), url: o + '/problems/' + p.id });

export function sitemapPaths(c) {
  return [...SITE_PATHS, ...SY.published().map(x => '/syntheses/' + x.id), ...AUDIENCES.map(a => '/for/' + a.id), ...c.probs.map(p => '/problems/' + p.id), ...SCAN.entries.map(e => '/catalogue/' + e.id), ...c.sols.map(s => '/solutions/' + s.id), ...c.domains.map(d => '/domains/' + d.slug), ...LEVELS.map(l => '/levels/' + l.id), ...Object.keys((c.context || {}).countries || {}).map(i => '/country/' + i)];
}
export function sitemap(c, origin) {
  const urls = sitemapPaths(c);
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

export function problemsCsv(c, o) {
  const head = ['id', 'title', 'domain', 'indicator', 'value', 'year', 'target', 'gap_share', 'rank', 'solutions_listed', 'url'];
  return [head, ...c.probs.map(p => [p.id, p.title, p.domain, p.ind, p.value ?? '', p.year ?? '', p.target ?? '', p.ranked ? p.shortfall : '', p.rank ?? '', (c.byProblem[p.id] || []).length, o + '/problems/' + p.id])].map(r => r.map(csvCell).join(',')).join('\n') + '\n';
}

export function llmsTxt(c, o) {
  return `# Practical Solutions\n\n> An evidence-based encyclopedia of practical solutions to pressing problems. ${c.sols.length} solutions, ${c.probs.length} problems, ${c.domains.length} domains. Each solution carries an evidence label, sources, implementability and limits. Keep the label and limits when quoting.\n\n## Data\n- [Whole catalogue](${o}/index.json)\n- [Solutions as CSV](${o}/solutions.csv)\n- [Problems as CSV](${o}/problems.csv)\n- [Catalogue as CSV](${o}/catalogue.csv)\n- [OpenAPI description](${o}/openapi.json)\n- [Citation formats](${o}/solutions/{id}.bib, .ris, .csl.json)\n- [Solution entry](${o}/solutions/{id}.json)\n- [Problem entry](${o}/problems/{id}.json)\n- [Changes feed](${o}/feed.json)\n\n## Pages\n- [Method](${o}/method)\n- [Data and API](${o}/api)\n\n## Solutions\n${c.sols.map(s => `- [${s.title}](${o}/solutions/${s.id}): ${s.label}; ${s.impl ? s.impl.band : 'not scored'}`).join('\n')}\n`;
}

function leadsPage(c, o) {
  const withLeads = c.probs.filter(p => { const L = c.leads[p.id]; return L.drafts.length || L.candidates.length || L.spots.length; });
  const body = `${ui.breadcrumbs([{ label: 'Home', href: '/' }, { label: 'Leads' }])}<h1>Leads</h1>${ui.callout({ tone: 'warn', title: 'Not findings', body: '<p>Everything here was found by the automated loop. Each is a place to look. A lead becomes a solution entry only when a source with a study design is cited and checked.</p>' })}
${ui.list(withLeads.map(p => { const L = c.leads[p.id]; return `<a href="/problems/${esc(p.id)}">${esc(p.title)}</a> <span class="m">${L.drafts.length} reviewed quote(s), ${L.candidates.length} review(s) found, ${L.spots.length} bright spot(s)</span>`; })) || ''}${withLeads.length ? '' : '<p>The loop has not found any yet.</p>'}`;
  return page('/leads', o, 'Leads', 'What the loop found and has not yet turned into an entry.', body);
}
const page = (path, o, title, description, body, extra = {}) => ui.renderPage(P.SHELL, { path, title: `${title} | ${P.SITE}`, description, body, ...extra }, o);
export const sitePage = page;  // DISCOVER-1: /connections renders in the same shell

// PROGRESS-1: a returning reader picks how far back to look (a day, a week, a month). The page runs no script and stores nothing about the
// reader; the counts are of the loop's recorded changes, nothing else.
const SINCE = { day: ['the last 24 hours', 24], week: ['the last 7 days', 168], month: ['the last 30 days', 720] };
function changesPage(c, o, u, now = Date.now()) {
  const n = P.changeCounts(c, now), since = u && SINCE[u.searchParams.get('since')] ? u.searchParams.get('since') : null;
  const shown = since ? c.changes.filter(x => { const t = Date.parse(x.at); return !isNaN(t) && now - t <= SINCE[since][1] * 3600e3; }) : c.changes;
  const tab = (k, label) => k === since ? `<b>${label}</b>` : `<a href="/changes${k ? '?since=' + k : ''}">${label}</a>`;
  const body = `${ui.breadcrumbs([{ label: 'Home', href: '/' }, { label: 'Changes' }])}<h1>Changes</h1><p class="lede">Every change the loop made, newest first. <a href="/feed.xml">RSS</a> · <a href="/feed.json">JSON Feed</a> · <a href="/releases">Releases</a></p>
<p>Show: ${tab(null, 'all')} · ${tab('day', `last 24 hours (${n.day})`)} · ${tab('week', `last 7 days (${n.week})`)} · ${tab('month', `last 30 days (${n.month})`)}</p>
${ui.list(shown.map(x => `${esc(String(x.kind).replace(/_/g, ' '))}: ${esc(x.id || x.title || x.problem || '')} <span class="m">${esc(String(x.at).slice(0, 16).replace('T', ' '))}</span>`)) || ''}${shown.length ? '' : `<p>${since ? 'The loop recorded no change in ' + SINCE[since][0] + '.' : 'No changes yet.'}</p>`}`;
  return page('/changes', o, 'Changes', 'Every automatic change.', body);
}

// RELEASE-1: dated releases cut by tools/release.mjs; every number here is read from the generated ledger module.
const REL_KINDS = [['features', 'changes to the site', null], ['problems', 'problems', '/problems/'], ['solutions', 'solutions', '/solutions/'], ['syntheses', 'new combinations', '/syntheses/'], ['insights', 'red-team findings', null]];
export function releasesPage(o, d = RELEASES) {
  const one = r => `<section><h2 id="r-${esc(r.version)}">${esc(r.version)}</h2><p class="m">${esc(r.date)}${r.first ? ' · first release: the whole catalogue as it stood' : ''}</p>${REL_KINDS.map(([k, label, href]) => r.counts[k] ? `<h3>${r.counts[k]} ${k === 'features' ? '' : 'new '}${esc(label)}</h3>${ui.list(r.added[k].map(x => href ? `<a href="${href}${esc(x.id)}">${esc(x.title)}</a>` : esc(x.title))) || ''}${r.counts[k] > r.added[k].length ? `<p class="m">and ${r.counts[k] - r.added[k].length} more in <a href="/releases.json">releases.json</a></p>` : ''}` : '').join('')}</section>`;
  const body = `${ui.breadcrumbs([{ label: 'Home', href: '/' }, { label: 'Releases' }])}<h1>Releases</h1><p class="lede">What is new in each release, newest first. <a href="/releases.atom">Atom feed</a> · <a href="/releases.json">JSON</a> · <a href="/changes">Every change</a></p>
${d.releases.map(one).join('') || '<p>No release yet.</p>'}`;
  return page('/releases', o, 'Releases', 'New problems, solutions, combinations and findings in each release.', body);
}
export function releasesAtom(o, d = RELEASES) {
  const e = r => `<entry><id>${esc(o)}/releases#r-${esc(r.version)}</id><title>Practical Solutions ${esc(r.version)}</title><updated>${esc(r.date)}T00:00:00Z</updated><link href="${esc(o)}/releases#r-${esc(r.version)}"/><summary>${esc(REL_KINDS.filter(([k]) => r.counts[k]).map(([k, label]) => `${r.counts[k]} ${k === 'features' ? '' : 'new '}${label}`).join(', '))}</summary></entry>`;
  return `<?xml version="1.0" encoding="utf-8"?><feed xmlns="http://www.w3.org/2005/Atom"><id>${esc(o)}/releases</id><title>Practical Solutions releases</title><updated>${esc((d.releases[0] || {}).date || '1970-01-01')}T00:00:00Z</updated><link rel="self" href="${esc(o)}/releases.atom"/>${d.releases.map(e).join('')}</feed>`;
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

const METHOD_SECTIONS = [['problems', '1. How problems are chosen'], ['solutions', '2. How solutions get in'], ['labels', '3. Labels and evidence grading'], ['checks', '4. How sources are checked'], ['unknowns', '5b. What we do not know'], ['models', '5c. Models, updates and disagreement'], ['impl', '5. How implementable is it'], ['bca', 'Benefit and cost: one metric for everything'], ['loop', '6. How the loop iterates'], ['not', '7. What it will not do'], ['a11y', '8. Accessibility and speed']];
// /method is built only from the claims registry (method-claims.js): every sentence is a statement bound to a probe of the real behaviour;
// tables and counts are live blocks read from the code. core/statements audits this page in CI and in GET /claims.json.
function methodLive(sec, c) {
  const e = ui.esc, g = c.ign && c.ign.summary;
  if (sec === 'labels') return `<ul class="list">${Object.entries(DESIGN).map(([, v]) => `<li><b>${e(v.name)}</b>: ${e(v.note)}</li>`).join('')}</ul>${P.legend()}`;
  if (sec === 'unknowns') return `<p>${g ? `${g.open} gaps are open and ${g.closed} are closed with a reason.` : 'The first run has not happened yet.'} <a href="/unknowns">Live numbers and the audit questions</a>.</p>`;
  if (sec === 'bca') return methodSection();
  return '';
}
function methodPage(c, o) {
  const S = id => statement(STATEMENTS, id, CTX), by = sec => STATEMENTS.filter(s => s.section === sec).map(s => `<p>${S(s.id)}</p>`).join('');
  const lede = `<p class="lede">${S('model-use')}</p>`;
  const body = `${ui.breadcrumbs([{ label: 'Home', href: '/' }, { label: 'Method' }])}${region(`<h1>Method</h1>${lede}${METHOD_SECTIONS.map(([id, title]) => ui.section({ id, title, body: by(id) + live(methodLive(id, c)) })).join('')}`)}
<p class="m">Every sentence above is a statement in code with a test that runs the behaviour it describes (<a href="/claims.json">${STATEMENTS.length} statements, as JSON</a>).</p>`;
  return page('/method', o, 'Method', 'How problems are chosen, how solutions are found and graded, and how the loop runs.', body);
}

const h = (b, s = 200) => new Response(b, { status: s, headers: HEADERS });
const embedHeaders = () => { const { 'x-frame-options': _x, ...rest } = HEADERS; return { ...rest, 'content-security-policy': X.EMBED_CSP }; };
const text = (b, type) => new Response(b, { headers: { 'content-type': type + '; charset=utf-8', 'cache-control': 'public, max-age=300' } });
const csv = (name, b) => new Response(b, { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `inline; filename="${name}"`, 'cache-control': 'public, max-age=300' } });
const json = (o, s = 200) => Response.json(o, { status: s, headers: { 'cache-control': 'public, max-age=300' } });

// Returns a Response or null when the path is not an encyclopedia page.
export function route(u, c) {
  const o = u.origin, p = u.pathname.replace(/\/$/, '') || '/';
  const table = { '/': () => P.home(c, o), '/problems': () => P.problemsIndex(c, u, o), '/solutions': () => P.solutionsIndex(c, u, o), '/domains': () => P.domainsIndex(c, o), '/for': () => P.forIndex(c, o), '/context': () => P.contextPage(c, o), '/country': () => CP.countryIndex(c, u, o), '/compare': () => P.comparePage(c, u, o),
    '/evidence-map': () => page('/evidence-map', o, 'Evidence map', 'Where evidence is strong, thin or missing, by domain.', V.evidenceMapBody(c)), '/ranking': () => page('/ranking', o, 'Benefit-cost ranking', 'Solutions ranked by benefit per dollar in WELLBYs, with ranges.', V.rankingBody(c, u)),
    '/glossary': () => page('/glossary', o, 'Glossary', 'The terms used on this site, each defined once.', V.glossaryBody(), { jsonld: V.glossaryLd(o) }), '/accessibility': () => page('/accessibility', o, 'Accessibility', 'What is checked automatically and how to report a barrier.', V.accessibilityBody(P.CORRECTIONS_URL)),
    '/country/compare': () => page('/country/compare', o, 'Compare countries', 'Income group, HDI tier, infrastructure and fitting solutions for up to four countries side by side.', V.countryCompareBody(c, u, { levelName, INFRA, solutionsFor }), { noindex: u.searchParams.has('c') }),
    '/leads': () => leadsPage(c, o), '/impact': () => impactPage(c, o), '/changes': () => changesPage(c, o, u), '/method': () => methodPage(c, o), '/change': () => page('/change', o, 'Making change happen', 'Why good evidence is not adopted, what has been tested against it, and a first step for every solution.', changeBody(c)), '/unknowns': () => page('/unknowns', o, 'What we do not know', 'Known unknowns, red-team findings and the new questions generated from them.', U.unknownsBody(c)), '/pipeline': () => page('/pipeline', o, 'Pipeline', 'How problems move through the catalogue and whether anything is moving.', PL.pipelineBody()), '/api': () => P.apiPage(c, o), '/about': () => P.aboutPage(c, o), '/privacy': () => P.privacyPage(c, o), '/search': () => P.searchPage(c, u, o), '/ask': () => askPage('', null, o) };
  if (p === '/connections') return h(connectionsPage(undefined, o, page));  // DISCOVER-1 (a ?q= search is served by the Worker, which has the model)
  if (p === '/connections.json') return json(connectionsJson(undefined, o));
  if (p === '/graph') { const g = graphPage(c, u, o, page); return g ? h(g) : h(P.notFound(c, o, p), 404); }  // LINKS-1
  if (p === '/links.json') return json(linksJson(c, o));
  if (p === '/syntheses') return h(SY.synthesesIndex(o, page));
  if (p === '/syntheses.json') return json(SY.indexJson(o));
  { const sm = /^\/syntheses\/([a-z0-9-]+)(\.json)?$/.exec(p); if (sm) { const x = SY.find(sm[1]); return sm[2] ? (x ? json(SY.synthesisJson(x, o)) : json({ error: 'not found' }, 404)) : x ? h(SY.synthesisPage(x, o, page)) : h(P.notFound(c, o, p), 404); } }
  if (p === '/catalogue') return h(CAT.indexPage(c, u, o, page));
  if (p === '/catalogue.json') return json(CAT.indexJson(c, o));
  { const cm = /^\/catalogue\/([a-z0-9-]+)(\.json)?$/.exec(p); if (cm) { const x = CAT.find(cm[1]); return cm[2] ? (x ? json(CAT.entryJson(x, o)) : json({ error: 'not found' }, 404)) : x ? h(CAT.entryPage(x, c, o, page)) : h(P.notFound(c, o, p), 404); } }
  if (p === '/autonomy') return h(autonomyPage(c, o, page));
  if (p === '/autonomy.json') return json(autonomyData(c));
  if (p === '/releases') return h(releasesPage(o));
  if (p === '/releases.json') return json(RELEASES);
  if (p === '/releases.atom') return new Response(releasesAtom(o), { headers: { 'content-type': 'application/atom+xml; charset=utf-8', 'cache-control': 'public, max-age=300' } });
  if (table[p]) return h(table[p]());
  if (p === '/search.json') return json({ q: u.searchParams.get('q') || '', results: search(searchIndex(c), u.searchParams.get('q')) });
  if (p === '/claims.json') return json(claimsJson(describe(STATEMENTS, CTX)));
  if (p === '/.well-known/ultrastable.json') return json(manifestJson(o));  // FLEET-CONTRACT-1, DISCOVER-1
  if (p === '/ensemble.json') return json(ENSEMBLE_LEDGER);
  if (p === '/change.json') return json(changeJson(c));
  if (p === '/unknowns.json') return json(U.unknownsData(c));
  if (p === '/pipeline.json') return json(PL.pipelineData());
  if (p === '/index.json') return json(indexJson(c, o));
  if (p === '/solutions.csv') return new Response(solutionsCsv(c, o), { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': 'inline; filename="solutions.csv"', 'cache-control': 'public, max-age=300' } });
  if (p === '/llms.txt') return new Response(llmsTxt(c, o), { headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'public, max-age=300' } });
  if (p === '/sitemap.xml' || p === '/sitemap-en.xml') return new Response(sitemap(c, o), { headers: { 'content-type': 'application/xml' } });
  if (p === '/robots.txt') return new Response(`User-agent: *\nAllow: /\nSitemap: ${o}/sitemap.xml\n`, { headers: { 'content-type': 'text/plain' } });
  if (p === '/openapi.json') return json(X.openapi(o));
  if (p === '/datapackage.json') { const hd = t => t.split('\n')[0].split(','); return json(V.datapackage(o, { solutions: hd(solutionsCsv(c, o)), problems: hd(problemsCsv(c, o)), catalogue: hd(CAT.csvText(c, o)) })); }
  if (p === '/problems.csv') return csv('problems.csv', problemsCsv(c, o));
  if (p === '/catalogue.csv') return csv('catalogue.csv', CAT.csvText(c, o));
  if (p === '/oembed') { const um = /\/solutions\/([a-z0-9-]+)\/?$/.exec(new URL(u.searchParams.get('url') || 'https://x/', o).pathname), x = um && c.sols.find(y => y.id === um[1]); return x ? json(X.oembed(x, o)) : json({ error: 'not found' }, 404); }
  { const em = /^\/embed\/solutions\/([a-z0-9-]+)$/.exec(p), x = em && c.sols.find(y => y.id === em[1]); if (em) return x ? new Response(X.embedPage(x, o), { headers: embedHeaders() }) : h(P.notFound(c, o, p), 404); }
  { const cm = /^\/(solutions|problems)\/([a-z0-9-]+)\.(bib|ris|csl\.json)$/.exec(p);
    if (cm) { const kind = cm[1] === 'solutions' ? 'solution' : 'problem', x = (kind === 'solution' ? c.sols : c.probs).find(y => y.id === cm[2]); if (!x) return json({ error: 'not found' }, 404);
      const e = X.entryOf(kind, x); return cm[3] === 'bib' ? text(X.bibtex(e, o), 'application/x-bibtex') : cm[3] === 'ris' ? text(X.ris(e, o), 'application/x-research-info-systems') : json(X.csl(e, o)); } }
  let m;
  const nf = () => h(P.notFound(c, o, p), 404), nfj = () => json({ error: 'not found' }, 404);
  if ((m = /^\/problems\/([a-z0-9-]+)(\.json)?$/.exec(p))) { const x = c.probs.find(y => y.id === m[1]); return m[2] ? (x ? json(problemJson(x, c, o)) : nfj()) : x ? h(P.problemPage(x, c, o)) : nf(); }
  if ((m = /^\/solutions\/([a-z0-9-]+)(\.json)?$/.exec(p))) { const x = c.sols.find(y => y.id === m[1]); return m[2] ? (x ? json(solutionJson(x, c, o)) : nfj()) : x ? h(P.solutionPage(x, c, o)) : nf(); }
  if ((m = /^\/domains\/([a-z0-9-]+)$/.exec(p))) { const x = c.domains.find(y => y.slug === m[1]); return x ? h(P.domainPage(x, c, o)) : nf(); }
  if ((m = /^\/country\/([A-Za-z]{3})(\.json)?$/.exec(p))) { const x = (c.context && c.context.countries || {})[m[1].toUpperCase()]; return m[2] ? (x ? json(CP.countryJson(x, c, o)) : nfj()) : x ? h(CP.countryPage(x, c, o)) : nf(); }
  if ((m = /^\/levels\/([a-z-]+)(\.json)?$/.exec(p))) { const l = LEVELS.find(v => v.id === m[1]); return m[2] ? (l ? json(CP.levelJson(l.id, c, o)) : nfj()) : l ? h(CP.levelPage(l.id, c, o)) : nf(); }
  if ((m = /^\/for\/([a-z0-9-]+)$/.exec(p))) { const a = audience(m[1]); return a ? h(P.forPage(a, c, o)) : nf(); }
  return null;
}
export const notFoundResponse = (c, u) => h(P.notFound(c, u.origin, u.pathname), 404);
export { P as pages };
