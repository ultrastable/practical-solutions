// SPDX-License-Identifier: LicenseRef-Ultrastable-USL-1.0
// Copyright (c) 2026 Rowan Brad Quni-Gudzinas. Non-commercial use free; commercial use requires a license. See LICENSE.
// Practical Solutions' templates, built only from core/ui components. A new domain or topic is data (problems.js, solutions.js) and
// appears everywhere with no template change. A new kind of content plugs in with registerSection(); a new page with a route in site.js.
import * as ui from './kit/index.js';
import { LABELS, DESIGN, RULE, openQuestions, search, searchIndex } from './catalog.js';
import { bcaBlock } from './bca.js';
import { FOOTER } from './publish.js';
import { AUDIENCES, audience } from './audiences.js';
import { domainMeta } from './domains-meta.js';
import { STORIES, storiesFor } from '../../ux/stories.js';

const { esc } = ui;
export const SITE = 'Practical Solutions';
export const CORRECTIONS_URL = 'https://github.com/ultrastable/practical-solutions/issues/new';
const PAGE_SIZE = 12;

export const SHELL = {
  brand: { name: SITE, tag: 'Evidence for what works', href: '/' },
  // FAMILY-1: the .org home of the Ultrastable family (public-benefit demos); accent colours come from https://ultrastable.io/family.json tokens.
  theme: { light: { accent: '#b83800' }, dark: { accent: '#ff7f4d' } },
  family: { label: 'Ultrastable for good: public-benefit demos built on Ultrastable', links: [{ label: 'About this project', href: 'https://ultrastable.io/showcase/practical-solutions' }, { label: 'ultrastable.io', href: 'https://ultrastable.io/' }] },
  nav: [{ label: 'Solutions', href: '/solutions', match: /^\/solutions/ }, { label: 'Problems', href: '/problems', match: /^\/problems/ }, { label: 'Domains', href: '/domains', match: /^\/domains/ },
    { label: 'For you', href: '/for', match: /^\/for/ }, { label: 'Method', href: '/method', match: /^\/method/ }, { label: 'Data', href: '/api', match: /^\/api/ }],
  search: { action: '/search', name: 'q', label: 'Search solutions and problems', placeholder: 'Search, for example water' },
  feeds: [{ type: 'application/rss+xml', href: '/feed.xml', title: 'What changed' }],
  footer: {
    columns: [
      { title: 'Explore', links: [{ label: 'Solutions', href: '/solutions' }, { label: 'Problems', href: '/problems' }, { label: 'Domains', href: '/domains' }, { label: 'Compare solutions', href: '/compare' }] },
      { title: 'Who it is for', links: AUDIENCES.map(a => ({ label: a.name, href: '/for/' + a.id })) },
      { title: 'Trust', links: [{ label: 'Method', href: '/method' }, { label: 'Leads (not findings)', href: '/leads' }, { label: 'Changes', href: '/changes' }, { label: 'Impact and reach', href: '/impact' }] },
      { title: 'Ultrastable family', links: [{ label: 'Ultrastable for good (.org)', href: 'https://ultrastable.org/' }, { label: 'Platform and product (.io)', href: 'https://ultrastable.io/' }, { label: 'How it is built', href: 'https://ultrastable.io/how' }, { label: 'Live proof', href: 'https://ultrastable.io/proof' }, { label: 'Contact', href: 'https://ultrastable.io/contact' }] },
      { title: 'Data', links: [{ label: 'Data and API', href: '/api' }, { label: 'index.json', href: '/index.json' }, { label: 'solutions.csv', href: '/solutions.csv' }, { label: 'Feed', href: '/feed.xml' }, { label: 'llms.txt', href: '/llms.txt' }] },
    ],
    note: FOOTER,
  },
};

// Section registry: content modules (for example the knowledge graph) add sections to an entity page without editing its template.
const SECTIONS = { solution: [], problem: [], domain: [] };
export function registerSection(type, sec) { SECTIONS[type] = (SECTIONS[type] || []).filter(s => s.id !== sec.id).concat(sec).sort((a, b) => (a.order ?? 50) - (b.order ?? 50)); }
export const sectionsFor = type => SECTIONS[type] || [];

const labelTone = l => l === 'evidence-backed' ? 'ok' : l === 'mixed evidence' ? 'warn' : 'info';
const labelBadge = l => ui.badge(l, labelTone(l));
const implBadge = i => i ? ui.badge(`${i.band} · ${i.score}/8`, i.score >= 7 ? 'ok' : i.practical ? 'info' : 'warn') : '';
const sUrl = s => '/solutions/' + s.id, pUrl = p => '/problems/' + p.id;
const sLink = s => `<a href="${esc(sUrl(s))}">${esc(s.title)}</a>`, pLink = p => `<a href="${esc(pUrl(p))}">${esc(p.title)}</a>`;
const gapText = p => p.ranked ? `${p.value} ${esc(p.unit)} (${p.year}); target ${p.target} (${esc(p.target_src)})` : 'No usable world figure yet. The loop retries every cycle.';
const gapPct = p => p.ranked ? Math.round(p.shortfall * 100) : 0;
const dMeta = d => domainMeta(d);
const domainOf = (c, name) => c.domains.find(d => d.name === name);
export const solCard = (s, c) => ui.card({ title: s.title, href: sUrl(s), body: s.claim, hue: domainHue(c, s.domains[0]), badges: [labelBadge(s.label), implBadge(s.impl)], meta: s.domains.join(' · ') });
const domainHue = (c, name) => { const d = domainOf(c, name); return d ? dMeta(d).hue : 210; };
const probCard = (p, c) => ui.card({ title: p.title, href: pUrl(p), meta: p.domain, body: p.ranked ? `${gapPct(p)}% gap to target. ${(c.byProblem[p.id] || []).length} solution(s) listed.` : 'Not yet ranked.', hue: domainHue(c, p.domain) });

