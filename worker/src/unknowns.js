// SPDX-License-Identifier: LicenseRef-Ultrastable-USL-1.0
// Copyright (c) 2026 Rowan Brad Quni-Gudzinas. Non-commercial use free; commercial use requires a license. See LICENSE.
// What this site does not know, in public. The generic engine is core/ignorance (vendored); this file maps the catalogue into the
// engine's subjects, runs it from the improvement tick, and renders known unknowns and red-team findings on every entry, on /unknowns
// and in /method. Findings are challenges shown beside an entry; they never change the entry's own claims.
import { createRegistry, run, minersFor, publicView, KINDS, UIA, findingToGap, sanitizeModel } from '../../vendor/ultrastable/core/ignorance/index.js';
import { modelFor } from '../../vendor/ultrastable/core/ignorance/org.js';
import * as ui from './kit/index.js';
import { esc } from './catalog.js';

export const KEY = 'ignorance:v1', LAST = 'ignorance:last';
const REGION = { known_unknown: 'Known unknowns', unknown_unknown: 'Challenges from the red team', ignorance_about_ignorance: 'How much has not been examined' };
const KIND_LABEL = { red_team: 'Red team', inversion: 'Inversion', premortem: 'Pre-mortem', missing_edge: 'Missing link', untested_assumption: 'Untested assumption', evidence_gap: 'Evidence gap', contradiction: 'Disagreement', unexplored_domain: 'Unexplored area', estimate_gap: 'Estimate gap', audit_coverage: 'Coverage' };

// catalogue entries as engine subjects; the benefit-cost result supplies the estimate and its higher-order links when there is one
export function subjectsFrom(c) {
  const sols = c.sols.map(s => {
    const b = s.bca && !s.bca.error ? s.bca : null, w = b && b.wellby_per_1000_usd;
    return { id: s.id, type: 'solution', title: s.title, claim: s.claim, domain: s.domains[0], domains: s.domains, evidence: s.evidence, design: s.design, verdict: s.verdict, works_where: s.works_where, limits: s.limits, who: s.who,
      assumptions: s.assumptions || [], problem_ids: s.problem_ids, checked: s.checkable ? /checked/.test(String(s.verified)) && !/not yet/.test(String(s.verified)) : undefined,
      effect: w ? { value: w.p50, low: w.p5, high: w.p95, unit: 'WELLBYs per USD 1,000' } : null,
      bca: b ? { higher_order: b.nodes.filter(n => n.order >= 2 || n.kind === 'unintended').map(n => n.label), counterfactual: b.counterfactual || null, prob_net_positive: b.prob_net_positive,
        weak_share: (b.evidence_share.C || 0) + (b.evidence_share.D || 0), top_driver: (b.sensitivity[0] || {}).id } : {} };
  });
  const probs = c.probs.map(p => ({ id: p.id, type: 'problem', title: p.title, domain: p.domain, problem_ids: [p.id] }));
  return [...sols, ...probs];
}

export const registryFor = (store, now) => createRegistry({ store, key: KEY, now });

// One bounded run from the improvement tick: mine, challenge the stalest entries, close what is no longer true, derive the frontier.
// The red team's model is Workers AI through the AI binding when it is bound (a different family from the entries' author); without it the rule-based red team runs.
export const MODEL_CONFIG = { ignorance: { model_alias: 'red', author_family: 'anthropic', models: { red: { endpoint: 'workers_ai', model: '@cf/meta/llama-3.1-8b-instruct', family: 'meta' } } } };
export const REDTEAM_URL = 'https://raw.githubusercontent.com/ultrastable/practical-solutions/main/ledger/redteam.json';
export async function ignoranceTick({ store, cat, env = {}, now = () => Date.now(), model = null, author_family = null, budget = 4, fetchFn = null }) {
  if (!model) ({ model, author_family } = modelFor({ config: MODEL_CONFIG, env }));
  const registry = registryFor(store, now);
  // model challenges written by the Actions red team (GitHub Models), re-validated here: they are untrusted input
  if (fetchFn) try {
    const res = await fetchFn(REDTEAM_URL);
    if (res.ok) { const rt = await res.json(), ids = new Set(cat.sols.map(s => s.id)), gaps = [];
      for (const [id, v] of Object.entries(rt.bySubject || {})) if (ids.has(id)) gaps.push(...sanitizeModel({ family: v.family, findings: v.findings || [] }, { author_family: MODEL_CONFIG.ignorance.author_family }).map(f => findingToGap(id, f)));
      if (gaps.length) await registry.upsert(gaps); }
  } catch { /* the rule floor still runs */ }
  const r = await run({ registry, subjects: subjectsFrom(cat), miners: minersFor(), model, author_family, budget, now });
  await store.put(LAST, JSON.stringify({ at: r.at, metrics: r.metrics, frontier: r.frontier, errors: r.errors }));
  return r;
}

