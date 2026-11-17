// SPDX-License-Identifier: LicenseRef-Ultrastable-USL-1.0
// Copyright (c) 2026 Rowan Brad Quni-Gudzinas. Non-commercial use free; commercial use requires a license. See LICENSE.
// The encyclopedia's data model: problems, solutions, domains, cross-links, evidence labels, source links and search.
// Pure functions over plain data, so every page and the JSON index come from the same place and can be tested.
import { PROBLEMS } from './problems.js';
import { SOLUTIONS } from './solutions.js';
import { verifiedText } from './improve.js';
import { implementability } from './implementability.js';
import { bcaFor } from './bca.js';
import { fitFor } from './context.js';

// strongest cited design and the overall reading for the older entries; newer entries carry these fields themselves
const ANNOT = {
  kmc: ['trial', 'works'], 'ors-zinc': ['review', 'works'], chlorine: ['review', 'works'], itn: ['review', 'works'], tarl: ['trial', 'works'],
  immunisation: ['trial', 'works'], vita: ['review', 'works'], cash: ['trial', 'works'], hypertension: ['observational', 'works'], 'friendship-bench': ['trial', 'works'],
};
export const DESIGN = {
  review: { rank: 4, name: 'Systematic review or meta-analysis', note: 'Pools many studies; the strongest design cited.' },
  trial: { rank: 3, name: 'Randomised trial', note: 'Participants or places assigned by chance.' },
  observational: { rank: 2, name: 'Observational study', note: 'Compares groups without random assignment; confounding is possible.' },
  guidance: { rank: 1, name: 'Expert guidance', note: 'A recommendation, not a measurement.' },
};
export const LABELS = {
  'evidence-backed': 'Cites a systematic review or randomised trial, with its own figures.',
  'mixed evidence': 'The cited studies disagree or found limited benefit. Shown because a mixed result is part of the evidence.',
  'cited, weaker design': 'Cites an observational study or guidance only.',
  lead: 'Found automatically by the loop and checked only mechanically. A place to look, not a conclusion.',
};