const render = (path, o, page) => ui.renderPage(SHELL, { path, ...page }, o);
const crumbs = (...items) => ui.breadcrumbs(items);

// ---------------------------------------------------------------- shared pieces
export function legend() {
  return ui.box('How to read the labels', `<ul class="list">${Object.entries(LABELS).map(([k, v]) => `<li>${ui.badge(k, labelTone(k))} ${esc(v)}</li>`).join('')}</ul>`);
}
const implBlock = s => !s.impl ? '' : ui.summaryList([['Verdict', `${implBadge(s.impl)}`], ['Cost to start', `<b>${esc(s.impl.cost)}</b>. ${esc(s.impl.cost_note)}.`], ['Real-world adoption', `<b>${esc(s.impl.adoption)}</b>`],
  ['Delivery channel', s.impl.channel ? esc(s.impl.channel) : '<b>none identified</b>'], ['Holds remit and money', esc(s.impl.actors)]]) + `<p class="m s">${esc(RULE)}</p>`;

export function citation(title, path, o) { return `Practical Solutions. "${title}". ${o}${path}. Accessed ${new Date().toISOString().slice(0, 10)}.`; }
const correctionHref = (what, path) => `${CORRECTIONS_URL}?title=${encodeURIComponent('Correction: ' + what)}&body=${encodeURIComponent('Page: ' + path + '\n\nWhat is wrong, and the source that shows it:\n')}`;

// ---------------------------------------------------------------- entity pages
registerSection('solution', { id: 'works', title: 'Where it works', order: 10, render: s => `<p>${esc(s.works_where)}</p>` });
registerSection('solution', { id: 'takes', title: 'What it takes', order: 20, render: s => `<p>${esc(s.takes)}</p><p><b>Who can act:</b> ${esc(s.who)}</p>` });
registerSection('solution', { id: 'first-test', title: 'Cheapest first test', order: 30, render: s => `<p>${esc(s.first_test)}</p>` });
registerSection('solution', { id: 'implementable', title: 'Can it be implemented?', order: 40, render: s => implBlock(s) });
registerSection('solution', { id: 'bca', title: 'Benefit and cost, in WELLBYs', order: 45, render: s => bcaBlock(s.bca) });
registerSection('solution', { id: 'evidence', title: 'Evidence and sources', order: 50, render: (s, c) => {
  const dz = DESIGN[s.design];
  return `<p>${esc(dz.name)}: ${esc(dz.note)}</p><ul class="list">${s.links.map(l => `<li><b>${esc(l.cite)}</b><br>${esc(l.finding)}<br>${l.direct.map(d => `<a href="${esc(d.url)}">${esc(d.label)}</a> `).join('')}<a href="${esc(l.search)}">Find this paper on Europe PMC</a></li>`).join('')}</ul>
<p class="m">Verification: ${esc(s.verified)}${s.checkable ? ' The loop re-checks the quoted numbers against the paper abstract every day.' : ' No automatic check is defined for this entry yet, so the figures are the source\'s own, unconfirmed here.'}</p>`; } });
registerSection('solution', { id: 'limits', title: 'Limits', order: 60, render: s => `<p>${esc(s.limits)}</p>` });
registerSection('solution', { id: 'related', title: 'See also', order: 70, render: (s, c) => { const r = c.related(s); return r.length ? ui.cardGrid(r.map(x => solCard(x, c))) : ''; } });
registerSection('solution', { id: 'use', title: 'Use and cite this entry', order: 90, render: (s, c, o) => `<p>Permanent link: <a href="${esc(sUrl(s))}">${esc(o + sUrl(s))}</a></p>${ui.cite(citation(s.title, sUrl(s), o))}
<p><a href="${esc(sUrl(s))}.json">This entry as JSON</a> · <a href="/compare?ids=${esc(s.id)}">Compare with others</a> · <a href="${esc(correctionHref(s.title, sUrl(s)))}">Report an error or suggest a correction</a></p>` });

