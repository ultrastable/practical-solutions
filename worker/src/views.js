// SPDX-License-Identifier: LicenseRef-Ultrastable-USL-1.0
// Copyright (c) 2026 Rowan Brad Quni-Gudzinas. Non-commercial use free; commercial use requires a license. See LICENSE.
// FEATURE-VIEWS-1: comparison views built only from the catalogue. Evidence gap map (Cochrane, J-PAL), benefit-cost ranking (GiveWell,
// Copenhagen Consensus) and a script-free trend chart (Our World in Data). Every number is read from catalogue data at request time.
import * as ui from './kit/index.js';
import { LABELS } from './catalog.js';
import { figure, sig } from './numfmt.js';
const { esc } = ui;
const f = n => sig(n, 3);  // NUMFMT-1: three significant figures, never a fixed two decimals

export function evidenceMap(c) {
  const labels = Object.keys(LABELS);
  const rows = c.domains.map(d => { const sols = c.sols.filter(s => s.domains.includes(d.name)), probs = c.probs.filter(p => p.domain === d.name);
    return { d, probs: probs.length, bare: probs.filter(p => !(c.byProblem[p.id] || []).length).length, by: labels.map(l => sols.filter(s => s.label === l).length) }; });
  return { labels, rows };
}
export function evidenceMapBody(c) {
  const m = evidenceMap(c);
  return `${ui.breadcrumbs([{ label: 'Home', href: '/' }, { label: 'Evidence map' }])}<h1>Evidence map</h1><p class="lede">Where the evidence is strong, where it is thin and where there is none, by domain. A problem with no solution listed is a gap, not a lack of need.</p>
${ui.table({ caption: 'Solutions by evidence label and problems without a listed solution, per domain', head: ['Domain', ...m.labels, 'Problems', 'Problems with no solution'], rows: m.rows.map(r => [`<a href="/domains/${esc(r.d.slug)}">${esc(r.d.name)}</a>`, ...r.by.map(String), String(r.probs), r.bare ? `<a href="/problems?coverage=none&amp;domain=${encodeURIComponent(r.d.name)}">${r.bare}</a>` : '0']) })}
${ui.callout({ tone: 'info', title: 'Reading the labels', body: '<ul class="list">' + m.labels.map(l => `<li><b>${esc(l)}</b>: ${esc(LABELS[l])}</li>`).join('') + '</ul>' })}`;
}

// Benefit-cost ranking on the conservative (25th percentile) estimate; drafts and unmodelled entries stay out, as on the entry pages.
export function ranking(c, sort = 'p25') {
  const key = sort === 'p50' ? 'p50' : 'p25';
  const rows = c.sols.filter(s => s.bca && !s.bca.error && !s.bca.draft && s.bca.wellby_per_1000_usd).map(s => ({ s, w: s.bca.wellby_per_1000_usd, p: s.bca.prob_net_positive }));
  return { key, rows: rows.sort((a, b) => b.w[key] - a.w[key]), excluded: c.sols.length - rows.length };
}
export function rankingBody(c, u) {
  const r = ranking(c, u.searchParams.get('sort'));
  return `${ui.breadcrumbs([{ label: 'Home', href: '/' }, { label: 'Benefit-cost ranking' }])}<h1>Benefit-cost ranking</h1><p class="lede">Solutions with a modelled estimate, in WELLBYs per USD 1,000, ranked by the ${r.key === 'p25' ? 'cautious (25th percentile)' : 'median'} value. Ranges are 90%. <a href="/ranking?sort=${r.key === 'p25' ? 'p50' : 'p25'}">Rank by ${r.key === 'p25' ? 'median' : 'cautious value'} instead</a>.</p>
${ui.table({ caption: 'Benefit-cost, WELLBYs per USD 1,000', head: ['#', 'Solution', 'Cautious', 'Median', '90% range', 'Chance of net benefit'], rows: r.rows.map((x, i) => [String(i + 1), `<a href="/solutions/${esc(x.s.id)}">${esc(x.s.title)}</a>`, f(x.w.p25), f(x.w.p50), `${f(x.w.p5)} to ${f(x.w.p95)}`, Math.round((x.p || 0) * 100) + '%']) })}
<p class="m">${r.excluded} solution(s) are not ranked: no model yet, or a draft not yet confirmed by a second source. Higher-order effects are included and shown on each entry. <a href="/method#bca">How this is calculated</a>.</p>`;
}

