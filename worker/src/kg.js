// SPDX-License-Identifier: LicenseRef-Ultrastable-USL-1.0
// Copyright (c) 2026 Rowan Brad Quni-Gudzinas. Non-commercial use free; commercial use requires a license. See LICENSE.
// KGRAPH-1 for Practical Solutions: every record the catalogue holds (problems and their domains, solutions with the studies behind them and
// the income levels they suit, and the agencies the outreach interface matched to them) is kept in the shared D1 knowledge graph
// (vendor/seed/knowledge.js, kept equal to the core by scripts/vendor_seed.mjs). The tick rebuilds it incrementally once an hour, and the engine
// finds what nobody listed: solutions that share problems, studies and implementers and could be offered together, agencies whose remit ties
// separate clusters, problems with no solution and solutions with no implementer. Each finding is checked later and the kinds that come true
// are trusted more. core/kgraph (the small KV graph in graph.js) stays for the page-time question loop.
// Routes: /api/graph.json, /api/graph/insights, /api/graph/node, /api/graph/method (re-measured live), /api/graph/health.
import { runKg, lastRun, kgHealth, handleKg } from '../../vendor/seed/knowledge.js';
import { PROBLEMS } from './problems.js';
import { LEVELS, fitFor } from './context.js';
import { agenciesGraph } from '../../ps/outreach_step.js';

export const TENANT = 'practical-solutions';
const levelName = Object.fromEntries(LEVELS.map(l => [l.id, l.name]));
const probById = Object.fromEntries(PROBLEMS.map(p => [p.id, p]));

export const MAPPERS = {
  problem: (p, { node, edge }) => {
    const me = node('problem', p.title, { indicator: p.ind, unit: p.unit || null, target: p.target ?? null }, 'problem:' + p.id);
    if (p.domain) edge(me, 'in_domain', node('domain', p.domain));
  },
  solution: (s, { node, edge }) => {
    const me = node('solution', s.title, { design: s.design || null, label: s.label || null }, 'solution:' + s.id);
    for (const pid of s.problem_ids || []) if (probById[pid]) edge(me, 'addresses', node('problem', probById[pid].title, {}, 'problem:' + pid));
    for (const ev of s.evidence || []) if (ev.src) edge(me, 'rests_on', node('study', ev.src, {}), { why: ev.finding ? String(ev.finding).slice(0, 300) : null });
    for (const c of s.checks || []) if (c.title) edge(me, 'checked_against', node('study', c.title, { year: c.year || null }));
    for (const lv of fitFor(s.id).levels || []) edge(me, 'fits_level', node('level', levelName[lv] || lv, {}, 'level:' + lv));
  },
  // the agency and the solutions the outreach interface matched to it; a match is a lead, not a fact, so it is kept at half weight and a
  // confirmed implementation (when one is recorded) outranks it
  agency: (a, { node, edge }) => {
    const me = node('agency', a.name, { country: a.country || null, level: a.level || null, url: a.url || null }, a.id);
    if (a.country) edge(me, 'in_country', node('country', a.country));
    for (const sec of a.sectors || []) edge(me, 'works_in', node('sector', sec));
    for (const m of a.matches || []) edge(node('solution', m.title, {}, m.src), 'may_implement', me, { weight: 0.5, why: m.why || null });
  },
};

export const SPEC = {
  predict: [{ from: 'solution', to: 'solution' }],
  via_kinds: ['problem', 'study', 'agency'],
  max_hub: 8,  // a funder or think tank matched to most solutions says nothing about any pair; only a specific shared neighbour counts
  bridge_kinds: ['agency', 'study'],
  gaps: [
    { id: 'unsolved', kind: 'problem', need: { rel: 'addresses', dir: 'in' }, weight: 0.7, text: n => `No solution in the catalogue addresses "${n.label}" yet.` },
    { id: 'no-implementer', kind: 'solution', need: { rel: 'may_implement', dir: 'out' }, weight: 0.5, text: n => `No agency has been matched to implement "${n.label}".` },
    { id: 'one-study', kind: 'solution', need: { rel: 'rests_on', dir: 'out' }, weight: 0.4, text: n => `"${n.label}" names no study it rests on.` },
  ],
  link_text: (a, b, via) => `"${a}" and "${b}" share problems, evidence or implementers (${via.slice(0, 3).join('; ')}): they could be offered together.`,
  bridge_text: (n, k) => `${n} links ${k} separate clusters of solutions: one contact that carries several of them.`,
  max_new_per_run: 5,
};

export function records(solutions, { problems = PROBLEMS } = {}) {
  const ag = agenciesGraph(solutions), title = Object.fromEntries(solutions.map(x => ['solution:' + x.id, x.title]));
  const matches = {};
  for (const e of ag.edges || []) if (title[e.src]) (matches[e.dst] = matches[e.dst] || []).push({ src: e.src, title: title[e.src], why: e.why });
  return [
    ...problems.map(p => ({ type: 'problem', source: 'problem/' + p.id, data: p })),
    ...solutions.map(s => ({ type: 'solution', source: 'solution/' + s.id, data: s })),
    ...(ag.nodes || []).map(a => ({ type: 'agency', source: 'agency/' + a.id, data: { ...a, matches: matches[a.id] || [] } })),
  ];
}

// Once an hour from the ten-minute cron: a run inside the hour is skipped, so the graph costs one rebuild an hour.
export async function graphTick(db, solutions, now = Date.now(), { every_min = 55 } = {}) {
  const last = await lastRun(db, TENANT);
  if (last && now - last.at < every_min * 60e3) return { skipped: true, last_at: last.at };
  return runKg(db, { tenant: TENANT, records: records(solutions), mappers: MAPPERS, spec: SPEC, now });
}

export const graphHealth = (db, now = Date.now()) => kgHealth(db, TENANT, now);
export const graphApi = (req, db, now = Date.now()) => handleKg(req, db, { tenant: TENANT, now });
