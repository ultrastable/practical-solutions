// SPDX-License-Identifier: LicenseRef-Ultrastable-USL-1.0
// Copyright (c) 2026 Rowan Brad Quni-Gudzinas. Non-commercial use free; commercial use requires a license. See LICENSE.
// Runs the core benefit-cost engine for the catalogue and renders the result. Deterministic (fixed seed), computed once per Worker instance.
import { score, PARAMS, GRADES, validate, scoreAcross, refineLoop, applyEvidence } from '../../vendor/ultrastable/core/benefitcost/index.js';
import { MODELS, GAPS, CONTEXTS, APPLIES, FINDERS, QUEUE } from './bca-models.js';
import { esc } from './catalog.js';

export const KEY = 'bca:v1', SEED = 20261117;
const cache = new Map();
// the model in force: the refined copy the loop stored, else the seed model, each with the entry's context facts
export function modelFor(id, state) {
  const m = (state && state.models && state.models[id]) || MODELS[id]; if (!m) return null;
  const ctx = { ...(APPLIES[id] || {}) }; for (const [k, v] of Object.entries(m.contexts || {})) ctx[k] = { ...(ctx[k] || {}), ...v };
  return { ...m, contexts: ctx };
}
export function bcaFor(id, state) {
  const m = modelFor(id, state); if (!m) return null;
  const k = id + ':' + ((m.evidence || []).length) + ':' + (((state && state.looked && state.looked[id]) || {}).at || '');
  if (!cache.has(k)) {
    const errs = validate(m); let r;
    if (errs.length) r = { error: errs.join('; ') };
    else { r = score(m, { draws: 3000, seed: SEED }); r.contexts = CONTEXTS.map(c => ({ ...c, measured: !!(APPLIES[id] && APPLIES[id][c.id] && APPLIES[id][c.id].applies !== false) || !!(m.contexts[c.id] && m.contexts[c.id].nodes), r: scoreAcross(m, [c], { draws: 800, seed: SEED })[c.id] }));
      r.evidence = m.evidence || []; r.draft = !!m.draft && r.evidence.length < 2; if (r.draft) delete r.rank_key; r.looked = (state && state.looked && state.looked[id]) || null; }
    cache.set(k, r);
  }
  return cache.get(k);
}
export const coverage = (ids, state) => ({ modelled: ids.filter(i => MODELS[i]).length, drafted: ids.filter(i => !MODELS[i] && state && state.models && state.models[i]).length, total: ids.length, searching: ids.filter(i => QUEUE[i] && !(state && state.models && state.models[i])), gaps: ids.filter(i => GAPS[i] && !QUEUE[i]) });