registerSection('problem', { id: 'why', title: 'Why it is on the list', order: 10, render: (p, c) => `${p.ranked ? ui.bar(gapPct(p), `Gap to target ${gapPct(p)} percent`) : ''}<p>Indicator ${esc(p.ind)} (World Bank): ${gapText(p)}. ${p.ranked ? `Gap to target: <b>${gapPct(p)}%</b>. Rank ${p.rank} of ${c.probs.filter(x => x.ranked).length}.` : ''} <a href="https://data.worldbank.org/indicator/${esc(p.ind)}">Source data</a></p>` });
registerSection('problem', { id: 'solutions', title: 'Solutions', order: 20, render: (p, c) => { const s = c.byProblem[p.id] || []; return s.length ? ui.cardGrid(s.map(x => solCard(x, c))) : `<p>No reviewed solution is listed yet. <span class="m">The loop searches the literature for this problem every cycle; any lead it finds appears below.</span></p>`; } });
registerSection('problem', { id: 'leads', title: 'Leads found by the loop', order: 30, render: (p, c) => {
  const L = c.leads[p.id]; const out = [];
  if (L.drafts.length) out.push(`<p class="m">Sentences quoted unchanged from systematic-review abstracts and re-checked by a separate step.</p>` + L.drafts.map(d => `<div class="box"><b>${esc(d.title)}</b> (${esc(d.year)}) · <a href="https://pubmed.ncbi.nlm.nih.gov/${esc(d.pmid)}/">PubMed ${esc(d.pmid)}</a><br>${d.quotes.results.map(q => `<q>${esc(q)}</q>`).join(' ')} ${d.quotes.conclusions.map(q => `<q>${esc(q)}</q>`).join(' ')}<br><span class="m">${esc(d.review || '')}</span></div>`).join(''));
  if (L.candidates.length) out.push(`<p class="m">Recent reviews found, not yet reviewed (searched ${esc(String(L.searched_at).slice(0, 10))}):</p>${ui.list(L.candidates.map(i => `${esc(i.title)} (${esc(i.year)})${i.pmid ? ` · <a href="https://pubmed.ncbi.nlm.nih.gov/${esc(i.pmid)}/">PubMed</a>` : ''}`))}`);
  if (L.spots.length) out.push(`<h3>Bright spots</h3><p class="m">${esc(L.spots_note)}</p>${ui.list(L.spots.map(s => `${esc(s.name)}: ${s.value} (${s.year}); ${s.z_now} standard deviations better than income predicts now, ${s.z_before} before`))}`);
  return ui.callout({ tone: 'warn', body: '<b>Lead, not finding.</b> Everything in this section was found automatically and checked only mechanically. It is a place to look.' }) + (out.join('') || '<p class="m">Nothing found yet.</p>'); } });
registerSection('problem', { id: 'questions', title: 'Open questions', order: 40, render: (p, c) => ui.list(openQuestions(p, c).map(esc)) });
registerSection('problem', { id: 'related', title: 'Related problems', order: 70, render: (p, c) => { const r = c.probs.filter(x => x.domain === p.domain && x.id !== p.id); return r.length ? ui.cardGrid(r.map(x => probCard(x, c))) : ''; } });
registerSection('problem', { id: 'use', title: 'Use and cite this entry', order: 90, render: (p, c, o) => `${ui.cite(citation(p.title, pUrl(p), o))}<p><a href="${esc(pUrl(p))}.json">This entry as JSON</a> · <a href="${esc(correctionHref(p.title, pUrl(p)))}">Report an error or suggest a correction</a></p>` });

// One template for every entity type: breadcrumbs, title, key messages, an aside of facts, sections in order, a table of contents.
function entityPage({ type, entity, c, o, path, title, desc, crumb, lede, badges, keys, facts, jsonld }) {
  const secs = sectionsFor(type).map(s => ({ ...s, html: s.render(entity, c, o) })).filter(s => s.html);
  const body = `${ui.breadcrumbs(crumb)}<h1>${esc(title)}</h1><p>${badges.join('')}</p><p class="lede">${esc(lede)}</p>${ui.keyMessages(keys)}
<div class="cols"><div>${secs.map(s => ui.section({ id: s.id, title: s.title, body: s.html })).join('')}</div>
<aside class="aside" aria-label="Facts about this entry">${ui.box('At a glance', ui.summaryList(facts))}${ui.toc(secs)}</aside></div>`;
  return render(path, o, { title: `${title} | ${SITE}`, description: desc, body, type: 'article', alternate: path + '.json', current: path, jsonld });
}

export function solutionPage(s, c, o) {
  const probs = c.probs.filter(p => (s.problem_ids || []).includes(p.id));
  const ld = { '@context': 'https://schema.org', '@type': 'Article', headline: s.title, description: s.claim, url: o + sUrl(s), isPartOf: { '@type': 'WebSite', name: SITE, url: o }, citation: s.evidence.map(e => e.src), about: probs.map(p => p.title) };
  return entityPage({ type: 'solution', entity: s, c, o, path: sUrl(s), title: s.title, desc: s.claim, lede: s.claim,
    crumb: [{ label: 'Home', href: '/' }, { label: 'Solutions', href: '/solutions' }, { label: s.title }], badges: [labelBadge(s.label), implBadge(s.impl), ui.badge('design: ' + DESIGN[s.design].name.toLowerCase())],
    keys: [`<b>Evidence:</b> ${esc(s.label)}. Strongest design cited: ${esc(DESIGN[s.design].name.toLowerCase())}.`, s.impl ? `<b>Implementation:</b> ${esc(s.impl.band)} (${s.impl.score} of 8). Cost to start is ${esc(s.impl.cost)}; adoption is ${esc(s.impl.adoption)}.` : '', `<b>Start with:</b> ${esc(s.first_test)}`, `<b>Main limit:</b> ${esc(s.limits)}`].filter(Boolean),
    facts: [['Evidence label', labelBadge(s.label)], ['Implementability', implBadge(s.impl)], ['Cost to start', s.impl ? esc(s.impl.cost) : ''], ['Delivery channel', s.impl && s.impl.channel ? esc(s.impl.channel) : ''], ['Who can act', esc(s.who)],
      ['Addresses', probs.map(pLink).join('<br>')], ['Domain', s.domains.map(d => `<a href="/domains/${esc(domainOf(c, d).slug)}">${esc(d)}</a>`).join(', ')], ['Last checked', esc(s.verified)]], jsonld: ld });
}