export const RULE = 'Score 3 to 8 = cost to start (low 3, medium 2, high 1) + real-world adoption (scaled 3, piloted 2, trial-only 1) + an existing delivery channel (2). 7 or more is ready to implement; 5 or 6 is implementable with effort; below 5 is held back as not yet practical.';
export const slug = s => String(s).toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
export const esc = s => String(s ?? '').replace(/[<>&"']/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' }[c]));

export function labelOf(s) {
  if (s.verdict === 'mixed') return 'mixed evidence';
  return (DESIGN[s.design] || { rank: 0 }).rank >= 3 ? 'evidence-backed' : 'cited, weaker design';
}

// Where a reader can check a citation. The loop adds a DOI or PMID when it finds the paper; until then the link is a search on the citation text.
export function sourceLinks(sol, ver) {
  const found = ((ver && ver.status === 'verified' && ver.detail) || []).filter(d => d.ok);
  const direct = found.flatMap(d => [d.doi ? { label: 'DOI ' + d.doi, url: 'https://doi.org/' + d.doi, kind: 'doi' } : null, d.pmid ? { label: 'PubMed ' + d.pmid, url: 'https://pubmed.ncbi.nlm.nih.gov/' + d.pmid + '/', kind: 'pubmed' } : null]).filter(Boolean);
  return (sol.evidence || []).map((e, i) => ({
    cite: e.src, finding: e.finding,
    search: 'https://europepmc.org/search?query=' + encodeURIComponent(String(e.src).replace(/\(.*?\)/g, '').slice(0, 160)),
    direct: i === 0 ? direct : [],
  }));
}

export function buildCatalog({ problems, solutions, verif = {}, cands = {}, drafts = {}, spots = {}, changes = [], lastTick = null, bcaState = null }) {
  const ranked = (problems && problems.problems) || [];
  const rankOf = Object.fromEntries(ranked.map(p => [p.id, p]));
  const probs = PROBLEMS.map(p => ({ ...p, ...(rankOf[p.id] || {}), ranked: !!rankOf[p.id], dslug: slug(p.domain) }));
  const sols = (solutions || SOLUTIONS).map(({ checks, ...s }) => {
    const a = ANNOT[s.id];
    const full = { ...s, design: s.design || (a && a[0]) || 'guidance', verdict: s.verdict || (a && a[1]) || 'limited' };
    const v = verif[s.id];
    const impl = implementability(s.id), bca = bcaFor(s.id, bcaState), fit = fitFor(s.id);
    return { ...full, impl, bca, fit, label: labelOf(full), verified: verifiedText(v) || s.verified, ver: v || null, links: sourceLinks(s, v), checkable: !!(checks && checks.length),
      domains: [...new Set((s.problem_ids || []).map(id => (PROBLEMS.find(p => p.id === id) || {}).domain).filter(Boolean))] };
  });
  const byProblem = Object.fromEntries(probs.map(p => [p.id, sols.filter(s => (s.problem_ids || []).includes(p.id))]));
  const domains = [...new Set(probs.map(p => p.domain))].map(d => ({ name: d, slug: slug(d), problems: probs.filter(p => p.domain === d), solutions: sols.filter(s => s.domains.includes(d)) }));
  const leads = Object.fromEntries(probs.map(p => [p.id, {
    candidates: ((cands[p.id] || {}).items || []), searched_at: (cands[p.id] || {}).at || null,
    drafts: Object.values(drafts).filter(d => d.problem === p.id && d.status === 'reviewed'),
    spots: (spots[p.id] || {}).spots || [], spots_note: (spots[p.id] || {}).note || null, spots_at: (spots[p.id] || {}).at || null,
  }]));
  const related = s => sols.filter(o => o.id !== s.id && (o.problem_ids || []).some(id => (s.problem_ids || []).includes(id)));
  return { probs, sols, byProblem, domains, leads, related, changes, lastTick, rankedAt: (problems && problems.at) || null };
}

// A small keyword index over problems and solutions: every word in a query must appear; titles weigh more than bodies.
export function searchIndex(c) {
  return [
    ...c.probs.map(p => ({ type: 'problem', id: p.id, url: '/problems/' + p.id, title: p.title, text: [p.domain, p.unit, p.target_src].join(' ') })),
    ...c.sols.map(s => ({ type: 'solution', id: s.id, url: '/solutions/' + s.id, title: s.title, text: [s.problem, s.claim, s.domains.join(' '), (s.evidence || []).map(e => e.src + ' ' + e.finding).join(' ')].join(' ') })),
  ];
}
export function search(index, q) {
  const words = String(q || '').toLowerCase().split(/\W+/).filter(w => w.length > 1);
  if (!words.length) return [];
  return index.map(r => {
    const t = r.title.toLowerCase(), b = r.text.toLowerCase();
    if (!words.every(w => t.includes(w) || b.includes(w))) return null;
    return { ...r, score: words.reduce((n, w) => n + (t.includes(w) ? 3 : 1), 0) };
  }).filter(Boolean).sort((a, b) => b.score - a.score).slice(0, 40);
}

// Questions the loop is working on for a problem, derived from the data, not written by hand.
export function openQuestions(p, c) {
  const n = (c.byProblem[p.id] || []).length, L = c.leads[p.id];
  const q = [];
  if (!n) q.push(`No reviewed solution is listed for "${p.title}". Which interventions have randomised or review-level evidence of reducing it?`);
  else q.push(`Which of the ${n} listed solution${n > 1 ? 's' : ''} for "${p.title}" works at what cost per person helped, and where?`);
  if (!L.spots.length) q.push(`Which countries do better on ${p.title.toLowerCase()} than their income predicts, and what do they do differently?`);
  else q.push(`What do ${L.spots.slice(0, 3).map(s => s.name).join(', ')} do differently? They beat their income-predicted level in two periods.`);
  if (!L.drafts.length && !L.candidates.length) q.push('Are there recent systematic reviews on this problem that the loop has not yet found?');
  return q;
}
