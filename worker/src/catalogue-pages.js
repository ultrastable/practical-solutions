// SPDX-License-Identifier: LicenseRef-Ultrastable-USL-1.0
// Copyright (c) 2026 Rowan Brad Quni-Gudzinas. Non-commercial use free; commercial use requires a license. See LICENSE.
// PROBLEM-SCAN-1 pages: the wide catalogue of problems found by scanning public statistical sources. Every entry shows where it came from and what
// the source says; an entry with no solution is shown as "solution sought". Built only from the kit.
import * as ui from './kit/index.js';
import { trendSvg } from './views.js';
import { SCAN } from './problem-scan.gen.js';
import { slug } from './catalog.js';
import { figure, rate, machine } from './numfmt.js';
import { section as uiaSection } from './uia-links.js';

const { esc } = ui, PAGE_SIZE = 24, SRC = SCAN.sources;
export const entries = (c, scan = SCAN) => scan.entries.map(e => ({ ...e, dslug: slug(e.domain), sought: !(c && c.sols || []).some(s => (s.problem_ids || []).includes(e.id)) }));
export const find = (id, scan = SCAN) => scan.entries.find(e => e.id === id) || null;
const trend = e => !e.m ? 'Recognised problem; no world figure read yet' : e.m.status === 'no trend yet' ? 'World figure read; no ten-year trend yet' : e.m.status === 'new' ? 'New: no earlier non-zero figure' : e.m.status === 'changing' ? `Changing (${e.m.dir === 'up' ? 'rising' : 'falling'}; better direction unclear)` : e.m.status === 'little change' ? 'Little change' : e.m.status === 'trend not computable' ? 'Trend not computable' : e.m.status;
const tone = e => !e.m ? 'info' : e.m.status === 'getting worse' ? 'warn' : e.m.status === 'improving' ? 'ok' : 'info';
const vector = e => { if (!e.m) return ''; const m = e.m, w = x => figure(x, e.title); if (m.status === 'new') return `${w(m.value)} in ${m.year}; the earlier figure was zero, so this is new rather than growing`; if (m.base == null) return `${w(m.value)} in ${m.year}; no earlier figure at least five years back`; return `${w(m.value)} in ${m.year}, ${m.dir === 'up' ? 'up' : m.dir === 'down' ? 'down' : 'about the same'} ${m.dir === 'flat' ? 'as' : 'from'} ${w(m.base)} in ${m.base_year}`; };
const fig = e => e.m ? `${figure(e.m.value, e.title)} (${e.m.year})${e.m.base != null ? `, ${figure(e.m.base, e.title)} in ${e.m.base_year}` : ''}` : '';
const dir = e => e.lower === true ? 'a lower figure is better' : e.lower === false ? 'a higher figure is better' : e.rule === 'taxonomy' ? 'a recognised problem; no direction measured' : 'which direction is better is not clear from the indicator';
// Where higher is better the pace is measured on the share still left out, so say so; a bare "up" beside a falling figure reads as a contradiction.
const paceWords = e => e.lower === false ? 'share still left out ' + rate(e.m.pace) : rate(e.m.pace);
export const entryJson = (e, o) => ({ id: e.id, title: e.title, domain: e.domain, source: e.source, source_name: (SRC[e.source] || {}).name, source_code: e.code, source_url: e.page, direction: dir(e), world_value: e.m ? machine(e.m.value) : null, world_value_display: e.m ? figure(e.m.value, e.title) : null, world_year: e.m ? e.m.year : null, earlier_value: e.m ? machine(e.m.base) : null, earlier_value_display: e.m && e.m.base != null ? figure(e.m.base, e.title) : null, earlier_year: e.m ? e.m.base_year : null, pace: e.m && e.m.pace != null ? machine(e.m.pace) : null, pace_display: e.m && e.m.pace != null ? paceWords(e) : null, trend: trend(e), rank: e.rank, first_seen: e.first_seen, solution_status: 'solution sought unless the entry lists solutions', url: o + '/catalogue/' + e.id });
export const indexJson = (c, o, scan = SCAN) => ({ generated_from: scan.at, rank_rule: scan.rank_rule, sources: scan.sources, count: scan.entries.length, problems: entries(c, scan).map(e => ({ ...entryJson(e, o), solution_status: e.sought ? 'solution sought' : 'has listed solutions' })) });