export function problemPage(p, c, o) {
  const sols = c.byProblem[p.id] || [], d = domainOf(c, p.domain);
  return entityPage({ type: 'problem', entity: p, c, o, path: pUrl(p), title: p.title, desc: `What is known about ${p.title.toLowerCase()}: the size of the gap and the solutions with evidence.`,
    lede: p.ranked ? `${p.title}: the world is ${gapPct(p)}% of the way short of its target (${p.target_src}).` : `${p.title}. No usable world figure yet.`,
    crumb: [{ label: 'Home', href: '/' }, { label: 'Problems', href: '/problems' }, { label: p.title }], badges: [ui.badge(p.domain), ui.badge(sols.length ? `${sols.length} solution${sols.length > 1 ? 's' : ''} listed` : 'no solution listed yet', sols.length ? 'ok' : 'warn')],
    keys: [p.ranked ? `<b>Size of the gap:</b> ${gapText(p)}.` : '<b>Gap:</b> not yet measurable.', sols.length ? `<b>What can be done:</b> ${sols.map(sLink).join(', ')}.` : '<b>What can be done:</b> no reviewed solution yet; the loop is searching.'],
    facts: [['Domain', d ? `<a href="/domains/${esc(d.slug)}">${esc(p.domain)}</a>` : esc(p.domain)], ['Latest value', p.ranked ? `${esc(p.value)} (${esc(p.year)})` : ''], ['Target', p.ranked ? esc(String(p.target)) : ''], ['Gap to target', p.ranked ? gapPct(p) + '%' : ''], ['Rank', p.ranked ? String(p.rank) : ''], ['Indicator', esc(p.ind)]],
    jsonld: { '@context': 'https://schema.org', '@type': 'Article', headline: p.title, url: o + pUrl(p), isPartOf: { '@type': 'WebSite', name: SITE, url: o } } });
}

// ---------------------------------------------------------------- listings
const opt = (value, label) => ({ value, label });
export function filterSolutions(c, q) {
  const get = k => q.get(k) || '';
  const ready = get('ready'), cost = get('cost'), label = get('label'), dom = get('domain'), sort = get('sort') || 'impl', term = get('q').toLowerCase();
  let list = c.sols.filter(s => (!label || s.label === label) && (!dom || s.domains.some(d => domainOf(c, d).slug === dom)) && (!cost || (s.impl && s.impl.cost === cost))
    && (!ready || (ready === 'ready' ? s.impl && s.impl.score >= 7 : ready === 'effort' ? s.impl && s.impl.score >= 5 && s.impl.score < 7 : s.impl && !s.impl.practical))
    && (!term || (s.title + ' ' + s.claim).toLowerCase().includes(term)));
  const ev = s => ({ 'evidence-backed': 3, 'mixed evidence': 2, 'cited, weaker design': 1 }[s.label] || 0);
  list = [...list].sort(sort === 'title' ? (a, b) => a.title.localeCompare(b.title) : sort === 'benefit' ? (a, b) => ((b.bca || {}).rank_key ?? -1e9) - ((a.bca || {}).rank_key ?? -1e9) : sort === 'evidence' ? (a, b) => ev(b) - ev(a) || ((b.impl || {}).score || 0) - ((a.impl || {}).score || 0) : (a, b) => ((b.impl || {}).score || 0) - ((a.impl || {}).score || 0) || ev(b) - ev(a));
  return list;
}
const pageOf = (list, q) => { const pages = Math.max(1, Math.ceil(list.length / PAGE_SIZE)), page = Math.min(pages, Math.max(1, parseInt(q.get('page'), 10) || 1)); return { page, pages, items: list.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE) }; };
const withParam = (path, q, page) => { const p = new URLSearchParams(q); p.delete('page'); if (page > 1) p.set('page', page); const s = p.toString(); return path + (s ? '?' + s : ''); };

