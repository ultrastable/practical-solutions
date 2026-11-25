// SPDX-License-Identifier: LicenseRef-Ultrastable-USL-1.0
// Copyright (c) 2026 Rowan Brad Quni-Gudzinas. Non-commercial use free; commercial use requires a license. See LICENSE.
// IMPACT-LOOP-1 tenant side. The loop (series, plateau detection, lever ranking, prediction settling) is core's (vendor/ultrastable/core/impact); this file holds only what is
// Practical Solutions' own: which numbers are its impact and reach, what each lever files, and the ratchet that keeps the targets rising. Pure; tools/impactloop.mjs does the I/O.
import { problemCounts, entries } from '../worker/src/catalogue-pages.js';
import { record, plan, settle } from '../vendor/ultrastable/core/impact/index.js';
export { record, settle };
const r3 = x => Math.round(x * 1e3) / 1e3;
export const week = (now = Date.now()) => Math.floor(now / (7 * 86400e3));

// The five numbers on /impact, read from the catalog and the reach counters. A reading that cannot be computed is left out, never zero.
export function readings(cat, reach) {
  const sols = cat.sols, probs = cat.probs, r = {};
  if (sols.length) { r['impact.ready_share'] = r3(sols.filter(s => s.impl && s.impl.score >= 7).length / sols.length); r['impact.held_back'] = sols.filter(s => s.impl && !s.impl.practical).length; }
  if (probs.length) r['impact.problems_covered'] = r3(probs.filter(p => (cat.byProblem[p.id] || []).some(s => s.impl && s.impl.practical)).length / probs.length);
  if (probs.length) r['impact.problems_seeking'] = problemCounts(cat).sought;
  if (probs.length) r['impact.catalogue_size'] = sols.length + probs.length;
  if (reach && Number.isFinite(reach.views)) r['reach.views_30d'] = reach.views;
  return r;
}

// Targets only rise: a share aims 5 points above the best it has held (capped at 1), a count 10 % above, so a met target is replaced by the next one and the loop never idles.
export function metrics(rd, series = {}) {
  const best = id => Math.max(0, ...(series[id] || []).map(p => p.v), rd[id] ?? 0);
  const out = [];
  if (rd['impact.ready_share'] != null) out.push({ id: 'impact.ready_share', value: rd['impact.ready_share'], target: Math.min(1, Math.max(0.6, r3(best('impact.ready_share') + 0.05))) });
  if (rd['impact.held_back'] != null) out.push({ id: 'impact.held_back', value: rd['impact.held_back'], target: 0, op: '<=' });
  if (rd['impact.problems_covered'] != null) out.push({ id: 'impact.problems_covered', value: rd['impact.problems_covered'], target: Math.min(1, Math.max(0.9, r3(best('impact.problems_covered') + 0.05))) });
  if (rd['impact.problems_seeking'] != null) out.push({ id: 'impact.problems_seeking', value: rd['impact.problems_seeking'], target: Math.max(0, Math.floor(Math.min(rd['impact.problems_seeking'], ...(series['impact.problems_seeking'] || []).map(p => p.v)) * 0.95)), op: '<=' });
  if (rd['impact.catalogue_size'] != null) out.push({ id: 'impact.catalogue_size', value: rd['impact.catalogue_size'], target: Math.ceil(best('impact.catalogue_size') * 1.1) });
  if (rd['reach.views_30d'] != null) out.push({ id: 'reach.views_30d', value: rd['reach.views_30d'], target: Math.ceil(Math.max(1000, best('reach.views_30d') * 1.1)) });
  return out;
}