// Two-point slope chart from the catalogue's own earlier and latest values; no script, readable by screen readers through the title and table.
export function trendSvg(m, title = '') {
  if (!m || m.base == null || m.value == null || m.base_year == null || m.year == null) return '';
  const lo = Math.min(m.base, m.value), hi = Math.max(m.base, m.value), span = hi - lo || 1, W = 320, H = 120, P = 24;
  const nb = figure(m.base, title) || sig(m.base, 3), nv = figure(m.value, title) || sig(m.value, 3), y = v => Math.round(H - P - ((v - lo) / span) * (H - 2 * P)), x1 = P, x2 = W - P, up = m.value > m.base;
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-labelledby="tr-t" width="100%" style="max-width:24rem"><title id="tr-t">From ${esc(nb)} in ${esc(String(m.base_year))} to ${esc(nv)} in ${esc(String(m.year))}</title><line x1="${x1}" y1="${y(m.base)}" x2="${x2}" y2="${y(m.value)}" stroke="currentColor" stroke-width="3"/><circle cx="${x1}" cy="${y(m.base)}" r="5" fill="currentColor"/><circle cx="${x2}" cy="${y(m.value)}" r="5" fill="currentColor"/><text x="${x1}" y="${H - 4}" font-size="14" fill="currentColor">${esc(String(m.base_year))}: ${esc(nb)}</text><text x="${x2}" y="${H - 4}" font-size="14" text-anchor="end" fill="currentColor">${esc(String(m.year))}: ${esc(nv)}</text><text x="${W / 2}" y="14" font-size="14" text-anchor="middle" fill="currentColor">${up ? 'rising' : m.value < m.base ? 'falling' : 'flat'}</text></svg>`;
}

// Argument map (Kialo-style, from data already on the entry): the claim, what supports it with its source, and what weighs against it.
export function argumentMap(s, c) {
  const pro = (s.evidence || []).map(e => ({ text: e.finding, src: e.src }));
  const con = [{ text: s.limits, src: 'Limits recorded on this entry' }];
  if (s.verdict === 'mixed' || s.verdict === 'limited') con.push({ text: s.verdict === 'mixed' ? 'The evidence cited is mixed: some studies find a smaller or no effect.' : 'The evidence found so far is limited.', src: 'Evidence label: ' + s.label });
  if (s.bca && !s.bca.error && s.bca.evidence_share > 0.5) con.push({ text: 'More than half of the benefit estimate rests on weak evidence (grade C or D).', src: 'Benefit and cost model' });
  const u = (c.unknowns && c.unknowns[s.id]) || null; void u;
  return { claim: s.claim, pro, con };
}
export function argumentBlock(s, c) {
  const m = argumentMap(s, c), li = a => a.map(x => `<li>${esc(x.text)}<br><span class="m">${esc(x.src)}</span></li>`).join('');
  return `<p><b>Claim:</b> ${esc(m.claim)}</p><div class="cols"><div><h3>For</h3><ul class="list">${li(m.pro)}</ul></div><div><h3>Against, or limits</h3><ul class="list">${li(m.con)}</ul></div></div><p class="m">Built from the entry's own sources and limits, not from votes. A claim stays only while its sources hold.</p>`;
}

// Glossary: the terms the entries use, each defined once. Data, so a new term is one row.
export const GLOSSARY = [
  ['Evidence label', 'How strong the cited evidence is: evidence-backed, mixed evidence, or cited with a weaker design. Shown on every solution.', '/method'],
  ['Implementability', 'A score out of 8 for how ready a solution is to deliver: cost to start, real-world adoption, a delivery channel and an actor with the remit.', '/method'],
  ['WELLBY', 'One point of life satisfaction (0 to 10 scale) for one person for one year. Used to compare benefit across health, income and other outcomes without converting to money.', '/method#bca'],
  ['Benefit-cost range', 'The 90% range of the modelled benefit per USD 1,000. Rankings use the cautious (25th percentile) value.', '/ranking'],
  ['Bright spot', 'A place doing far better than its income predicts on an indicator. A lead for where to look, not a finding.', '/leads'],
  ['Lead', 'Something the loop found automatically and checked only mechanically. It becomes an entry only when a source with a study design is cited and checked.', '/leads'],
  ['Gap to target', 'How far the world figure is from the stated target, as a share of the distance.', '/problems'],
  ['Systematic review', 'A study that pools every eligible study on a question by a stated method. The strongest design the labels recognise.', '/method'],
  ['Randomised trial', 'A study that assigns the intervention by chance, so the groups differ only in the intervention.', '/method'],
  ['Red team', 'An automated adversarial check that looks for reasons an entry could be wrong.', '/unknowns'],
  ['Income level', 'The World Bank income group of a country, used to judge where a solution is most relevant.', '/context'],
  ['Evidence gap', 'A problem with no reviewed solution listed. A gap in evidence, not a lack of need.', '/evidence-map'],
];
const gid = t => t.toLowerCase().replace(/[^a-z0-9]+/g, '-');
export function glossaryBody() {
  return `${ui.breadcrumbs([{ label: 'Home', href: '/' }, { label: 'Glossary' }])}<h1>Glossary</h1><p class="lede">The terms used on this site, each defined once.</p><dl>${GLOSSARY.slice().sort((a, b) => a[0].localeCompare(b[0])).map(([t, d, href]) => `<dt id="${gid(t)}"><b>${esc(t)}</b></dt><dd>${esc(d)} <a href="${esc(href)}">Where it is used</a></dd>`).join('')}</dl>`;
}
export const glossaryLd = o => ({ '@context': 'https://schema.org', '@type': 'DefinedTermSet', name: 'Practical Solutions glossary', url: o + '/glossary', hasDefinedTerm: GLOSSARY.map(([t, d]) => ({ '@type': 'DefinedTerm', name: t, description: d, url: o + '/glossary#' + gid(t) })) });