// everything the pages need, computed once per request from what the tick stored
export async function ignView(store, now = () => Date.now()) {
  const raw = await store.get(KEY); if (!raw) return null;
  const registry = registryFor({ get: async () => raw, put: async () => {} }, now), all = await registry.list(), last = JSON.parse((await store.get(LAST)) || 'null');
  const by = {}; for (const g of all) (by[g.subject] ||= []).push(g.id);
  const bySubject = {}; for (const id of Object.keys(by)) bySubject[id] = await publicView(registry, id);
  return { summary: await registry.summary(), audit: await registry.audit(), last, bySubject, runs: await registry.runs(), challenged: await registry.challenged() };
}

const sev = n => (n >= 3 ? 'high' : n === 2 ? 'medium' : 'low');
const gapLi = g => `<li><b>${esc(KIND_LABEL[g.kind] || g.kind)}</b> <span class="m">(${sev(g.severity)} importance)</span>: ${esc(g.text)}${g.falsifier ? `<br><span class="m">What would change our mind: ${esc(g.falsifier)}</span>` : ''}<br><span class="m">To close it: ${esc(g.how)}${g.source === 'model' ? ' · raised by a language model, unverified' : ''}</span></li>`;

// the section shown on every entry
export function unknownsBlock(id, c) {
  const v = c.ign && c.ign.bySubject && c.ign.bySubject[id];
  if (!v || !(v.open.length || v.closed.length)) return '<p>This entry has not yet been examined for what it does not know. The loop challenges the stalest entries first, a few each day, so it will be.</p>';
  const known = v.open.filter(g => g.region === 'known_unknown'), red = v.open.filter(g => g.region === 'unknown_unknown');
  return `<p class="m">Last red-teamed ${esc(v.challenged_at || 'not yet')}. These are questions and challenges, not corrections: they do not change what the entry claims. <a href="/unknowns">How this works</a></p>`
    + (known.length ? `<h3>Known unknowns (${known.length})</h3><ul class="list">${known.map(gapLi).join('')}</ul>` : '')
    + (red.length ? `<h3>Red team, inversion and pre-mortem (${red.length})</h3><ul class="list">${red.map(gapLi).join('')}</ul>` : '')
    + (v.closed.length ? `<h3>Recently closed</h3><ul class="list">${v.closed.map(g => `<li>${esc(g.text)} <span class="m">Closed as ${esc(g.disposition)}: ${esc(g.evidence)}</span></li>`).join('')}</ul>` : '');
}

export function unknownsData(c) {
  const g = c.ign, instrument = { source: UIA.source, phases: UIA.phases, questions: UIA.questions.map(q => ({ n: q.n, phase: q.phase_name, text: q.text })) };
  if (!g) return { generated: false, instrument };
  return { generated: true, summary: g.summary, accounting: g.audit, last_run: g.last && { at: g.last.at, metrics: g.last.metrics }, frontier: (g.last && g.last.frontier) || [],
    entries: Object.fromEntries(Object.entries(g.bySubject).map(([k, v]) => [k, { challenged_at: v.challenged_at, open: v.open, closed: v.closed }])), instrument };
}