export function solutionsIndex(c, u, o) {
  const q = u.searchParams, list = filterSolutions(c, q), { page, pages, items } = pageOf(list, q);
  const g = (name, label, options) => ({ name, label, options: [opt('', 'Any'), ...options], value: q.get(name) });
  const facets = ui.facets({ action: '/solutions', reset: '/solutions', groups: [
    g('domain', 'Domain', c.domains.map(d => opt(d.slug, d.name))), g('label', 'Evidence', Object.keys(LABELS).filter(k => k !== 'lead').map(k => opt(k, k))),
    g('ready', 'Readiness', [opt('ready', 'Ready to implement'), opt('effort', 'Implementable with effort'), opt('held', 'Not yet practical')]), g('cost', 'Cost to start', [opt('low', 'Low'), opt('medium', 'Medium'), opt('high', 'High')]),
    { name: 'sort', label: 'Sort by', options: [opt('impl', 'Implementability'), opt('evidence', 'Strength of evidence'), opt('benefit', 'Benefit per cost (WELLBYs)'), opt('title', 'Title A to Z')], value: q.get('sort') || 'impl' }] });
  const cards = items.map(s => ui.card({ title: s.title, href: sUrl(s), body: s.claim, meta: s.domains.join(' · '), hue: domainHue(c, s.domains[0]), badges: [labelBadge(s.label), implBadge(s.impl)],
    foot: `<label class="s"><input type="checkbox" name="ids" value="${esc(s.id)}"> Compare <span class="vh">${esc(s.title)}</span></label>` }));
  const body = `${ui.breadcrumbs([{ label: 'Home', href: '/' }, { label: 'Solutions' }])}<h1>Solutions</h1><p class="lede">Every solution with its evidence label and how implementable it is. ${list.length} of ${c.sols.length} shown.</p>${facets}
${items.length ? `<form action="/compare" method="get" aria-label="Compare solutions">${ui.cardGrid(cards, 2)}<p><button type="submit">Compare selected (2 to 4)</button></p></form>` : ui.callout({ tone: 'warn', title: 'Nothing matches', body: '<p>No solution matches these filters. <a href="/solutions">Clear the filters</a> or <a href="/domains">browse by domain</a>.</p>' })}
${ui.pagination({ page, pages, href: n => withParam('/solutions', q, n) })}${legend()}`;
  return render('/solutions', o, { title: `Solutions${page > 1 ? ' (page ' + page + ')' : ''} | ${SITE}`, description: 'Every solution with its evidence label and implementability.', body, noindex: q.toString() !== '' && !/^page=\d+$/.test(q.toString()) });
}

export function problemsIndex(c, u, o) {
  const q = u.searchParams, dom = q.get('domain') || '', cov = q.get('coverage') || '';
  let list = [...c.probs].filter(p => (!dom || p.dslug === dom) && (!cov || (cov === 'none') === !(c.byProblem[p.id] || []).length)).sort((a, b) => (a.rank || 99) - (b.rank || 99));
  const { page, pages, items } = pageOf(list, q);
  const facets = ui.facets({ action: '/problems', reset: '/problems', groups: [{ name: 'domain', label: 'Domain', options: [opt('', 'Any'), ...c.domains.map(d => opt(d.slug, d.name))], value: dom },
    { name: 'coverage', label: 'Solutions', options: [opt('', 'Any'), opt('some', 'Has a listed solution'), opt('none', 'No solution yet')], value: cov }] });
  const body = `${ui.breadcrumbs([{ label: 'Home', href: '/' }, { label: 'Problems' }])}<h1>Problems</h1><p class="lede">Ranked by the gap between the latest world value and its international target (World Bank open data). ${list.length} shown.</p>${facets}
${ui.cardGrid(items.map(p => ui.card({ title: p.title, href: pUrl(p), meta: p.domain, body: p.ranked ? `${gapText(p)}` : 'No usable world figure yet.', hue: domainHue(c, p.domain), badges: [p.ranked ? ui.badge(`gap ${gapPct(p)}%`, gapPct(p) > 50 ? 'warn' : 'info') : ui.badge('unranked'), ui.badge(`${(c.byProblem[p.id] || []).length} solution(s)`)] })), 2)}
${list.length ? '' : ui.callout({ tone: 'warn', title: 'Nothing matches', body: '<p><a href="/problems">Clear the filters</a>.</p>' })}${ui.pagination({ page, pages, href: n => withParam('/problems', q, n) })}`;
  return render('/problems', o, { title: `Problems | ${SITE}`, description: 'Problems ranked by gap to an international target.', body, noindex: q.toString() !== '' && !/^page=\d+$/.test(q.toString()) });
}

export function domainsIndex(c, o) {
  const body = `${ui.breadcrumbs([{ label: 'Home', href: '/' }, { label: 'Domains' }])}<h1>Domains</h1><p class="lede">${c.domains.length} fields of practical need. A new field appears here, in filters and in search as soon as a problem is added to it.</p>
${ui.cardGrid(c.domains.map(d => { const m = dMeta(d); return ui.card({ title: d.name, href: '/domains/' + d.slug, body: m.blurb, meta: `${d.problems.length} problem(s) · ${d.solutions.length} solution(s)`, hue: m.hue }); }), 2)}`;
  return render('/domains', o, { title: `Domains | ${SITE}`, description: 'Fields covered by the encyclopedia.', body });
}
export function domainPage(d, c, o) {
  const m = dMeta(d), secs = [...sectionsFor('domain').map(s => ({ ...s, html: s.render(d, c, o) })).filter(s => s.html)];
  const body = `${ui.breadcrumbs([{ label: 'Home', href: '/' }, { label: 'Domains', href: '/domains' }, { label: d.name }])}<h1>${esc(d.name)}</h1><p class="lede">${esc(m.blurb)}</p>
${ui.section({ id: 'problems', title: 'Problems', body: ui.cardGrid(d.problems.map(p => probCard(p, c))) })}
${ui.section({ id: 'solutions', title: 'Solutions', body: d.solutions.length ? ui.cardGrid(d.solutions.map(s => solCard(s, c))) : '<p>None yet. The loop is searching.</p>' })}${secs.map(s => ui.section({ id: s.id, title: s.title, body: s.html })).join('')}`;
  return render('/domains/' + d.slug, o, { title: `${d.name} | ${SITE}`, description: `Problems and solutions in ${d.name}.`, body, current: '/domains' });
}