// Accessibility statement: only what the build enforces (test/ux.test.js and the post-deploy axe run).
export function accessibilityBody(correctionsUrl) {
  return `${ui.breadcrumbs([{ label: 'Home', href: '/' }, { label: 'Accessibility' }])}<h1>Accessibility</h1><p class="lede">This site aims to meet WCAG 2.2 level AA. Here is what is checked automatically and how to report a barrier.</p>
${ui.section({ id: 'checked', title: 'What is checked on every change', body: ui.list(['Colour contrast of the design tokens in light and dark mode.', 'Every page is audited for headings, labels, landmarks and link names.', 'Pages run no script, so everything works with scripting off and with a keyboard.', 'After each deploy a real browser runs an accessibility check at desktop and phone width, in light and dark.']) })}
${ui.section({ id: 'limits', title: 'Known limits', body: '<p>Automated checks do not find every barrier. Wide tables scroll sideways on small screens. Linked sources on other sites are outside these checks.</p>' })}
${ui.section({ id: 'report', title: 'Report a barrier', body: `<p>If something here is hard to use, <a href="${esc(correctionsUrl)}">report it</a>. Reports are public issues and are worked by the same loop that maintains the entries.</p>` })}`;
}

// Frictionless data package describing the CSV downloads; field lists are read from the CSV headers by the route.
export function datapackage(o, heads) {
  const res = (name, path, title) => ({ name, path: o + path, title, format: 'csv', mediatype: 'text/csv', encoding: 'utf-8', schema: { fields: heads[name].map(n => ({ name: n, type: 'string' })) } });
  return { name: 'practical-solutions', title: 'Practical Solutions catalogue', homepage: o, licenses: [{ name: 'other-at', title: 'Reuse with attribution; keep evidence labels and limits', path: o + '/about' }],
    resources: [res('solutions', '/solutions.csv', 'One row per solution'), res('problems', '/problems.csv', 'One row per problem'), res('catalogue', '/catalogue.csv', 'One row per catalogued indicator')] };
}

// Country compare: the same context rows side by side for up to four countries.
export function countryCompareBody(c, u, { levelName, INFRA, solutionsFor }) {
  const all = (c.context && c.context.countries) || {};
  const ids = [...new Set(u.searchParams.getAll('c').join(',').split(',').map(x => x.trim().toUpperCase()).filter(Boolean))].slice(0, 4);
  const xs = ids.map(i => all[i]).filter(Boolean), missing = ids.filter(i => !all[i]);
  const form = `<form class="facets" action="/country/compare" method="get" aria-label="Choose countries"><div><label for="cc">Country codes (ISO3), separated by commas</label><input id="cc" type="text" name="c" value="${esc(ids.join(','))}" autocomplete="off"></div><button type="submit">Compare</button></form>`;
  let out = '<p>Enter two to four three-letter country codes, for example KEN, UGA, TZA. Codes are on each <a href="/country">country page</a>.</p>';
  if (xs.length) {
    const fit = xs.map(x => solutionsFor(x, c.sols));
    const rows = [['Region', ...xs.map(x => esc(x.region || ''))], ['Income group', ...xs.map(x => esc(levelName(x.level) || 'not classified'))], ['HDI tier', ...xs.map(x => x.hdi ? `${esc(x.hdi.tier)} (${x.hdi.value})` : 'not available')],
      ...Object.entries(INFRA).map(([k, v]) => [esc(v.label), ...xs.map(x => x.infra && x.infra[k] ? `${x.infra[k].v}% (${x.infra[k].year})` : 'no figure')]), ['Solutions that fit', ...fit.map(r => String(r.relevant.length))]];
    const shared = fit.length > 1 ? fit[0].relevant.map(r => r.s).filter(s => fit.every(r => r.relevant.some(y => y.s.id === s.id))) : [];
    out = ui.table({ caption: 'Countries compared', head: ['Dimension', ...xs.map(x => `<a href="/country/${esc(x.iso3)}">${esc(x.name)}</a>`)], rows }) + (fit.length > 1 ? `<h2>Solutions that fit all of them (${shared.length})</h2>${ui.list(shared.map(s => `<a href="/solutions/${esc(s.id)}">${esc(s.title)}</a>`)) || '<p>None in common.</p>'}` : '');
  }
  return `${ui.breadcrumbs([{ label: 'Home', href: '/' }, { label: 'By country', href: '/country' }, { label: 'Compare' }])}<h1>Compare countries</h1>${form}${missing.length ? ui.callout({ tone: 'warn', title: 'Not found', body: `<p>No data for: ${esc(missing.join(', '))}.</p>` }) : ''}${out}`;
}