export function indexPage(c, u, o, page, scan = SCAN) {
  const q = u.searchParams, dom = q.get('domain') || '', src = q.get('source') || '', tr = q.get('trend') || '', text = (q.get('q') || '').toLowerCase();
  const all = entries(c, scan), domains = [...new Map(all.map(e => [e.dslug, e.domain]))].sort((a, b) => a[1].localeCompare(b[1]));
  const list = all.filter(e => (!dom || e.dslug === dom) && (!src || e.source === src) && (!tr || (e.m ? e.m.status : 'none') === tr) && (!text || e.title.toLowerCase().includes(text)));
  const pages = Math.max(1, Math.ceil(list.length / PAGE_SIZE)), pg = Math.min(pages, Math.max(1, parseInt(q.get('page'), 10) || 1)), items = list.slice((pg - 1) * PAGE_SIZE, pg * PAGE_SIZE);
  const opt = (value, label) => ({ value, label });
  const facets = ui.facets({ action: '/catalogue', reset: '/catalogue', groups: [{ name: 'domain', label: 'Domain', options: [opt('', 'Any'), ...domains.map(([s, n]) => opt(s, n))], value: dom },
    { name: 'source', label: 'Source', options: [opt('', 'Any'), ...Object.entries(SRC).map(([k, v]) => opt(k, v.name))], value: src },
    { name: 'trend', label: 'Trend', options: [opt('', 'Any'), opt('getting worse', 'Getting worse'), opt('stalled', 'Stalled'), opt('improving', 'Improving'), opt('changing', 'Changing (direction unclear)'), opt('new', 'New'), opt('none', 'No figure yet')], value: tr }] });
  const withParam = n => { const p = new URLSearchParams(q); p.delete('page'); if (n > 1) p.set('page', n); const s = p.toString(); return '/catalogue' + (s ? '?' + s : ''); };
  const worse = all.filter(e => e.m && e.m.status === 'getting worse').length, srcLines = Object.entries(SRC).map(([k, v]) => `<a href="${esc(v.home)}">${esc(v.name)}</a>: ${v.listed} listed, ${v.published || 0} published${v.error ? ' (last read failed)' : ''}`);
  const body = `${ui.breadcrumbs([{ label: 'Home', href: '/' }, { label: 'Problem catalogue' }])}<h1>Problem catalogue</h1><p class="lede">Problems found by reading the indicator lists of public statistical sources, not chosen by hand. Most have no solution listed yet; they are shown as <b>solution sought</b> so the gaps are visible. ${scan.at ? `Last scan ${esc(String(scan.at).slice(0, 10))}.` : 'The first scan has not run yet.'}</p>
${ui.stats([{ value: all.length, label: 'problems' }, { value: domains.length, label: 'domains' }, { value: all.filter(e => e.m).length, label: 'with a world figure' }, { value: worse, label: 'getting worse' }, { value: all.filter(e => e.sought).length, label: 'solution sought' }])}${facets}
<p class="m">${list.length} shown. <a href="/catalogue.json">All as JSON</a></p>${ui.cardGrid(items.map(e => ui.card({ title: e.title, href: '/catalogue/' + e.id, meta: `${e.domain} · ${(SRC[e.source] || {}).name || e.source}`, body: e.m ? `World figure: ${esc(vector(e))}.` : 'Recognised by the source; no world figure read yet.', badges: [ui.badge(trend(e), tone(e)), ui.badge(e.sought ? 'solution sought' : 'has solutions', e.sought ? 'warn' : 'ok')] })), 2)}
${list.length ? '' : ui.callout({ tone: 'warn', title: 'Nothing matches', body: '<p><a href="/catalogue">Clear the filters</a>.</p>' })}${ui.pagination({ page: pg, pages, href: withParam })}
${ui.section({ id: 'how', title: 'How these were found', body: `<p>${esc(scan.rank_rule || '')}</p>${ui.list(srcLines) || ''}` })}`;
  return page('/catalogue', o, 'Problem catalogue', 'Problems found by scanning public statistical sources, ranked by pace, with the source of each.', body, { noindex: q.toString() !== '' && !/^page=\d+$/.test(q.toString()) });
}