export function unknownsBody(c) {
  const g = c.ign, s = g && g.summary, m = g && g.last && g.last.metrics, fr = (g && g.last && g.last.frontier) || [];
  const rows = Object.entries(REGION).map(([r, label]) => ({ label, open: (s ? Object.entries(s.by_region_status).filter(([k]) => k === r + ':open').reduce((n, [, x]) => n + x, 0) : 0), closed: (s ? (s.by_region_status[r + ':closed'] || 0) : 0) }));
  const stats = ui.stats([{ value: s ? s.open : 0, label: 'open known unknowns and challenges' }, { value: s ? s.closed : 0, label: 'closed, each with a recorded reason' }, { value: m ? Math.round(m.challenged_share * 100) + '%' : '0%', label: 'of entries red-teamed' }, { value: m ? m.expansion : 0, label: 'net new questions in the last run' }]);
  const front = fr.slice(0, 12).map(q => `<li><b>${q.type === 'problem_candidate' ? 'A problem to look into' : q.type === 'solution_candidate' ? 'A possible solution to test' : 'A question'}</b>: ${esc(q.text)}</li>`).join('');
  return `${ui.breadcrumbs([{ label: 'Home', href: '/' }, { label: 'What we do not know' }])}<h1>What we do not know</h1>
<p class="lede">Improving only what is already known makes the known smaller and the confidence larger. So the loop also asks what is missing, what would show each entry wrong, and what nobody has looked at, and publishes the answers beside each entry.</p>
${ui.section({ id: 'now', title: 'Where it stands', body: g ? stats + ui.table({ caption: 'Open and closed, by kind of ignorance', head: ['Region', 'Open', 'Closed'], rows: rows.map(r => [esc(r.label), r.open, r.closed]) }) + `<p class="m">Accounting: ${g.audit.entered} gaps entered, ${g.audit.open} open, ${g.audit.closed} closed with a reason. ${g.audit.balanced ? 'The books balance: nothing has dropped out unrecorded.' : 'The books do not balance; this is a defect.'} Last run ${esc(g.last ? g.last.at : 'not yet')}. <a href="/unknowns.json">As JSON</a></p>` : '<p>The first run has not happened yet. It runs inside the daily improvement tick.</p>' })}
${ui.section({ id: 'frontier', title: 'New questions the loop generated from the gaps', body: front ? `<p>Each of these came from a gap, not from a list written by hand. They are leads for the loop to work on, never findings.</p><ul class="list">${front}</ul>` : '<p>None yet.</p>' })}
${ui.section({ id: 'how', title: 'How it works', body: `<p>Three kinds of ignorance need three responses. <b>Known unknowns</b> (a missing source, an untested assumption, a disagreement between studies, an estimate with no uncertainty range, a problem with no solution listed) are worked on directly. <b>Unknown unknowns</b> are probed for: a red-team pass challenges each entry, an inversion asks what would be true if the opposite held, and a pre-mortem imagines the first test failing. <b>Ignorance about ignorance</b> is measured: the share of entries nobody has challenged yet is itself a gap.</p><p>Every challenge names what would change our mind. A gap is closed only with a recorded reason and evidence, and it re-opens if the condition comes back. If several runs in a row find nothing new, the next run widens, not narrows.</p><p>Today the challenges come from a fixed set of rules written from the audit questions below. A language model may add more, from a different model family than the author, and anything it adds is marked as unverified.</p>` })}
${ui.section({ id: 'audit', title: 'The audit questions', body: `<p>The method is the Universal Ignorance Audit (${esc(UIA.source)}): five phases, fifteen questions. "We do not know" is an acceptable answer; skipping is not.</p><ol>${UIA.questions.map(q => `<li><span class="m">${esc(q.phase_name)}</span> ${esc(q.text)}</li>`).join('')}</ol>` })}`;
}

// the part of /method that explains this, with the live numbers
export function methodSection(c) {
  const g = c.ign, s = g && g.summary;
  return `<p>A catalogue that only polishes what it knows grows more certain and less useful. So ignorance is data here: ${s ? `${s.open} gaps are open and ${s.closed} are closed with a reason` : 'the first run has not happened yet'}, and every entry shows its own known unknowns and the strongest challenges against it.</p>`
    + `<p>The loop mines gaps from the catalogue (untested assumptions, thin or single-source evidence, disagreement, estimates without an interval or without higher-order effects, problems with no solution), challenges the stalest entries with red-team, inversion and pre-mortem passes, and turns what it finds into new questions, problem candidates and solutions to test. It is built on methods from evidence-gap mapping, pre-mortems, adversarial collaboration and the Universal Ignorance Audit. <a href="/unknowns">Full description and live numbers</a>.</p>`;
}
