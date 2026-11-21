// SPDX-License-Identifier: LicenseRef-Ultrastable-USL-1.0
// Copyright (c) 2026 Rowan Brad Quni-Gudzinas. Non-commercial use free; commercial use requires a license. See LICENSE.
// ASK-2 (tenant side): answers that need no model and never end in "nothing found". Questions about what works, what it takes and what is still unsolved are
// answered from the catalogue itself (solutions, problems, trend of each recognised problem), every item linked to its page. When nothing matches closely,
// the closest pages and the ways to browse are returned instead of a dead end. Pure functions over the catalogue and the index: no network, no model.
import { search, tokenize } from '../../vendor/ultrastable/core/ask/index.js';

// Plain words a visitor uses, mapped to the words the pages use. Added to the question for retrieval only.
export const SYNONYMS = {
  malaria: 'insecticide treated nets bed nets', 'bed nets': 'itn malaria', water: 'drinking water chlorine sanitation', village: 'rural community', villages: 'rural community',
  child: 'children under five newborn', children: 'under five newborn', kids: 'children under five', baby: 'newborn neonatal', babies: 'newborn neonatal', deaths: 'mortality',
  die: 'mortality deaths', hunger: 'food poverty cash', poor: 'poverty cash', school: 'education learning', girls: 'women education', jobs: 'poverty livelihoods',
  power: 'electricity', electricity: 'rural electrification', cooking: 'clean cooking air', smoke: 'air clean cooking', suicide: 'mental health depression', depression: 'mental health',
  toilet: 'sanitation latrine', toilets: 'sanitation latrine', vaccine: 'immunisation', vaccines: 'immunisation', diarrhoea: 'oral rehydration zinc', diarrhea: 'oral rehydration zinc',
  money: 'cash mobile money', smoking: 'tobacco', crash: 'road helmets', crashes: 'road helmets', tb: 'tuberculosis',
};
export const expand = q => {
  const low = ' ' + String(q).toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ') + ' ', extra = [];
  for (const [k, v] of Object.entries(SYNONYMS)) if (low.includes(' ' + k + ' ')) extra.push(v);
  return extra.length ? q + ' ' + extra.join(' ') : q;
};

const WORSE = /\b(worse|worsening|getting worse|declining|deteriorat\w*|backslid\w*)\b/i, UNSOLVED = /\b(no solutions?|unsolved|without (a )?solutions?|not solved|solution sought|gaps?|missing|neglected|open problems?)\b/i;
const first = (s, n = 200) => { const t = String(s || '').replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n - 1).replace(/\s+\S*$/, '') + '…' : t; };

// Which recognised problems are getting worse and have no solution on the site yet.
export function gapAnswer(q, scan, c) {
  if (!(UNSOLVED.test(q) || (WORSE.test(q) && /solution/i.test(q))) && !(WORSE.test(q) && UNSOLVED.test(q))) return null;
  const solved = new Set((c.sols || []).flatMap(s => s.problem_ids || [])), worse = /\b(worse|worsening|declin)/i.test(q);
  const rows = (scan.entries || []).filter(e => !solved.has(e.id) && (!worse || (e.m && e.m.status === 'getting worse'))).sort((a, b) => (a.rank || 1e9) - (b.rank || 1e9)).slice(0, 8);
  if (!rows.length) return null;
  const items = rows.map(e => ({ title: e.title, url: '/catalogue/' + e.id, detail: `${e.domain}${e.m ? `: ${e.m.status}, ${Math.round(e.m.base * 100) / 100} in ${e.m.base_year} to ${Math.round(e.m.value * 100) / 100} in ${e.m.year}` : ''}. No solution on this site yet.`, type: 'catalogue' }));
  return { mode: 'structured', kind: 'gaps', answer: worse ? `These recognised problems are getting worse on the latest World Bank or UN figures and have no solution on this site yet. Each is a place where new evidence is most needed.` : `These recognised problems have no solution on this site yet.`, items, sources: items.map((x, i) => ({ n: i + 1, id: x.url.slice(1), url: x.url, title: x.title, type: x.type })), more: { label: 'See all open questions', href: '/connections' } };
}

// Solutions first: what works, what it takes, where it is proven, what limits it. Retrieval over solutions, new solutions and problems only.
export function solutionAnswer(q, index, c, { k = 4 } = {}) {
  const docs = new Map(index.docs.map(d => [d.id, d])), sols = new Map((c.sols || []).map(s => [s.id, s]));
  const hits = search(index, expand(q), { k: 24 }).filter(h => /^(solutions|syntheses)\//.test(h.id) || /^problems\//.test(h.id));
  const out = [], seen = new Set();
  const add = id => { if (seen.has(id) || out.length >= k) return; const s = sols.get(id.replace(/^solutions\//, '')); if (!s || !id.startsWith('solutions/')) return; seen.add(id); out.push(s); };
  const direct = hits.filter(h => h.id.startsWith('solutions/')), top = direct.length ? direct[0].score : 0;
  for (const h of direct) if (h.score >= 0.5 * top) add(h.id);
  if (out.length < 2) for (const h of hits) if (h.id.startsWith('problems/')) for (const s of c.byProblem[h.id.slice(9)] || []) add('solutions/' + s.id);
  if (!out.length) return null;
  const items = out.map(s => ({ title: s.title, url: '/solutions/' + s.id, detail: `${first(s.claim, 220)} Takes: ${first(s.takes, 160)} Limit: ${first(s.limits, 140)}`, type: 'solution' }));
  return { mode: 'structured', kind: 'solutions', answer: out.length === 1 ? 'One solution on this site matches, with evidence, what it takes and where it has been proven.' : `${out.length} solutions on this site match. Each links to its evidence, what it takes to start and what limits it.`, items, sources: items.map((x, i) => ({ n: i + 1, id: x.url.slice(1), url: x.url, title: x.title, type: x.type })), more: { label: 'Browse all solutions', href: '/solutions' } };
}

// Never a dead end: the closest pages at any score, plus ways to keep looking.
export function relatedAnswer(q, index, c = { sols: [] }) {
  const hits = search(index, expand(q), { k: 6 }).filter(h => h.score > 0).slice(0, 5);
  let items = hits.map(h => ({ title: h.title, url: h.url, detail: first(h.text, 200), type: h.type }));
  if (!items.length) items = (c.sols || []).slice(0, 4).map(s => ({ title: s.title, url: '/solutions/' + s.id, detail: first(s.claim, 200), type: 'solution' }));
  return { mode: 'related', kind: 'related', answer: items.length ? 'The site has no page that answers this directly. These are the closest pages.' : 'The site has no page on this yet, which may be a gap we have not covered. Here are some solutions to start from.', items, sources: items.map((x, i) => ({ n: i + 1, id: x.url.slice(1), url: x.url, title: x.title, type: x.type })), more: { label: 'Browse the problem catalogue', href: '/catalogue' } };
}
