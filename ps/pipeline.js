// SPDX-License-Identifier: LicenseRef-Ultrastable-USL-1.0
// Copyright (c) 2026 Rowan Brad Quni-Gudzinas. Non-commercial use free; commercial use requires a license. See LICENSE.
// PIPELINE-1: how an item moves through the catalogue, as code. Pure functions; every input is an argument (ledgers, catalogue data, `now`).
// Stages, in order: intake -> triage -> queue (each queued problem has an advocate) -> evidence search -> solution -> verified -> benefit-cost
// -> red team -> connection leads -> synthesis. A stage count is read from a ledger some loop writes; nothing here is typed by hand.
// Substantive movement is a count that rose in a way a reader could see: a problem gained evidence or a solution, a solution was added, checked
// or modelled, a synthesis was proposed or verified, a lead was consumed. Intake alone (new indicators) is inflow, reported but never enough to
// pass the stall probe, because a scan that adds indicators every day would hide a catalogue that never grows. A run that changes no count is churn.

import { BREAKDOWN } from './problemscan.js';

export const DAY = 86400e3;
export const RULES = {
  window_days: 7,
  min_substantive_7d: 3,      // the probe fails below this many substantive moves in the window
  max_days_without_move: 3,   // ... or when no substantive move has happened for this many days
  min_history_days: 3,        // below this much history the probe reports 'warming' (unmeasured), never a pass
  max_idle_share_7d: 0.8,     // ... or when more than this share of recorded runs moved nothing
  queue_size: 12,
  patience_days: 14,          // an advocate that produced no move in this long steps aside
  cooldown_days: 30,
  history_keep_days: 60,
};
// counts that mean "the catalogue grew"; `intake` is inflow, `leads` and `queue` are bookkeeping and never count
export const SUBSTANTIVE = ['evidence_leads', 'solved_problems', 'solutions', 'evidence_items', 'verified', 'bca', 'syntheses_proposed', 'syntheses_verified', 'leads_consumed', 'redteam_findings'];
export const STAGES = [
  { id: 'intake', label: 'Intake', count: 'intake', what: 'Problems read from public indicator lists (UN SDG, WHO, World Bank)', producer: 'problemscan.yml', consumer: 'tools/pipeline.mjs (triage)' },
  { id: 'triage', label: 'Triage', count: 'triage', what: 'Problems with a measured pace, ranked by it', producer: 'problemscan.yml', consumer: 'tools/pipeline.mjs (queue)' },
  { id: 'queue', label: 'Advocate queue', count: 'queue', what: 'Ranked problems with no solution, each held by an advocate that must produce a move or step aside', producer: 'pipeline.yml', consumer: 'evidence.yml, discover.yml' },
  { id: 'evidence', label: 'Evidence search', count: 'evidence_leads', what: 'Queued problems with at least one systematic review or trial found in Europe PMC', producer: 'evidence.yml', consumer: 'discover.yml' },
  { id: 'solutions', label: 'Solutions', count: 'solutions', what: 'Solutions in the catalogue', producer: 'discover.yml, agent.yml', consumer: 'connections.yml, synth.yml' },
  { id: 'verified', label: 'Citations checked', count: 'verified', what: 'Solutions whose source was checked', producer: 'agent.yml', consumer: 'ranking, /method' },
  { id: 'bca', label: 'Benefit-cost', count: 'bca', what: 'Solutions with a modelled WELLBY benefit-cost figure', producer: 'tools/bca_precompute.mjs', consumer: '/solutions, ranking' },
  { id: 'redteam', label: 'Red team', count: 'redteam_findings', what: 'Challenges the red team recorded against entries', producer: 'redteam.yml', consumer: '/unknowns (worker tick)' },
  { id: 'connections', label: 'Connection leads', count: 'leads', what: 'Leads the knowledge graph proposed (transfer, frontier, bridge, combination)', producer: 'connections.yml', consumer: 'discover.yml (combination, transfer, frontier), pipeline.yml (queue candidates)' },
  { id: 'syntheses', label: 'Syntheses', count: 'syntheses_verified', what: 'Combinations whose citations passed the gate and are published', producer: 'synth.yml', consumer: '/syntheses' },
];

const aliasMap = (problems = []) => new Map(problems.map(p => [p.ind, p.id]));
const ids = p => Array.isArray(p) ? p : [];

// problem ids (scan ids and their hand-checked twins) that at least one catalogue solution lists
export function solvedSet({ problems = [], scan = { entries: [] }, solutions = [] }) {
  const byInd = aliasMap(problems), listed = new Set();
  for (const s of solutions) for (const id of ids(s.problem_ids)) listed.add(id);
  const out = new Set(listed);
  for (const e of scan.entries || []) if (byInd.has(e.code) && listed.has(byInd.get(e.code))) out.add(e.id);
  return out;
}