// ---------------------------------------------------------------- home, audiences, compare, search, trust pages
export function home(c, o) {
  const open = c.probs.filter(p => !(c.byProblem[p.id] || []).length), ready = c.sols.filter(s => s.impl && s.impl.score >= 7).slice(0, 6), top = c.probs.filter(p => p.ranked).slice(0, 5);
  const body = `${ui.hero({ title: 'What actually works, and how to do it', lede: 'An evidence-based encyclopedia of practical solutions to pressing problems. Every entry shows its sources, how strong the evidence is, what it costs and who can deliver it. Written and kept current by an automated loop, in the open.',
    search: SHELL.search, actions: [{ href: '/solutions?ready=ready', label: 'See solutions ready to implement' }, { href: '/method', label: 'How we know', alt: true }] })}
${ui.stats([{ value: c.sols.length, label: 'solutions' }, { value: c.probs.length, label: 'problems' }, { value: c.domains.length, label: 'domains' }, { value: c.sols.filter(s => s.impl && s.impl.score >= 7).length, label: 'ready to implement' }, { value: open.length, label: 'problems with no solution yet' }])}
${ui.section({ id: 'who', title: 'Start from who you are', body: ui.cardGrid(AUDIENCES.map(a => ui.card({ title: a.name, href: '/for/' + a.id, body: a.goal, meta: a.who, hue: a.hue }))) })}
${ui.section({ id: 'ready', title: 'Ready to implement', body: `<p class="m">High evidence is not enough; these also have low cost, real-world scale and an existing way to deliver them.</p>${ui.cardGrid(ready.map(s => solCard(s, c)))}<p><a href="/solutions?ready=ready">All solutions ready to implement</a></p>` })}
${ui.section({ id: 'gaps', title: 'Largest gaps between the world and its targets', body: ui.list(top.map(p => `${pLink(p)} <span class="m">${esc(p.domain)} · gap ${gapPct(p)}% · ${(c.byProblem[p.id] || []).length} solution(s)</span>${ui.bar(gapPct(p), `Gap to target ${gapPct(p)} percent`)}`)) + '<p><a href="/problems">All problems</a></p>' })}
${ui.section({ id: 'domains', title: 'Browse by domain', body: ui.cardGrid(c.domains.map(d => ui.card({ title: d.name, href: '/domains/' + d.slug, body: dMeta(d).blurb, hue: dMeta(d).hue, meta: `${d.problems.length} problem(s) · ${d.solutions.length} solution(s)` }))) })}
${ui.section({ id: 'trust', title: 'Why you can trust it, and where not to', body: `<p>Labels follow a published rule, not a judgement. Mixed results are shown as mixed. Anything the loop finds on its own is marked as a lead, never as a finding.</p>${legend()}<p>${c.lastTick ? `Last loop run ${esc(String(c.lastTick.at).slice(0, 16).replace('T', ' '))} UTC. ` : ''}<a href="/changes">See every automatic change</a>.</p>` })}`;
  return render('/', o, { title: `${SITE}: an evidence-based encyclopedia of what works`, description: 'Implementable solutions to pressing problems, each linked to its sources and honestly labelled. Written and kept up to date by an automated loop.', body, current: '/', hideSearch: true,
    jsonld: { '@context': 'https://schema.org', '@type': 'WebSite', name: SITE, url: o, potentialAction: { '@type': 'SearchAction', target: o + '/search?q={query}', 'query-input': 'required name=query' } } });
}

export function forIndex(c, o) {
  const body = `${ui.breadcrumbs([{ label: 'Home', href: '/' }, { label: 'For you' }])}<h1>Who this is for</h1><p class="lede">Pick the description closest to you. Each page lists what you can do here, in order, and where to start.</p>
${ui.cardGrid(AUDIENCES.map(a => ui.card({ title: a.name, href: '/for/' + a.id, body: a.goal, meta: a.who, hue: a.hue, badges: [ui.badge(`${storiesFor(a.id).length} tasks`)] })), 2)}`;
  return render('/for', o, { title: `Who this is for | ${SITE}`, description: 'The people the encyclopedia is built for and what each can do here.', body });
}