export function entryPage(e, c, o, page) {
  const s = SRC[e.source] || {}, sols = ((c && c.sols) || []).filter(x => (x.problem_ids || []).includes(e.id));
  const body = `${ui.breadcrumbs([{ label: 'Home', href: '/' }, { label: 'Problem catalogue', href: '/catalogue' }, { label: e.title }])}<h1>${esc(e.title)}</h1><p>${ui.badge(e.domain)}${ui.badge(trend(e), tone(e))}${ui.badge(sols.length ? 'has solutions' : 'solution sought', sols.length ? 'ok' : 'warn')}</p>
${ui.keyMessages([e.m ? `<b>What the source shows:</b> ${esc(vector(e))}; ${esc(dir(e))}; ${esc(trend(e))}.` : '<b>What the source shows:</b> the source lists this indicator; the loop has not read a world figure for it.', sols.length ? `<b>What can be done:</b> ${sols.map(x => `<a href="/solutions/${esc(x.id)}">${esc(x.title)}</a>`).join(', ')}.` : '<b>What can be done:</b> no reviewed solution is listed. The search for evidence-backed solutions is open.'])}
${e.m && trendSvg(e.m, e.title) ? ui.section({ id: 'trend', title: 'Trend', body: trendSvg(e.m, e.title) + `<p class="m">Two readings from the source, not a forecast.</p>` }) : ''}
${ui.section({ id: 'source', title: 'Where this came from', body: ui.summaryList([['Source', `<a href="${esc(s.home || '#')}">${esc(s.name || e.source)}</a>`], ['Source code', esc(e.code)], ['Source page', `<a href="${esc(e.page)}">${esc(e.page)}</a>`], ['Licence', esc(s.licence || '')], ['Found by rule', e.matched ? esc(`indicator wording contains "${e.matched}"`) : 'listed in a problem taxonomy'], ['First listed', esc(e.first_seen)], ['Direction', esc(dir(e))], ['Latest world value', e.m ? esc(`${figure(e.m.value, e.title)} (${e.m.year})`) : ''], ['Earlier value', e.m && e.m.base != null ? esc(`${figure(e.m.base, e.title)} (${e.m.base_year})`) : ''], ['Pace of change', e.m && e.m.pace != null ? esc(paceWords(e)) : ''], ['Rank by pace', e.rank ? String(e.rank) : '']]) })}
${uiaSection(e.id, esc) ? ui.section({ id: 'related', title: 'Related references', body: uiaSection(e.id, esc) }) : ''}
${ui.section({ id: 'limits', title: 'Limits', body: `<p>This entry says what a public statistics source measures. It does not say how many people are harmed, why the figure moves, or what would change it. ${esc(SCAN.rank_rule || '')}</p><p><a href="/catalogue/${esc(e.id)}.json">This entry as JSON</a></p>` })}`;
  return page('/catalogue/' + e.id, o, e.title, `${e.title}: what ${s.name || 'a public source'} shows, and whether a solution is listed yet.`, body);
}

const cq = v => { const t = String(v ?? ''); return /[",\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t; };
export function csvText(c, o, scan = SCAN) {
  const head = ['id', 'title', 'domain', 'source', 'source_code', 'world_value', 'world_year', 'earlier_value', 'earlier_year', 'pace', 'rank', 'solution_status', 'url'];
  return [head, ...entries(c, scan).map(e => [e.id, e.title, e.domain, e.source, e.code, e.m ? machine(e.m.value) : '', e.m ? e.m.year : '', e.m ? machine(e.m.base) : '', e.m ? e.m.base_year : '', e.m && e.m.pace != null ? machine(e.m.pace) : '', e.rank ?? '', e.sought ? 'solution sought' : 'has listed solutions', o + '/catalogue/' + e.id])].map(r => r.map(cq).join(',')).join('\n') + '\n';
}
