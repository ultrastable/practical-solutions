// SPDX-License-Identifier: LicenseRef-Ultrastable-USL-1.0
// Copyright (c) 2026 Rowan Brad Quni-Gudzinas. Non-commercial use free; commercial use requires a license. See LICENSE.
// The tenant's use of the core knowledge graph (core/kgraph, vendored): problems, solutions and implementing agencies, with provenance.
// The graph generates work: a problem with no solution, and a solution with no confirmed implementer, each become a question the loop works on.
// Agency nodes and solution -> agency edges come from the outreach interface (/agencies.json). They are matches, so they are loaded as proposed
// edges (leads); only a recorded implementation signal may confirm one. Core is tenant-agnostic; every PS-specific word lives in this file.
import { createGraph } from '../../vendor/ultrastable/kgraph/index.js';
import { PROBLEMS } from './problems.js';

export const RULES = [
  { id: 'unsolved', kind: 'problem', lacks: { rel: 'addresses', dir: 'in', to: 'solution' }, ask: n => `Which interventions have review-level or randomised evidence of reducing "${n.label}"?` },
  { id: 'unadopted', kind: 'solution', lacks: { rel: 'implementable_by', to: 'agency' }, ask: n => `Which public agency holds the remit and means to implement "${n.label}", and has it been tried there?` },
];

const memStore = () => { const m = new Map(); return { get: async k => m.get(k) ?? null, put: async (k, v) => { m.set(k, v); } }; };

/** agencies: { nodes, edges } as served by the outreach interface; optional. Returns the graph. */
export async function buildGraph({ solutions, agencies = null, problems = PROBLEMS }) {
  const g = createGraph({ store: memStore() });
  for (const p of problems) await g.addNode({ id: 'problem:' + p.id, kind: 'problem', label: p.title, props: { domain: p.domain, indicator: p.ind }, provenance: { source: 'World Bank indicator ' + p.ind, url: 'https://data.worldbank.org/indicator/' + p.ind } });
  for (const s of solutions) {
    const src = (s.evidence && s.evidence[0]) || null;
    const prov = src ? { source: src.src, url: 'https://europepmc.org/search?query=' + encodeURIComponent(String(src.src).replace(/\(.*?\)/g, '').slice(0, 160)) } : null;
    await g.addNode({ id: 'solution:' + s.id, kind: 'solution', label: s.title, props: { design: s.design || null, label: s.label || null }, provenance: prov });
    for (const pid of s.problem_ids || []) if (prov) await g.addEdge({ src: 'solution:' + s.id, rel: 'addresses', dst: 'problem:' + pid, why: src.finding, provenance: prov });
  }
  if (agencies) {
    for (const a of agencies.nodes || []) await g.addNode({ id: a.id, kind: 'agency', label: a.name, props: { country: a.country, sectors: a.sectors, level: a.level }, provenance: { source: a.source || 'official public site', url: a.url } });
    for (const e of agencies.edges || []) { try { await g.propose({ src: e.src, rel: e.rel, dst: e.dst, why: e.why }); } catch { /* the solution or agency is not in this graph */ } }
  }
  return g;
}

export async function questionsFor(g) { return g.questions(RULES); }
/** Ids of problems with no solution, for the loop's search rotation. */
export async function unsolvedProblemIds(solutions, problems = PROBLEMS) {
  const g = await buildGraph({ solutions, problems });
  return (await g.gaps(RULES.filter(r => r.id === 'unsolved'))).map(x => x.node.replace(/^problem:/, ''));
}