// a hand-checked problem and the scan entry for the same indicator are one problem, so a solved twin pair counts once
export function canonicalSolved(problems, scan, solved) {
  const byInd = aliasMap(problems), byId = new Map((scan.entries || []).map(e => [e.id, e]));
  return new Set([...solved].map(id => { const e = byId.get(id); return e && byInd.has(e.code) ? byInd.get(e.code) : id; })).size;
}

// candidate solutions the graph already suggests for a problem: a transfer lead names a solution proven elsewhere, a frontier lead the nearest one
export function candidatesFor(connections, problemId) {
  const out = [];
  for (const e of Object.values((connections && connections.entries) || {})) {
    if (e.status === 'dropped') continue;
    if (e.type === 'transfer' && (e.members || []).includes('p:' + problemId)) out.push((e.members.find(m => m.startsWith('s:')) || '').slice(2));
    if (e.type === 'frontier' && (e.members || []).includes('p:' + problemId) && e.via) out.push(String(e.via).replace(/^s:/, ''));
  }
  return [...new Set(out.filter(Boolean))];
}

// The advocate rule. Every queued problem has one advocate with a duty: produce a move (evidence found, a solution listed, a lead consumed) or step aside.
// A stepped-aside problem cools for `cooldown_days` and the next ranked unsolved problem takes the slot, so the queue cannot sit on the same items.
export function selectQueue({ scan, solved, connections, evidence = { items: {} }, prev = { queue: [], cooldown: {} }, now = Date.now(), rules = RULES }) {
  const items = (evidence && evidence.items) || {}, log = [];
  const cooldown = Object.fromEntries(Object.entries(prev.cooldown || {}).filter(([, until]) => Date.parse(until) > now));
  const entries = new Map((scan.entries || []).map(e => [e.id, e]));
  const kept = [];
  for (const q of prev.queue || []) {
    const e = entries.get(q.id); if (!e || solved.has(q.id)) { log.push({ id: q.id, event: solved.has(q.id) ? 'solved' : 'gone' }); continue; }
    const hits = (items[q.id] && items[q.id].hits ? items[q.id].hits.length : 0), moved = hits > (q.hits || 0);
    const next = { ...q, hits, last_move: moved ? new Date(now).toISOString() : (q.proposed && Date.parse(q.proposed) > Date.parse(q.last_move) ? q.proposed : q.last_move), turns: (q.turns || 0) + 1, candidates: candidatesFor(connections, q.id) };
    if (now - Date.parse(next.last_move) > rules.patience_days * DAY) { cooldown[q.id] = new Date(now + rules.cooldown_days * DAY).toISOString(); log.push({ id: q.id, event: 'advocate stepped aside: no move in ' + rules.patience_days + ' days' }); continue; }
    kept.push(next);
  }
  const have = new Set(kept.map(q => q.id));
  const stem = t => String(t).toLowerCase().replace(/\(.*?\)/g, '').replace(/\b(by|in) country.*$/, '').replace(/[^a-z0-9]+/g, ' ').trim().slice(0, 40), seen = new Set(kept.map(q => stem(q.title)));
  const pool = (scan.entries || []).filter(e => e.published && e.rank != null && e.lower !== null && !solved.has(e.id) && !have.has(e.id) && !cooldown[e.id] && !BREAKDOWN.test(e.title) && !/, (fe)?male\b|\bfemale\)|, (urban|rural)\b/i.test(e.title))
    .sort((a, b) => a.rank - b.rank).filter(e => { const k = stem(e.title); if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 80);
  const lead = pool.map(e => ({ e, c: candidatesFor(connections, e.id) }));
  lead.sort((a, b) => (a.c.length ? 0 : 1) - (b.c.length ? 0 : 1) || a.e.rank - b.e.rank);
  for (const { e, c } of lead) {
    if (kept.length >= rules.queue_size) break;
    const iso = new Date(now).toISOString();
    kept.push({ id: e.id, title: e.title, rank: e.rank, status: e.m && e.m.status, advocate: 'advocate:' + e.id, duty: 'find evidence, get a solution listed, or step aside after ' + rules.patience_days + ' days', since: iso, last_move: iso, turns: 0, hits: (items[e.id] && items[e.id].hits ? items[e.id].hits.length : 0), candidates: c });
    log.push({ id: e.id, event: 'advocate assigned' + (c.length ? ' (graph suggests ' + c.join(', ') + ')' : '') });
  }
  return { queue: kept, cooldown, log };
}