// What each audience is shown first. Data comes from the catalogue, so these lists grow with it.
const STARTS = {
  implementers: (c) => ['Ready to implement', ui.cardGrid(c.sols.filter(s => s.impl && s.impl.score >= 7).slice(0, 6).map(s => solCard(s, c))) + '<p><a href="/compare">Compare solutions side by side</a></p>'],
  funders: (c) => ['Low cost, proven at scale', ui.cardGrid(c.sols.filter(s => s.impl && s.impl.cost === 'low' && s.impl.adoption === 'scaled').slice(0, 6).map(s => solCard(s, c))) + `<h3>Gaps with no listed solution</h3>${ui.list(c.probs.filter(p => !(c.byProblem[p.id] || []).length).map(p => `${pLink(p)} <span class="m">${esc(p.domain)}</span>`))}`],
  researchers: (c) => ['Where the evidence is thin or disputed', ui.cardGrid(c.sols.filter(s => s.label !== 'evidence-backed').slice(0, 6).map(s => solCard(s, c))) + `<h3>Problems still without a reviewed solution</h3>${ui.list(c.probs.filter(p => !(c.byProblem[p.id] || []).length).map(pLink))}<p><a href="/index.json">Whole catalogue as JSON</a> · <a href="/solutions.csv">CSV</a></p>`],
  journalists: (c) => ['Mixed or disputed evidence', ui.cardGrid(c.sols.filter(s => s.label === 'mixed evidence').slice(0, 6).map(s => solCard(s, c))) + `<p>Every entry has a ready-made citation under "Use and cite this entry", a stable link, and its limits stated beside its claim.</p>`],
  public: (c) => ['The biggest gaps, in plain terms', ui.list(c.probs.filter(p => p.ranked).slice(0, 6).map(p => `${pLink(p)} <span class="m">gap ${gapPct(p)}%</span>${ui.bar(gapPct(p), `Gap to target ${gapPct(p)} percent`)}`))],
  developers: () => ['Endpoints', ui.list([['/index.json', 'whole catalogue'], ['/solutions.csv', 'one row per solution'], ['/solutions/{id}.json', 'one entry'], ['/problems/{id}.json', 'one problem'], ['/feed.json', 'what changed'], ['/llms.txt', 'summary for language models']].map(([h, t]) => `<code>${esc(h)}</code> ${esc(t)}`)) + '<p><a href="/api">Full description</a></p>'],
  experts: (c) => ['Entries that most need review', ui.cardGrid(c.sols.filter(s => s.label !== 'evidence-backed').slice(0, 6).map(s => solCard(s, c)))],
};
export function forPage(a, c, o) {
  const [title, html] = STARTS[a.id] ? STARTS[a.id](c) : ['Start', ''];
  const tasks = storiesFor(a.id).filter(t => t.listed !== false);
  const body = `${ui.breadcrumbs([{ label: 'Home', href: '/' }, { label: 'For you', href: '/for' }, { label: a.name }])}<h1>${esc(a.name)}</h1><p class="lede">${esc(a.who)} ${esc(a.goal)}</p>
<p><a class="btn" href="${esc(a.start.href)}">${esc(a.start.label)}</a></p>
${ui.section({ id: 'tasks', title: 'What you can do here', body: ui.list(tasks.map(t => `<a href="${esc(t.steps[0].visit)}">I want to ${esc(t.want)}</a><br><span class="m s">${esc(t.so)}</span>`)) })}
${ui.section({ id: 'start', title, body: html })}`;
  return render('/for/' + a.id, o, { title: `For ${a.name.toLowerCase()} | ${SITE}`, description: a.goal, body, current: '/for' });
}

export function comparePage(c, u, o) {
  const ids = [...new Set(u.searchParams.getAll('ids').flatMap(x => x.split(',')))].slice(0, 4), sols = ids.map(id => c.sols.find(s => s.id === id)).filter(Boolean);
  const all = c.sols.filter(s => !ids.includes(s.id));
  const picker = `<form class="facets" action="/compare" method="get" aria-label="Choose solutions to compare">${Array.from({ length: Math.max(2, Math.min(4, sols.length + 1)) }, (_, i) => `<div><label for="cmp${i}">Solution ${i + 1}</label><select id="cmp${i}" name="ids"><option value="">None</option>${c.sols.map(s => `<option value="${esc(s.id)}"${sols[i] && sols[i].id === s.id ? ' selected' : ''}>${esc(s.title)}</option>`).join('')}</select></div>`).join('')}<button type="submit">Compare</button></form>`;
  const rows = sols.length >= 1 ? ui.table({ caption: 'Solutions compared', head: ['', ...sols.map(s => s.title)], rows: [
    ['Evidence label', ...sols.map(s => labelBadge(s.label))], ['Strongest design', ...sols.map(s => esc(DESIGN[s.design].name))], ['Implementability', ...sols.map(s => implBadge(s.impl))],
    ['Cost to start', ...sols.map(s => s.impl ? `${esc(s.impl.cost)}: ${esc(s.impl.cost_note)}` : '')], ['Real-world adoption', ...sols.map(s => s.impl ? esc(s.impl.adoption) : '')], ['Delivery channel', ...sols.map(s => s.impl && s.impl.channel ? esc(s.impl.channel) : 'none identified')],
    ['Who can act', ...sols.map(s => esc(s.who))], ['Cheapest first test', ...sols.map(s => esc(s.first_test))], ['Main limit', ...sols.map(s => esc(s.limits))], ['Full entry', ...sols.map(s => `<a href="${esc(sUrl(s))}">Read the entry</a>`)]] }) : '';
  const body = `${ui.breadcrumbs([{ label: 'Home', href: '/' }, { label: 'Solutions', href: '/solutions' }, { label: 'Compare' }])}<h1>Compare solutions</h1><p class="lede">Put two to four solutions side by side on evidence, cost and delivery. The address of this page can be shared.</p>${picker}
${sols.length === 0 ? ui.callout({ title: 'Nothing chosen yet', body: '<p>Choose solutions above, or tick <b>Compare</b> on the <a href="/solutions">solutions list</a>.</p>' }) : sols.length === 1 ? ui.callout({ tone: 'warn', body: '<p>Add at least one more solution to compare.</p>' }) : ''}${rows}`;
  return render('/compare', o, { title: `Compare solutions | ${SITE}`, description: 'Compare solutions on evidence, cost and delivery.', body, noindex: true });
}

