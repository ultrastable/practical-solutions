// SPDX-License-Identifier: LicenseRef-Ultrastable-USL-1.0
// Copyright (c) 2026 Rowan Brad Quni-Gudzinas. Non-commercial use free; commercial use requires a license. See LICENSE.
// Country and income-group pages: look a country up by name, see its income group, HDI tier and infrastructure, and the problems and
// solutions that fit that context. All figures come from the bundled snapshot (data/context.json) and show their year; no data -> says so.
import * as ui from './kit/index.js';
import * as P from './pages.js';
import { LEVELS, levelName } from './context.js';
import { INFRA, findCountries, solutionsFor, levelOf } from './countries.js';
import { sig } from './numfmt.js';

const { esc } = ui;
const SITE = P.SITE;
const render = (path, o, page) => ui.renderPage(P.SHELL, { path, ...page }, o);
const ctxOf = c => c.context || { at: null, sources: {}, countries: {}, levels: {} };
const loaded = c => Object.keys(ctxOf(c).countries || {}).length > 0;
const empty = () => ui.callout({ tone: 'warn', title: 'Country data is not loaded yet', body: '<p>The daily refresh from the World Bank and UNDP has not written its first snapshot. Income-level pages below still work from the catalogue.</p>' });
const stale = ctx => `<p class="m">Data snapshot: ${ctx.at ? esc(String(ctx.at).slice(0, 10)) : 'none yet'}. Sources: World Bank open data (income groups, infrastructure) and UNDP Human Development Report (HDI).${Object.values(ctx.sources || {}).some(v => !String(v).startsWith('ok')) ? ' Some sources failed in the last refresh and show their previous values or none.' : ''}</p>`;

export function countryIndex(c, u, o) {
  const ctx = ctxOf(c), q = (u.searchParams.get('q') || '').trim();
  const form = `<form class="facets" action="/country" method="get" role="search" aria-label="Find a country"><div><label for="cq">Country name</label><input id="cq" type="search" name="q" value="${esc(q)}" autocomplete="off"></div><button type="submit">Find</button></form>`;
  const found = q ? findCountries(ctx, q) : [];
  let results = '';
  if (q) results = found.length ? `<h2>${found.length} match${found.length > 1 ? 'es' : ''}</h2>${ui.list(found.slice(0, 20).map(x => `<a href="/country/${esc(x.iso3)}">${esc(x.name)}</a> <span class="m">${esc(levelName(x.level) || 'no income group')}${x.hdi ? ' · HDI ' + esc(x.hdi.tier) : ''}</span>`))}` : ui.callout({ tone: 'warn', title: 'No country matches', body: `<p>Nothing matched "${esc(q)}". Try fewer letters, or choose an income group below.</p>` });
  const groups = LEVELS.map(l => `<a href="/levels/${l.id}">${esc(l.name)}</a>`);
  const body = `${ui.breadcrumbs([{ label: 'Home', href: '/' }, { label: 'By country' }])}<h1>Find what fits a country</h1><p class="lede">Type a country to see its income group, its Human Development Index tier and how much infrastructure people have, then the problems and solutions that fit that context. Or start from an income group: ${groups.join(' · ')}.</p>
${form}${loaded(c) ? '' : empty()}${results}${stale(ctx)}`;
  return render('/country', o, { title: `By country | ${SITE}`, description: 'Look up a country to see which problems and solutions fit its income group, HDI tier and infrastructure.', body, noindex: !!q });
}