const issue = (key, title, body, extra = {}) => ({ key, title, body: `${body}\n\nFiled by the impact loop (IMPACT-LOOP-1, \`ps/impactloop.js\`). Done: the next reading of the metric named in the prediction moves toward its target; a changed fact must cite its source. Closing probe: \`node --no-warnings tools/impactloop.mjs --status\`.\n\nPaths: worker/src/implementability.js, worker/src/solutions.js\n\nEvidence rule: change a fact only when a source already in this repository supports it (the entry's own citations, ledger/evidence-leads.json, ledger/syntheses-verified.json). Never invent a figure, a programme or a citation. With no supporting source, make no change to the facts: add the limiting reason to the entry's \`limits\` text, or leave the file unchanged and say why in the summary.`, labels: ['idea', 'impact-loop'], ...extra });
export function levers(cat, now = Date.now()) {
  const named = id => (cat.sols.find(s => s.id === id) || {}).title || id;
  const held = cat.sols.filter(s => s.impl && !s.impl.practical), effort = cat.sols.filter(s => s.impl && s.impl.practical && s.impl.score < 7);
  const bare = cat.probs.filter(p => !(cat.byProblem[p.id] || []).some(s => s.impl && s.impl.practical));
  const wk = week(now);
  return {
    'impact.held_back': [{ id: 'held', propose: () => held.map(s => issue(`held:${s.id}`, `Impact: make "${named(s.id)}" practical or say why it cannot be`, `"${named(s.id)}" scores ${s.impl.score} (cost ${s.impl.cost}, adoption ${s.impl.adoption}, channel ${s.impl.channel || 'none'}) and is held back. Search the literature and programme reports for adoption beyond trials, a low-cost delivery variant or a delivery channel; update the facts in worker/src/implementability.js with citations, or add the limit to the entry.`, { expected_step: 1 })) }],
    'impact.ready_share': [{ id: 'raise-ready', propose: () => effort.map(s => issue(`ready:${s.id}`, `Impact: what keeps "${named(s.id)}" from ready to implement`, `"${named(s.id)}" scores ${s.impl.score}; ready needs 7. Name the limiting fact (cost ${s.impl.cost}, adoption ${s.impl.adoption}, channel ${s.impl.channel || 'none'}) and look for evidence that changes it: a cheaper delivery model, programme-scale adoption, a channel that exists. Update worker/src/implementability.js only with a cited source.`, { expected_step: 1 / Math.max(1, cat.sols.length) })) }],
    'impact.problems_covered': [{ id: 'cover-problem', propose: () => bare.map(p => issue(`cover:${p.id}`, `Impact: find a practical solution for "${p.title}"`, `Problem \`${p.id}\` (${p.domain}) has no solution scored practical. Find the best-evidenced intervention that is implementable (a delivery channel, adoption beyond trials), add it to worker/src/solutions.js with sources and its implementability facts.`, { expected_step: 1 / Math.max(1, cat.probs.length) })) }],
    'impact.problems_seeking': [{ id: 'solve-sought', propose: () => entries(cat).filter(e => e.sought).sort((a, b) => (a.rank ?? 1e9) - (b.rank ?? 1e9)).slice(0, 3).map(e => issue(`seek:${e.id}`, `Impact: find a practical solution for catalogue problem "${e.title}"`, `Catalogue entry \`${e.id}\` (${e.domain}, rank ${e.rank ?? 'unranked'}) lists no solution; the home page counts it as still seeking one. Find the best-evidenced intervention, add it with sources, and link it to this problem id.`)) }],
    'impact.catalogue_size': [{ id: 'grow-catalogue', propose: () => [issue(`grow:${wk}`, 'Impact: add the next problem and its solutions by the selection rule', 'Take the next problem from the data-driven problem bank (ledger/problem-bank.json, ranked by the selection rule) that is not yet in the catalogue; add it with at least one evidence-graded solution and its implementability facts, all with sources.', { expected_step: 2 })] }],
    'reach.views_30d': [
      { id: 'reindex', propose: () => [issue(`reach:index:${wk}`, 'Reach: resubmit the sitemap and check indexing', 'Dispatch the indexnow workflow and confirm the sitemap lists every page (a page missing from /sitemap.xml cannot be found).', { action: { workflow: 'indexnow.yml' }, expected_step: 100 })].map(i => ({ ...i, labels: ['impact-loop'], no_agent: true })) },
      { id: 'surface', propose: () => [issue(`reach:surface:${wk}`, 'Reach: link the least-linked pages and add them to the feeds', 'Find the pages with the fewest internal links and no feed entry (use /sitemap.xml against /feed.json), add links from related entries and add them to the feed, so readers and crawlers reach them.', { expected_step: 100 })] },
    ],
  };
}

export function run({ cat, reach, hist = {}, ledger = [], open = [], now = Date.now(), cap = 3 }) {
  const rd = readings(cat, reach), series = record(hist, rd, now), settled = settle(ledger, rd, now);
  const p = plan({ metrics: metrics(rd, hist), series, levers: levers(cat, now), ledger: settled, open, now, cap });
  return { readings: rd, series, ledger: settled, ...p };
}