export function searchPage(c, u, o) {
  const q = u.searchParams.get('q') || '', t = u.searchParams.get('type') || '', all = search(searchIndex(c), q), hits = t ? all.filter(h => h.type === t) : all;
  const describe = h => h.type === 'solution' ? (c.sols.find(s => s.id === h.id) || {}).claim : (() => { const p = c.probs.find(x => x.id === h.id); return p ? p.domain + (p.ranked ? ` · gap ${gapPct(p)}%` : '') : ''; })();
  const body = `${ui.breadcrumbs([{ label: 'Home', href: '/' }, { label: 'Search' }])}<h1>Search</h1>
<form class="facets" action="/search" method="get" role="search" aria-label="Search"><div><label for="s-q">Search</label><input id="s-q" type="search" name="q" value="${esc(q)}"></div><div><label for="s-t">Show</label><select id="s-t" name="type"><option value="">Everything</option><option value="solution"${t === 'solution' ? ' selected' : ''}>Solutions</option><option value="problem"${t === 'problem' ? ' selected' : ''}>Problems</option></select></div><button type="submit">Search</button></form>
${q ? `<p role="status">${hits.length} result${hits.length === 1 ? '' : 's'} for <b>${esc(q)}</b></p>` : '<p class="m">Type a word such as water, malaria or schools.</p>'}
${hits.length ? ui.list(hits.map(h => `<a href="${esc(h.url)}">${esc(h.title)}</a> ${ui.badge(h.type)}<br><span class="m">${esc(describe(h) || '')}</span>`)) : q ? ui.callout({ tone: 'warn', title: 'No results', body: `<p>Nothing matches "${esc(q)}". Try a single word, or <a href="/domains">browse by domain</a>. If this is a problem the encyclopedia should cover, <a href="${esc(correctionHref('Missing topic: ' + q, '/search'))}">tell us</a>.</p>` }) : ''}`;
  return render('/search', o, { title: `${q ? 'Search: ' + q : 'Search'} | ${SITE}`, description: 'Search solutions and problems.', body, noindex: true });
}

export function notFound(c, o, path = '') {
  const body = `<h1>Page not found</h1><p class="lede">There is no page at <code>${esc(path)}</code>.</p>${ui.hero({ title: 'Try a search', lede: 'Or start from the home page.', search: SHELL.search }).replace('<h1 id="hero-t">Try a search</h1>', '<h2 id="hero-t">Try a search</h2>')}<p><a href="/">Home</a> · <a href="/solutions">Solutions</a> · <a href="/problems">Problems</a> · <a href="/domains">Domains</a></p>`;
  return render('/404', o, { title: `Page not found | ${SITE}`, description: 'This page does not exist.', body, noindex: true, hideSearch: true });
}

export function apiPage(c, o) {
  const rows = [['/index.json', 'JSON', 'The whole catalogue: problems, solutions, labels, implementability, sources.'], ['/solutions.csv', 'CSV', 'One row per solution, for spreadsheets.'], ['/solutions/{id}.json', 'JSON', 'One solution with its sources.'],
    ['/problems/{id}.json', 'JSON', 'One problem with its gap and its solutions.'], ['/search.json?q=', 'JSON', 'Search results.'], ['/feed.xml, /feed.json', 'RSS, JSON Feed', 'Every automatic change.'], ['/sitemap.xml', 'XML', 'Every page.'], ['/llms.txt', 'Text', 'A short description for language models.'], ['/metrics.json', 'JSON', 'Aggregate reach counters.']];
  const body = `${ui.breadcrumbs([{ label: 'Home', href: '/' }, { label: 'Data and API' }])}<h1>Data and API</h1><p class="lede">The same facts the pages show are available as data, with labels and sources intact. No key, no sign-up, no rate limit beyond fair use.</p>
${ui.table({ caption: 'Endpoints', head: ['Path', 'Format', 'What it returns'], rows: rows.map(r => [`<code>${esc(r[0])}</code>`, esc(r[1]), esc(r[2])]) })}
${ui.callout({ tone: 'warn', title: 'Keep the labels', body: '<p>When you reuse a claim, keep its <code>label</code> and <code>limits</code> with it. A claim without its evidence label is not what this site says. Entries are licensed for reuse with attribution; cite the permanent link.</p>' })}
${ui.section({ id: 'ex', title: 'Example', body: `<p>One solution:</p>${ui.cite(`curl ${o}/solutions/kmc.json`)}<p>Only the fields an agent needs to decide:</p>${ui.cite('jq \'.solutions[] | select(.implementability.score >= 7) | {id, label, url}\' index.json')}` })}`;
  return render('/api', o, { title: `Data and API | ${SITE}`, description: 'Read the whole catalogue as JSON, CSV or a feed.', body });
}
export { AUDIENCES, audience, STORIES };
