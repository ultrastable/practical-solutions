// SPDX-License-Identifier: LicenseRef-Ultrastable-USL-1.0
// Copyright (c) 2026 Rowan Brad Quni-Gudzinas. Non-commercial use free; commercial use requires a license. See LICENSE.
// Pages for SYNTHESES-1: new solutions made by transfer or combination. Only syntheses whose every citation passed the gate are rendered.
import * as ui from './kit/index.js';
import { SYNTHESES_PUBLISHED as D } from './syntheses.gen.js';

const { esc } = ui;
const r2 = n => (Math.abs(n) >= 10 ? Math.round(n) : Math.round(n * 100) / 100);
export const published = (d = D) => d.published;
export const find = (id, d = D) => d.published.find(s => s.id === id);

export function synthesisJson(s, o) {
  return { id: s.id, title: s.title, status: 'proposed combination, not yet tested as a combination', headline: s.headline, domain: s.domain, problem: s.problem, transfer: s.transfer, mechanism: s.mechanism, components: s.components,
    evidence: s.citations.map(c => ({ role: c.role, cite: c.cite, supports: c.supports, doi: (s.verification.citations[c.id] || {}).doi || null, verified: (s.verification.citations[c.id] || {}).found === true })),
    closest_prior_work: s.verification.novelty, benefit_cost: { metric: 'WELLBY per USD 1,000', per_1000_usd: s.bca.wellby_per_1000_usd, cost_per_daly: s.bca.cost_per_daly || null, evidence_share: s.bca.evidence_share, prob_net_positive: s.bca.prob_net_positive, cost_assumption: s.cost_note },
    first_test: s.first_test, who: s.who, takes: s.takes, risks: s.risks, limits: s.limits, verified_at: s.verification.checked_at, url: o + '/syntheses/' + s.id };
}
export const indexJson = (o, d = D) => ({ schema: 'ps-syntheses/1', verified_at: d.verified_at, count: d.published.length, awaiting_verification: d.pending.length, syntheses: d.published.map(s => synthesisJson(s, o)) });

const doiLink = c => c && c.doi ? `<a href="https://doi.org/${esc(c.doi)}">doi:${esc(c.doi)}</a>` : '';
function evidenceTable(s) {
  return ui.table({ caption: 'Every source, checked against the Crossref register of published papers', head: ['Source', 'What it shows', 'Role', 'Check'], rows: s.citations.map(c => { const v = s.verification.citations[c.id] || {};
    return [`${esc(c.cite)} ${doiLink(v)}`, esc(c.supports), esc(c.role), v.found ? `title and year found${v.numbers_checked ? `; quoted figure${v.numbers_checked.quoted.length > 1 ? 's' : ''} ${esc(v.numbers_checked.quoted.join(', '))} found in the abstract` : ''}` : 'not verified']; }) });
}
function priorWork(s) {
  if (!s.verification.novelty.length) return `<p>${esc(s.novelty.statement)}</p><p><b>The prior-work search was unavailable at the last check, so nothing is claimed about whether this has been tried.</b> It reruns daily.</p>`;
  const any = s.verification.novelty.some(n => n.possible_prior_work);
  return `<p>${esc(s.novelty.statement)}</p><p><b>${any ? 'A search result may describe closely related work: read it before relying on this entry.' : 'No search result has a title naming this combination.'}</b> A search is not proof that nothing exists.</p>` +
    s.verification.novelty.map(n => `<h3>${esc(n.label)}</h3>${ui.list(n.closest.map(c => `${c.hit ? '<b>possible match:</b> ' : ''}<a href="${esc(c.url)}">${esc(c.title)}</a> <span class="m">${esc(c.year)}</span>`))}`).join('');
}
function bcaBlock(s) {
  const b = s.bca, w = b.wellby_per_1000_usd, ev = b.evidence_share || {}, weak = Math.round(100 * ((ev.C || 0) + (ev.D || 0)));
  return `<p>Estimated benefit: <b>${r2(w.p50)} WELLBYs per USD 1,000</b> (middle estimate; 5% to 95% range ${r2(w.p5)} to ${r2(w.p95)}), counting side effects and spill-overs. ${b.cost_per_daly ? `Direct effect only: about USD ${b.cost_per_daly.low.toLocaleString('en')} to ${b.cost_per_daly.high.toLocaleString('en')} per healthy year of life gained.` : ''} Chance the net effect is positive: ${Math.round(100 * b.prob_net_positive)}%.</p>
<p><b>${weak}% of this estimate rests on assumptions or weak evidence</b> (grades C and D), not on a measured result for this combination. ${esc(s.cost_note)} The pilot below exists to replace these assumptions with measurements.</p>
<p class="m">For scale, the catalogue's cash-transfer entry is 7.55 WELLBYs per USD 1,000, from a published analysis. WELLBYs are one common measure, not the only value of an intervention. <a href="/method#benefit-cost">How the estimate is made</a>.</p>
${ui.table({ caption: 'Links in the estimate and how well each is sourced', head: ['Link', 'Kind', 'Grade', 'Source'], rows: b.nodes.map(n => [esc(n.label), esc(n.kind), esc(n.grade), esc(n.source)]) })}`;
}

