// SPDX-License-Identifier: LicenseRef-Ultrastable-USL-1.0
// Copyright (c) 2026 Rowan Brad Quni-Gudzinas. Non-commercial use free; commercial use requires a license. See LICENSE.
// CHANGES-FEED-1: /changes used to show only what the Worker's own hourly tick diffed in KV (new candidate, moved estimate). Most of the loop's
// work runs in GitHub Actions (problem scan, syntheses check, knowledge graph, ensemble, pipeline) and lands as generated modules with a run time;
// that work was invisible, so a day of real runs read as "zero changes". Events here are read only from those modules' own timestamps.
import { SCAN } from './problem-scan.gen.js';
import { CONNECTIONS } from './connections.gen.js';
import { SYNTHESES_PUBLISHED } from './syntheses.gen.js';
import { ENSEMBLE_LEDGER } from './ensemble-ledger.gen.js';
import { PIPELINE } from './pipeline.gen.js';
import { GRAPH_INSIGHTS } from './graph-insights.gen.js';  // KNOWLEDGE-GRAPH-1

export function loopEvents(m = { SCAN, CONNECTIONS, SYNTHESES_PUBLISHED, ENSEMBLE_LEDGER, PIPELINE, GRAPH_INSIGHTS }) {
  const ev = [], add = (at, kind, id) => { if (at && Number.isFinite(Date.parse(at))) ev.push({ at, kind, id }); };
  const sc = m.SCAN || {};
  add(sc.at, 'problem_scan', `${Array.isArray(sc.recent) ? sc.recent.length : 0} recent indicator reading(s) checked`);
  const cn = m.CONNECTIONS || {};
  add(cn.at, 'connections_run', `${(cn.stats || {}).semantic_links ?? 0} links across ${(cn.stats || {}).nodes ?? 0} nodes`);
  const sy = m.SYNTHESES_PUBLISHED || {};
  add(sy.verified_at, 'synthesis_checked', `${(sy.published || []).length} published combination(s) re-checked against their sources`);
  const en = m.ENSEMBLE_LEDGER || {};
  add(en.at, 'ensemble_run', `${(en.totals || {}).examined ?? 0} entries examined`);
  for (const h of (m.PIPELINE || {}).history || []) if (h && h.moved > 0 && h.source === 'run') add(h.at, 'pipeline_move', `${h.moved} problem(s) moved stage`);
  // KNOWLEDGE-GRAPH-1: what the graph found (growth, new links, rising items, bridges, leads) is a change with its evidence ids
  for (const i of (m.GRAPH_INSIGHTS || {}).insights || []) if (i && /^graph_/.test(i.kind)) add(i.at, i.kind, i.id);
  return ev;
}

// The KV tick log and the loop's own runs, newest first, never two events at the same instant with the same kind and id.
export function mergeChanges(kv, events = loopEvents()) {
  const seen = new Set(), out = [];
  for (const x of [...(kv || []), ...events]) { const k = `${x.at}|${x.kind}|${x.id ?? x.problem ?? ''}`; if (!seen.has(k)) { seen.add(k); out.push(x); } }
  return out.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
}
