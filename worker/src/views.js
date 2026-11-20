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