export function synthesisPage(s, o, page) {
  const body = `${ui.breadcrumbs([{ label: 'Home', href: '/' }, { label: 'New solutions', href: '/syntheses' }, { label: s.title }])}
<h1>${esc(s.title)}</h1>
<p class="lede">${esc(s.headline)}</p>
<p>${ui.badge('Proposed combination, not yet trialled as one', 'warn')} ${ui.badge('Every source verified', 'ok')} <span class="m">${esc(s.domain)} · checked ${esc(String(s.verification.checked_at).slice(0, 10))}</span></p>
${ui.section({ id: 'new', title: 'What is new', body: `<p><b>Taken from:</b> ${esc(s.transfer.from)}.</p><p><b>Applied to:</b> ${esc(s.transfer.to)}.</p><p>${esc(s.mechanism)}</p><p>The parts are supported by the studies below. The combination is a hypothesis, which is why the first test below is designed to be able to fail.</p>` })}
${ui.section({ id: 'evidence', title: 'Evidence for each part', body: evidenceTable(s) })}
${ui.section({ id: 'prior', title: 'Closest prior work', body: priorWork(s) })}
${ui.section({ id: 'benefit-cost', title: 'Benefit and cost', body: bcaBlock(s) })}
${ui.section({ id: 'do', title: 'How to do it', body: `<p><b>Who:</b> ${esc(s.who)}</p><p><b>What it takes:</b> ${esc(s.takes)}</p><p><b>Cheapest first test:</b> ${esc(s.first_test)}</p>` })}
${ui.section({ id: 'risks', title: 'What could go wrong', body: ui.list(s.risks.map(esc)) + `<p>${esc(s.limits)}</p>` })}
<p class="m">Machine-readable: <a href="/syntheses/${esc(s.id)}.json">JSON</a>. Related catalogue entries: ${s.components.map(c => `<a href="/solutions/${esc(c)}">${esc(c)}</a>`).join(', ')}. Found an error? <a href="https://github.com/ultrastable/practical-solutions/issues/new">Tell us</a>.</p>`;
  return page('/syntheses/' + s.id, o, s.title, s.headline, body);
}

export function synthesesIndex(o, page, d = D) {
  const cards = d.published.map(s => ui.card({ title: s.title, href: '/syntheses/' + s.id, body: s.headline, meta: `${s.domain} · ${r2(s.bca.wellby_per_1000_usd.p50)} WELLBYs per USD 1,000 (assumption-heavy)`, badges: [ui.badge('Proposed combination', 'warn')] }));
  const body = `${ui.breadcrumbs([{ label: 'Home', href: '/' }, { label: 'New solutions' }])}<h1>New solutions</h1>
<p class="lede">Combinations and transfers of proven interventions that no published trial has tested as a whole. Each part is cited and checked against the register of published papers; the combination is a hypothesis with a cheap first test, a benefit-cost estimate and a list of what could go wrong.</p>
${cards.length ? ui.cardGrid(cards) : '<p>No synthesis has passed verification yet.</p>'}
<p class="m">${d.pending.length ? `${d.pending.length} further candidate(s) are waiting for their sources to be verified and are not shown. ` : ''}A synthesis is shown only when every source and quoted figure is found. <a href="/syntheses.json">All as JSON</a> · <a href="/method">Method</a></p>`;
  return page('/syntheses', o, 'New solutions', 'Evidence-backed combinations of proven interventions that nobody has tried together yet, with benefit-cost estimates and cheap first tests.', body);
}