// --- the evidence finder: Europe PMC abstracts that quote a cost per DALY or per death averted for this intervention -------------------------
const EPMC = 'https://www.ebi.ac.uk/europepmc/webservices/rest/search';
const NUM = '([0-9][0-9,]*(?:\\.[0-9]+)?)';
const UNIT = { daly: '(?:DALY|disability[- ]adjusted life[- ]year|YLD)', death: '(?:death averted|life saved|death prevented)' };
// Reads "US$ 40 per DALY averted" or "US$28-72 per DALY". A single figure gets a factor-of-two interval either side (a published rule, not a finding).
export function extractCost(text, per) {
  const t = String(text || '').replace(/<[^>]+>/g, ' ');
  const m = new RegExp('(?:US\\$|USD|\\$)\\s?' + NUM + '(?:\\s?(?:-|–|to)\\s?(?:US\\$|USD|\\$)?\\s?' + NUM + ')?\\s*(?:per|/)\\s*' + UNIT[per], 'i').exec(t);
  if (!m) return null;
  const a = Number(m[1].replace(/,/g, '')), b = m[2] ? Number(m[2].replace(/,/g, '')) : null;
  if (!(a > 0)) return null;
  return b && b > a ? { low: a, high: b, quoted: m[0] } : { low: a / 2, high: a * 2, quoted: m[0] };
}
async function findEvidence(fetchFn, model, finder, seen) {
  const q = '(' + finder.query + ') AND ("cost-effectiveness" OR "cost per") AND PUB_YEAR:[2010 TO 2030]';
  const r = await fetchFn(EPMC + '?query=' + encodeURIComponent(q) + '&format=json&resultType=core&pageSize=15');
  if (!r.ok) throw new Error('Europe PMC HTTP ' + r.status);
  const rows = ((await r.json()).resultList || {}).result || [], node = model.nodes.find(n => n.id === finder.node), out = [], rejected = [];
  let prior = !node ? null : typeof node.amount === 'number' ? node.amount : Math.sqrt(node.amount.low * node.amount.high); const budget = model.cost.upfront;
  for (const x of rows) {
    const src = 'Europe PMC ' + (x.pmid ? 'PMID ' + x.pmid : x.id) + ': ' + String(x.title || '').replace(/<[^>]+>/g, '').slice(0, 140) + ' (' + x.pubYear + ')';
    if (seen.has(src)) continue;
    const c = extractCost(x.abstractText, finder.per); if (!c) continue;
    const est = { low: budget / c.high, high: budget / c.low }, mid = Math.sqrt(est.low * est.high);
    // a figure more than ten times away from the current estimate is more likely a different intervention, currency or unit than a discovery: kept as a lead, not pooled
    if (prior === null) prior = mid; // the first figure for a queued entry sets the scale the next ones are checked against
    if (mid > prior * 10 || mid < prior / 10) { rejected.push({ source: src, quoted: c.quoted, why: 'more than ten times from the current estimate' }); continue; }
    // read by pattern from an abstract, so never graded above C
    out.push({ node: finder.node, estimate: est, grade: 'C', source: src + ' [' + c.quoted + ']', url: x.pmid ? 'https://europepmc.org/article/MED/' + x.pmid : null });
  }
  return { items: out.slice(0, 2), rejected };
}
// One model per tick, the one looked at longest ago. Pools what it finds through the core loop, stores the refined model, and reports what moved.
export async function bcaTick({ store, fetchFn = fetch, now = Date.now() }) {
  const at = new Date(now).toISOString(), raw = await store.get(KEY), state = raw ? JSON.parse(raw) : { models: {}, looked: {}, leads: [] }, changes = [];
  const ids = [...Object.keys(FINDERS).filter(id => MODELS[id]), ...Object.keys(QUEUE).filter(id => !MODELS[id])].sort((a, b) => Date.parse((state.looked[a] || { at: 0 }).at || 0) - Date.parse((state.looked[b] || { at: 0 }).at || 0));
  const id = ids[0]; if (!id) return { at, changes };
  const q = QUEUE[id], finder = FINDERS[id] || { node: 'outcome', per: q.per, query: q.query };
  let base = state.models[id] || MODELS[id], found = 0, error = null;
  const seen = new Set(((base && base.evidence) || []).map(e => e.source.replace(/ \[.*$/, '')));
  try {
    if (!base) { // queued entry: draft a model from the first usable figure, then pool the rest as evidence
      const r = await findEvidence(fetchFn, { cost: { upfront: 100000 }, nodes: [] }, finder, seen);
      state.leads = [...r.rejected.map(x => ({ id, at, ...x })), ...(state.leads || [])].slice(0, 40);
      const first = r.items[0];
      if (first) {
        base = { id, title: id, draft: true, cost: { upfront: 100000, years: 1 }, evidence: [{ node: 'outcome', source: first.source, url: first.url, grade: 'C', estimate: first.estimate, at }],
          nodes: [{ id: 'outcome', label: q.label, kind: 'direct', amount: { kind: 'ci90', shape: 'lognormal', ...first.estimate }, unit: q.unit, grade: 'C', source: first.source }] };
        state.models[id] = base; found = 1; seen.add(first.source.replace(/ \[.*$/, '')); changes.push({ kind: 'estimate_drafted', id });
        const rest = r.items.slice(1); if (rest.length) { const a = applyEvidence(base, rest, { at, seed: SEED }); state.models[id] = a.model; found += a.log.filter(x => x.applied).length; }
      }
    } else {
      const rep = await refineLoop({ at, seed: SEED, perModel: 1, load: async () => [base],
        evidenceFor: async m => { const r = await findEvidence(fetchFn, m, finder, seen); state.leads = [...r.rejected.map(x => ({ id, at, ...x })), ...(state.leads || [])].slice(0, 40); return r.items; },
        save: async (m, _res, changed) => { if (changed) state.models[id] = m; } });
      found = rep.applied;
      for (const mv of rep.moved) changes.push({ kind: 'estimate_moved', id, from: Number(mv.p50_from.toFixed(2)), to: Number(mv.p50_to.toFixed(2)) });
    }
  } catch (e) { error = String(e.message || e); changes.push({ kind: 'estimate_error', id, error }); }
  state.looked[id] = { at, found, error }; state.at = at;
  await store.put(KEY, JSON.stringify(state));
  return { at, id, found, changes };
}
export const loadState = async store => { const raw = await store.get(KEY); return raw ? JSON.parse(raw) : null; };

const f = x => (Math.abs(x) >= 100 ? Math.round(x).toLocaleString('en') : Math.abs(x) >= 10 ? x.toFixed(1) : x.toFixed(2));
const pct = x => Math.round(x * 100) + '%';

export function bcaBlock(b, id) {
  if (!b) return '<p>Not yet estimated. ' + (QUEUE[id] ? 'The loop searches each cycle for a published cost per ' + (QUEUE[id].per === 'death' ? 'death averted' : 'DALY averted') + ' and drafts an estimate when it finds one. ' : '') + (GAPS[id] ? 'Why there is no number: ' + esc(GAPS[id]) : '') + '</p>';
  if (b.error) return '<p>The model failed validation: ' + esc(b.error) + '</p>';
  const lead = b.draft ? '<p><b>Lead, not a finding.</b> The loop drafted this from one abstract by pattern and nobody has checked it. It is kept out of the ranking until a second independent source has been pooled.</p>' : '';
  const w = b.wellby_per_1000_usd, fo = b.first_order_only_per_1000_usd;
  const nodes = b.nodes.map(n => '<tr><td>' + esc(n.label) + '</td><td>' + n.order + '</td><td>' + esc(n.kind) + '</td><td>' + esc(n.grade) + '</td><td>' + esc(n.source) + '</td></tr>').join('');
  const assum = Object.entries(b.assumptions_used).filter(([k]) => ['ls_mean', 'neutral_point', 'discount', 'consumption_doubling_wellby', 'moral_weight_death_u5'].includes(k)).map(([k, s]) => esc(k) + ' (' + esc(s) + ')').join(', ');
  return lead + '<p><b>' + f(w.p50) + ' WELLBYs per USD 1,000</b> (90% range ' + f(w.p5) + ' to ' + f(w.p95) + '). Chance of net benefit: ' + pct(b.prob_net_positive) + '. First-order effects alone: ' + f(fo.p50) + '. Share of the estimate resting on weak evidence (grade C or D): ' + pct(b.evidence_share.C + b.evidence_share.D) + '.</p>'
    + '<table class="tbl"><caption>Causal chain, each link graded</caption><thead><tr><th>Link</th><th>Order</th><th>Kind</th><th>Grade</th><th>Source</th></tr></thead><tbody>' + nodes + '</tbody></table>'
    + ctxTable(b) + pooled(b)
    + '<p>Conversion assumptions used: ' + assum + '. See <a href="/method#bca">how this is calculated</a>.</p>';
}

function ctxTable(b) {
  if (!b.contexts) return '';
  const rows = b.contexts.map(c => '<tr><td>' + esc(c.label) + '</td><td>' + (c.r.applicable ? f(c.r.wellby_per_1000_usd.p50) + ' (' + f(c.r.wellby_per_1000_usd.p5) + ' to ' + f(c.r.wellby_per_1000_usd.p95) + ')' : 'Does not apply') + '</td><td>' + esc(c.r.applicable ? (c.measured ? 'Evidence comes from settings like this' : 'Transferred from another setting; no local cost or effect figure yet') : c.r.reason) + '</td></tr>').join('');
  return '<table class="tbl"><caption>By level of development (World Bank income group), WELLBYs per USD 1,000</caption><thead><tr><th>Setting</th><th>Estimate (90% range)</th><th>Basis</th></tr></thead><tbody>' + rows + '</tbody></table>';
}
function pooled(b) {
  const ev = (b.evidence || []).map(e => '<li>' + (e.url ? '<a href="' + esc(e.url) + '">' + esc(e.source) + '</a>' : esc(e.source)) + ' (grade ' + esc(e.grade) + (e.at ? ', pooled ' + esc(String(e.at).slice(0, 10)) : '') + ')</li>').join('');
  return (ev ? '<p>Evidence the loop has pooled into this estimate:</p><ul class="list">' + ev + '</ul>' : '') + (b.looked ? '<p class="m">The loop last searched for new cost evidence on ' + esc(String(b.looked.at).slice(0, 10)) + ' and pooled ' + (b.looked.found || 0) + ' new figure(s).</p>' : '');
}

export function methodSection() {
  const rows = Object.entries(PARAMS).map(([k, v]) => '<tr><td>' + esc(k) + '</td><td>' + esc(v.status) + '</td><td>' + esc(v.unit) + '</td><td>' + esc(v.note) + '</td></tr>').join('');
  const grades = Object.entries(GRADES).map(([g, v]) => '<li><b>' + g + '</b>: ' + esc(v.label) + '; credibility multiplier drawn between ' + v.haircut.min + ' and ' + v.haircut.max + '.</li>').join('');
  return '<p>Money is a poor measure of a life, of happiness or of suffering, and it hides who gains. So benefits are measured in <b>WELLBYs</b>: one point of 0 to 10 life satisfaction for one person for one year, the unit used in UK Treasury Green Book wellbeing guidance and by the Happier Lives Institute. Costs stay in US dollars because they are resources someone must find. The result is <b>WELLBYs per USD 1,000</b>, which compares a water programme, a school reform and a cash transfer on one scale without pricing any benefit in money.</p>'
    + '<p>Other candidates were weighed. DALYs and QALYs measure health only, so they cannot compare an education or income benefit; here a DALY is converted. GiveWell moral weights give the relative value of a death against a doubling of consumption; they are used as one of two routes for deaths averted (the other values the remaining life years above a neutral point). Copenhagen Consensus benefit-cost ratios price everything in money and are shown in their own units only where a source reports them. The capability approach is a richer framework with no agreed cardinal unit, so it informs which outcomes are listed but is not the metric. Social return on investment is a monetised ratio and inherits the weakness the WELLBY avoids.</p>'
    + '<h3>Higher-order effects</h3><p>Each entry is a causal chain. A link may hang off another (second and third order effects, multipliers) or be negative (unintended consequences). Every link has an evidence grade and a source, and a child link inherits its parent\'s credibility multiplier, so a long chain of weak links is worth less than a short chain of strong ones. The page for an entry shows the estimate with and without higher-order effects.</p><ul>' + grades + '</ul>'
    + '<h3>Uncertainty</h3><p>Every input is a range, not a point. The engine runs 3,000 Monte Carlo draws with a fixed seed, so the result can be reproduced, and shows the 90% range, the chance of net benefit, and which inputs drive the answer. Entries are ranked by the 25th percentile, so a wide, weakly evidenced estimate ranks below a tight, well evidenced one.</p>'
    + '<h3>Published conversion assumptions</h3><p>Status <i>cited</i> is taken from a named source; <i>assumption</i> is our reading with a range meant to span the published disagreement, and is replaced as evidence is pooled.</p><table class="tbl"><caption>Conversion parameters and their status</caption><thead><tr><th>Parameter</th><th>Status</th><th>Unit</th><th>Note</th></tr></thead><tbody>' + rows + '</tbody></table>'
    + '<h3>How it improves</h3><p>New evidence about a link is pooled into it by inverse-variance weighting, with prior evidence down-weighted by its grade; a link\'s grade rises only when higher-grade evidence has been pooled. The loop then points at the links that most affect the answer and have the weakest grade, and looks there first. Code: <a href="https://github.com/ultrastable/workers/tree/main/core/benefitcost">core/benefitcost</a> (generic, in Ultrastable core) and <a href="https://github.com/ultrastable/practical-solutions/blob/main/worker/src/bca-models.js">the models</a>. Entries without a model say so.</p>'
    + '<h3>Different countries, different answers</h3><p>The same solution does not apply everywhere, and where it applies its cost and effect differ. Every estimate is therefore shown for each World Bank income group: whether the solution applies there at all (and why not), and whether the figures were measured in settings like it or transferred from elsewhere. No cost or wellbeing adjustment is asserted for a group until a source supports it; when the loop finds evidence from one group it updates that group only.</p>'
    + '<h3>The evidence finder</h3><p>Each cycle the loop takes the estimate it looked at longest ago and searches Europe PMC for studies that quote a cost per DALY or per death averted for that intervention. A figure read from an abstract is graded C at most, a single figure is given a factor-of-two interval either side, and a figure more than ten times away from the current estimate is kept as a lead and not pooled. Every pooled source is listed on the entry, and each change appears in the <a href="/changes">changes feed</a>.</p>';
}