export function countryPage(x, c, o) {
  const ctx = ctxOf(c), lv = levelOf(x), r = solutionsFor(x, c.sols);
  const levelRank = lv && ctx.levels && ctx.levels[lv.id] ? ctx.levels[lv.id].ranked.slice(0, 8) : [];
  const infra = Object.entries(INFRA).map(([k, v]) => [esc(v.label), x.infra[k] ? `${x.infra[k].v}% (${x.infra[k].year})` : 'no figure']);
  const hdi = x.hdi ? `${esc(x.hdi.tier)} (${x.hdi.value}, ${x.hdi.year})` : 'not available';
  const sol = a => ui.list(a.map(({ s, reasons }) => `<a href="/solutions/${esc(s.id)}">${esc(s.title)}</a> <span class="m">${esc(reasons.join('. '))}.</span>`)) || '<p>None.</p>';
  const body = `${ui.breadcrumbs([{ label: 'Home', href: '/' }, { label: 'By country', href: '/country' }, { label: x.name }])}<h1>${esc(x.name)}</h1><p class="lede">${esc(x.region)}. ${lv ? `Solutions below are chosen for the <b>${esc(levelName(lv.id))}</b> level (from the ${esc(lv.via)}).` : 'No income group or HDI figure is available, so solutions are not filtered by level.'}</p>
${ui.table({ caption: 'Context', head: ['Dimension', 'Value'], rows: [['World Bank income group', esc(levelName(x.level) || 'not classified')], ['Human Development Index tier', hdi], ...infra] })}
<h2>Problems that rank highest at this income level</h2>${levelRank.length ? ui.list(levelRank.map(p => `${p.rank}. <a href="/problems/${esc(p.id)}">${esc(p.title)}</a> <span class="m">${Math.round(p.shortfall * 100)}% gap to target (${esc(sig(p.value))} ${esc(p.unit)}, ${esc(p.year)})</span>`)) + `<p><a href="/levels/${esc(lv.id)}">Full ranking for ${esc(levelName(lv.id))}</a></p>` : '<p>No ranking for this level yet.</p>'}
<h2>Solutions that fit here (${r.relevant.length})</h2>${sol(r.relevant)}
<h2>Less relevant here (${r.less.length})</h2><p class="m">Already widespread, a different income level, or the infrastructure gap is nearly closed.</p>${sol(r.less)}
<p class="m">Income level and infrastructure rules are judgements stated on each solution; they are a place to start, not a verdict. ${esc(String(ctx.at || '').slice(0, 10)) ? 'Snapshot ' + esc(String(ctx.at).slice(0, 10)) + '.' : ''} <a href="/country/${esc(x.iso3)}.json">JSON</a></p>`;
  return render('/country/' + x.iso3, o, { title: `${x.name}: what fits | ${SITE}`, description: `Income group, HDI tier, infrastructure and the problems and solutions that fit ${x.name}.`, body });
}

export const countryJson = (x, c, o) => { const r = solutionsFor(x, c.sols), lv = levelOf(x); return { iso3: x.iso3, name: x.name, region: x.region, income_group: x.level, level_used: lv, hdi: x.hdi, infrastructure: x.infra, relevant: r.relevant.map(({ s, reasons }) => ({ id: s.id, title: s.title, reasons, url: o + '/solutions/' + s.id })), less_relevant: r.less.map(({ s, reasons }) => ({ id: s.id, reasons })), snapshot: ctxOf(c).at, url: o + '/country/' + x.iso3 }; };

export function levelPage(id, c, o) {
  const ctx = ctxOf(c), l = LEVELS.find(v => v.id === id), d = ctx.levels && ctx.levels[id] || { ranked: [], unranked: [] };
  const members = Object.values(ctx.countries || {}).filter(x => x.level === id).sort((a, b) => a.name.localeCompare(b.name));
  const body = `${ui.breadcrumbs([{ label: 'Home', href: '/' }, { label: 'By income level', href: '/context' }, { label: l.name }])}<h1>Problems ranked for ${esc(l.name.toLowerCase())} countries</h1><p class="lede">Ranked by the gap between the group's latest figure and the same international target used for the world ranking (${esc(l.note)}, group aggregate). It ranks the size of the gap, not deaths or years of life lost.</p>
${d.ranked.length ? ui.table({ caption: `Problems ranked for ${l.name}`, head: ['Rank', 'Problem', 'Latest', 'Target', 'Gap'], rows: d.ranked.map(p => [String(p.rank), `<a href="/problems/${esc(p.id)}">${esc(p.title)}</a>`, `${esc(sig(p.value))} ${esc(p.unit)} (${esc(p.year)})`, esc(sig(p.target)), Math.round(p.shortfall * 100) + '%']) }) : ui.callout({ tone: 'warn', title: 'Not ranked yet', body: '<p>The daily refresh has not produced this group\'s series yet.</p>' })}
${d.unranked.length ? `<p class="m">No usable figure for this group: ${d.unranked.map(p => esc(p.title)).join(', ')}.</p>` : ''}
<h2>Solutions relevant at this level (${c.sols.filter(s => s.fit.levels.includes(id)).length})</h2><p><a href="/solutions?level=${esc(id)}">See them</a></p>
<h2>Countries (${members.length})</h2>${members.length ? `<p>${members.map(x => `<a href="/country/${esc(x.iso3)}">${esc(x.name)}</a>`).join(' · ')}</p>` : '<p>Country list not loaded yet.</p>'}${stale(ctx)}<p><a href="/levels/${esc(id)}.json">JSON</a></p>`;
  return render('/levels/' + id, o, { title: `Problems for ${l.name} countries | ${SITE}`, description: `Problems ranked by gap to target for ${l.name.toLowerCase()} countries.`, body });
}
export const levelJson = (id, c, o) => ({ level: id, name: levelName(id), ranking: (ctxOf(c).levels || {})[id] || { ranked: [], unranked: [] }, snapshot: ctxOf(c).at, url: o + '/levels/' + id });
