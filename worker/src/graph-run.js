// SPDX-License-Identifier: LicenseRef-Ultrastable-USL-1.0
// Copyright (c) 2026 Rowan Brad Quni-Gudzinas. Non-commercial use free; commercial use requires a license. See LICENSE.
// KNOWLEDGE-GRAPH-1: the catalogue's records and one run of core/datagraph over them. Pure (no file access), so the Worker bundle can import it for the method claim;
// tools/graph.mjs does the reading and writing.
import * as D from '../../vendor/ultrastable/core/datagraph/index.js';
import { PROBLEMS } from './problems.js';
import { SOLUTIONS } from './solutions.js';
import { SCAN } from './problem-scan.gen.js';
import { SYNTHESES } from './syntheses-data.js';
export function records({ problems = PROBLEMS, solutions = SOLUTIONS, scan = SCAN, syntheses = SYNTHESES } = {}) {
  const byInd = new Map(problems.map(p => [p.ind, p.id])), alias = new Map(), pr = [], so = [], co = [], refs = [];
  for (const p of problems) pr.push({ id: 'p:' + p.id, title: p.title, domain: p.domain || '' });
  for (const e of scan.entries || []) { if (byInd.has(e.code)) { alias.set(e.id, byInd.get(e.code)); continue; } pr.push({ id: 'p:' + e.id, title: e.title, domain: e.domain || '' }); }
  const pid = id => 'p:' + (alias.get(id) || id);
  for (const s of solutions) { so.push({ id: 's:' + s.id, title: s.title }); for (const x of s.problem_ids || []) refs.push(['s:' + s.id, pid(x), 'solves']); }
  for (const x of syntheses) { const id = 'x:' + (x.id || (x.components || []).join('+')); co.push({ id, title: x.title || (x.components || []).join(' + ') }); for (const c of x.components || []) refs.push([id, 's:' + c, 'combines']); }
  return { tables: [{ name: 'problem', rows: pr, label: 'title' }, { name: 'solution', rows: so, label: 'title' }, { name: 'combination', rows: co, label: 'title' }], refs };
}
const KIND = { orphans: 'graph_orphans', bridge: 'graph_bridge', 'new-hub': 'graph_hubs', fragmenting: 'graph_growth', link: 'graph_lead' };
export function run({ prev = null, conn = { candidates: [] }, now = new Date().toISOString(), recs = records() } = {}) {
  const g = D.extract(recs.tables, { maxRowsPerTable: 20000, at: now }), ids = new Set(g.nodes.map(n => n.id));
  const N = { p: 'problem', s: 'solution', x: 'combination' }, nid = x => N[x[0]] + ':' + x;
  for (const [a, b, rel] of recs.refs) if (ids.has(nid(a)) && ids.has(nid(b))) g.edges.push({ src: nid(a), rel, dst: nid(b), confidence: 1, source: 'catalogue', at: now });
  for (const c of conn.candidates || conn.open || []) { const m = c.members || []; if (m.length === 2 && N[m[0][0]] && N[m[1][0]] && ids.has(nid(m[0])) && ids.has(nid(m[1]))) g.edges.push({ src: nid(m[0]), rel: 'similar', dst: nid(m[1]), confidence: c.score || 0.5, status: 'proposed', source: 'core/discover', at: now }); }
  const an = D.analyze(g), cand = D.predict(g), ins = D.insights({ analysis: an, candidates: cand, previous: prev });
  const stats = { nodes: an.nodes, edges: an.edges, components: an.components, orphans: an.orphans, by_kind: an.by_kind };
  const snapshot = { at: now, ...stats, hubs: an.hubs.map(h => ({ id: h.id, label: h.label, kind: h.kind })), communities: an.communities.length };
  const insights = ins.map(i => ({ at: now, kind: KIND[i.kind] || 'graph_' + i.kind.replace(/\W/g, '_'), id: i.text, evidence: [i.subject], conf: 'computed' }));
  return { stats, snapshot, insights, leads: cand.slice(0, 20).map(c => ({ a: c.src, b: c.dst, why: c.why, score: c.score })), analysis: an };
}