// Counts read from the ledgers. Every field says where it came from; a missing ledger gives null, never zero.
export function counts({ problems = [], scan, solutions = [], solved, queue = [], evidence = null, connections = null, redteam = null, verifiedSyntheses = null, discovered = null, bca = null }) {
  const pub = (scan.entries || []).filter(e => e.published);
  const evItems = solutions.reduce((n, s) => n + ((s.evidence || []).length), 0);
  const leads = connections ? Object.values(connections.entries || {}) : null;
  const redFindings = redteam && redteam.bySubject ? Object.values(redteam.bySubject).reduce((n, x) => n + ((x && x.findings) || []).length, 0) : null;
  return {
    intake: pub.length + problems.length - pub.filter(e => problems.some(p => p.ind === e.code)).length,
    triage: pub.filter(e => e.rank != null).length,
    solved_problems: canonicalSolved(problems, scan, solved),
    queue: queue.length,
    evidence_leads: evidence ? Object.values(evidence.items || {}).filter(x => x.hits && x.hits.length).length : null,
    solutions: solutions.length,
    evidence_items: evItems,
    verified: solutions.filter(s => /^checked/.test(String(s.verified || ''))).length,
    bca: bca ? Object.keys(bca).length : null,
    redteam_findings: redFindings,
    leads: leads ? leads.length : null,
    leads_open: leads ? leads.filter(e => e.status === 'new' || e.status === 'standing').length : null,
    leads_consumed: leads ? leads.filter(e => e.seeded || e.status === 'confirmed').length : null,
    syntheses_proposed: discovered ? (discovered.entries || []).length : null,
    syntheses_verified: verifiedSyntheses ? Object.values(verifiedSyntheses.entries || verifiedSyntheses).filter(x => x && x.status === 'verified').length : null,
  };
}

// History: one row per pipeline run. Rows older than `history_keep_days` go; a row identical to the last one is kept (it is the evidence of an idle run) but flagged.
export function record(history = [], c, now = Date.now(), rules = RULES, source = 'run') {
  const last = history[history.length - 1];
  const d = last ? delta(last.counts, c) : null;
  const row = { at: new Date(now).toISOString(), source, counts: c, moved: d ? d.substantive : null, intake: d ? d.intake : null };
  return [...history, row].filter(h => now - Date.parse(h.at) <= rules.history_keep_days * DAY);
}
// positive differences only: a count that fell (a problem retired) is not a move forward, and a null on either side is unmeasured
export function delta(a, b) {
  const out = { substantive: 0, intake: 0, by: {} };
  for (const k of [...SUBSTANTIVE, 'intake']) {
    if (a[k] == null || b[k] == null) continue;
    const d = Math.max(0, b[k] - a[k]); if (!d) continue;
    out.by[k] = d; if (k === 'intake') out.intake += d; else out.substantive += d;
  }
  return out;
}

// The stall probe. 'warming' means the history does not yet span the window: reported as unmeasured, never as a pass.
export function health(history, now = Date.now(), rules = RULES) {
  const from = now - rules.window_days * DAY, win = history.filter(h => Date.parse(h.at) >= from);
  const base = history.filter(h => Date.parse(h.at) < from).pop() || history[0];
  const first = base && base.counts, lastRow = history[history.length - 1];
  const span = history.length ? (now - Date.parse(history[0].at)) / DAY : 0;
  const by = {}; let substantive = 0, intake = 0;
  if (first && lastRow) { const d = delta(first, lastRow.counts); substantive = d.substantive; intake = d.intake; Object.assign(by, d.by); }
  const runs = win.filter(h => h.moved != null), idle = runs.filter(h => h.moved === 0 && !h.intake);
  const idleShare = runs.length ? idle.length / runs.length : null;
  let status = 'ok', reasons = [];
  if (span < rules.min_history_days) { status = 'warming'; reasons.push(`history spans ${span.toFixed(1)} days; the probe needs ${rules.min_history_days}`); }
  if (substantive < rules.min_substantive_7d) { status = status === 'warming' ? 'warming' : 'stalled'; reasons.push(`${substantive} substantive moves in the window, the floor is ${rules.min_substantive_7d}`); }
  const lastMove = [...history].reverse().find(h => h.moved > 0), since = lastMove ? (now - Date.parse(lastMove.at)) / DAY : null;
  if (since != null && since > rules.max_days_without_move && status === 'ok') { status = 'stalled'; reasons.push(`no substantive move for ${since.toFixed(1)} days, the ceiling is ${rules.max_days_without_move}`); }
  if (idleShare != null && idleShare > rules.max_idle_share_7d && status === 'ok') { status = 'stalled'; reasons.push(`${Math.round(idleShare * 100)}% of runs moved nothing, the ceiling is ${Math.round(rules.max_idle_share_7d * 100)}%`); }
  return { status, window_days: rules.window_days, covered_days: Number(Math.min(span, rules.window_days).toFixed(1)), days_since_substantive: since == null ? null : Number(since.toFixed(1)), substantive_moves: substantive, intake_moves: intake, by_kind: by, runs: runs.length, idle_runs: idle.length, idle_share: idleShare, reasons, trivial_note: 'Intake (new indicators) is inflow and does not count as substantive; a run that changes no count is churn.' };
}

export const pass = h => h.status !== 'stalled';
