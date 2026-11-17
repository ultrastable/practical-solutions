// SPDX-License-Identifier: LicenseRef-Ultrastable-USL-1.0
// Copyright (c) 2026 Rowan Brad Quni-Gudzinas. Non-commercial use free; commercial use requires a license. See LICENSE.
// Runs the core benefit-cost engine for the catalogue and renders the result. Deterministic (fixed seed), computed once per Worker instance.
import { score, PARAMS, GRADES, validate, scoreAcross, refineLoop, applyEvidence } from '../../vendor/ultrastable/core/benefitcost/index.js';
import { MODELS, GAPS, CONTEXTS, APPLIES, FINDERS, QUEUE } from './bca-models.js';
import { esc } from './catalog.js';
import { costMultiplier } from './adjust.js';
import SNAPSHOT from '../../data/context.json' with { type: 'json' };
import { complete } from '../../ps/llm.js';

// The group a model's figures were measured in: the first group the entry is marked as applying to. Other groups get a cost multiplier
// from the cited price-level series; with no origin or no figure the cost is left as measured.
export function originOf(id) { const a = APPLIES[id] || {}; return (CONTEXTS.find(c => a[c.id] && a[c.id].applies !== false) || {}).id || null; }
export function adjustedContext(id, c, adjust = SNAPSHOT.adjust) { const o = originOf(id), cm = o && costMultiplier(adjust, o, c.id); return cm ? { ...c, cost_multiplier: cm.value, cost_note: cm.why } : c; }

export const KEY = 'bca:v1', SEED = 20261117;
// the engine settings the /method page states; the page renders them from here, so they cannot drift
export const ENGINE = { draws: 3000, contextDraws: 800, seed: SEED, ranking: 'p25', range: [5, 95], topDrivers: 3 };
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
    else { r = score(m, { draws: ENGINE.draws, seed: ENGINE.seed }); r.contexts = CONTEXTS.map(c => ({ ...c, measured: !!(APPLIES[id] && APPLIES[id][c.id] && APPLIES[id][c.id].applies !== false) || !!(m.contexts[c.id] && m.contexts[c.id].nodes), r: scoreAcross(m, [adjustedContext(id, c)], { draws: ENGINE.contextDraws, seed: ENGINE.seed })[c.id], cost_note: adjustedContext(id, c).cost_note || null }));
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
// Model-based extraction: the model port reads the abstract and returns the figure with the exact phrase it came from. The answer is accepted
// only when the phrase occurs verbatim in the abstract and every number occurs verbatim in the phrase; otherwise (or with no model route) the
// pattern reader above is used. At most MODEL_READS abstracts per run go to the model, and only abstracts that mention the unit at all.
export const MODEL_READS = 4;
export const extractPrompt = (text, per) => `From the abstract below, find the cost in US dollars per ${per === 'daly' ? 'disability-adjusted life year (DALY) or YLD averted' : 'death averted or life saved'}. Answer with JSON only: {"found":true|false,"low":"<first number exactly as written>","high":"<second number exactly as written, or empty>","quoted":"<the exact phrase from the abstract that states it>"}. Copy text exactly; do not convert, round or compute. If the abstract does not state such a cost, answer {"found":false}.\n\nABSTRACT:\n${text}`;
export function checkExtraction(answer, text) {
  const t = String(text || '').replace(/<[^>]+>/g, ' ');
  const m = /\{[\s\S]*\}/.exec(String(answer || '')); if (!m) return null;
  let j; try { j = JSON.parse(m[0]); } catch { return null; }
  if (!j || j.found !== true || typeof j.quoted !== 'string' || !j.quoted.trim() || !t.includes(j.quoted)) return null;
  const nums = [j.low, j.high].filter(x => x !== undefined && x !== null && String(x).trim() !== '').map(String);
  if (!nums.length || !nums.every(n => j.quoted.includes(n))) return null;
  const [a, b] = nums.map(n => Number(n.replace(/,/g, '')));
  if (!(a > 0) || (b !== undefined && !(b > 0))) return null;
  return b && b > a ? { low: a, high: b, quoted: j.quoted, by: 'model' } : { low: a / 2, high: a * 2, quoted: j.quoted, by: 'model' };
}
export async function readCost(text, per, llm) {
  if (llm && llm.left > 0 && new RegExp(UNIT[per], 'i').test(String(text || ''))) {
    llm.left--;
    const r = await complete({ fetch: llm.fetch, secrets: llm.secrets, prompt: extractPrompt(String(text).slice(0, 6000), per), maxTokens: 200 });
    if (r.ok) { const c = checkExtraction(r.text, text); if (c) return c; }
  }
  const c = extractCost(text, per); return c && { ...c, by: 'pattern' };
}
async function findEvidence(fetchFn, model, finder, seen, llm = null) {
  const q = '(' + finder.query + ') AND ("cost-effectiveness" OR "cost per") AND PUB_YEAR:[2010 TO 2030]';
  const r = await fetchFn(EPMC + '?query=' + encodeURIComponent(q) + '&format=json&resultType=core&pageSize=15');
  if (!r.ok) throw new Error('Europe PMC HTTP ' + r.status);
  const rows = ((await r.json()).resultList || {}).result || [], node = model.nodes.find(n => n.id === finder.node), out = [], rejected = [];
  let prior = !node ? null : typeof node.amount === 'number' ? node.amount : Math.sqrt(node.amount.low * node.amount.high); const budget = model.cost.upfront;
  for (const x of rows) {
    const src = 'Europe PMC ' + (x.pmid ? 'PMID ' + x.pmid : x.id) + ': ' + String(x.title || '').replace(/<[^>]+>/g, '').slice(0, 140) + ' (' + x.pubYear + ')';
    if (seen.has(src)) continue;
    const c = await readCost(x.abstractText, finder.per, llm); if (!c) continue;
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
export async function bcaTick({ store, fetchFn = fetch, now = Date.now(), secrets = null }) {
  const llm = secrets ? { fetch: fetchFn, secrets, left: MODEL_READS } : null;
  const at = new Date(now).toISOString(), raw = await store.get(KEY), state = raw ? JSON.parse(raw) : { models: {}, looked: {}, leads: [] }, changes = [];
  const ids = [...Object.keys(FINDERS).filter(id => MODELS[id]), ...Object.keys(QUEUE).filter(id => !MODELS[id])].sort((a, b) => Date.parse((state.looked[a] || { at: 0 }).at || 0) - Date.parse((state.looked[b] || { at: 0 }).at || 0));
  const id = ids[0]; if (!id) return { at, changes };
  const q = QUEUE[id], finder = FINDERS[id] || { node: 'outcome', per: q.per, query: q.query };
  let base = state.models[id] || MODELS[id], found = 0, error = null;
  const seen = new Set(((base && base.evidence) || []).map(e => e.source.replace(/ \[.*$/, '')));
  try {
    if (!base) { // queued entry: draft a model from the first usable figure, then pool the rest as evidence
      const r = await findEvidence(fetchFn, { cost: { upfront: 100000 }, nodes: [] }, finder, seen, llm);
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
        evidenceFor: async m => { const r = await findEvidence(fetchFn, m, finder, seen, llm); state.leads = [...r.rejected.map(x => ({ id, at, ...x })), ...(state.leads || [])].slice(0, 40); return r.items; },
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
    + '<div class="tablewrap" tabindex="0" role="region" aria-label="Causal chain, each link graded"><table class="tbl"><caption>Causal chain, each link graded</caption><thead><tr><th>Link</th><th>Order</th><th>Kind</th><th>Grade</th><th>Source</th></tr></thead><tbody>' + nodes + '</tbody></table></div>'
    + drivers(b) + ctxTable(b) + pooled(b)
    + '<p>Conversion assumptions used: ' + assum + '. See <a href="/method#bca">how this is calculated</a>.</p>';
}

function drivers(b) {
  const top = (b.sensitivity || []).slice(0, ENGINE.topDrivers); if (!top.length) return '';
  return '<p>Inputs that move this answer most (rank correlation with the result): ' + top.map(x => esc(x.id) + ' (' + (x.corr >= 0 ? '+' : '') + x.corr.toFixed(2) + ')').join(', ') + '.</p>';
}
function ctxTable(b) {
  if (!b.contexts) return '';
  const rows = b.contexts.map(c => '<tr><td>' + esc(c.label) + '</td><td>' + (c.r.applicable ? f(c.r.wellby_per_1000_usd.p50) + ' (' + f(c.r.wellby_per_1000_usd.p5) + ' to ' + f(c.r.wellby_per_1000_usd.p95) + ')' : 'Does not apply') + '</td><td>' + esc(c.r.applicable ? (c.measured ? 'Evidence comes from settings like this' : 'Transferred from another setting; no local cost or effect figure yet') + (c.cost_note ? '. Cost scaled by ' + c.cost_note : '') : c.r.reason) + '</td></tr>').join('');
  return '<div class="tablewrap" tabindex="0" role="region" aria-label="By level of development (World Bank income group), WELLBYs per USD 1,000"><table class="tbl"><caption>By level of development (World Bank income group), WELLBYs per USD 1,000</caption><thead><tr><th>Setting</th><th>Estimate (90% range)</th><th>Basis</th></tr></thead><tbody>' + rows + '</tbody></table></div>';
}
function pooled(b) {
  const ev = (b.evidence || []).map(e => '<li>' + (e.url ? '<a href="' + esc(e.url) + '">' + esc(e.source) + '</a>' : esc(e.source)) + ' (grade ' + esc(e.grade) + (e.at ? ', pooled ' + esc(String(e.at).slice(0, 10)) : '') + ')</li>').join('');
  return (ev ? '<p>Evidence the loop has pooled into this estimate:</p><ul class="list">' + ev + '</ul>' : '') + (b.looked ? '<p class="m">The loop last searched for new cost evidence on ' + esc(String(b.looked.at).slice(0, 10)) + ' and pooled ' + (b.looked.found || 0) + ' new figure(s).</p>' : '');
}

// the live tables of /method: built from the engine's own data, so they cannot drift. All prose about the engine is in method-claims.js.
export function methodSection() {
  const rows = Object.entries(PARAMS).map(([k, v]) => '<tr><td>' + esc(k) + '</td><td>' + esc(v.status) + '</td><td>' + esc(v.unit) + '</td><td>' + esc(v.note) + '</td></tr>').join('');
  const grades = Object.entries(GRADES).map(([g, v]) => '<li><b>' + g + '</b>: ' + esc(v.label) + '; credibility multiplier drawn between ' + v.haircut.min + ' and ' + v.haircut.max + '.</li>').join('');
  return '<ul>' + grades + '</ul><div class="tablewrap" tabindex="0" role="region" aria-label="Conversion parameters and their status"><table class="tbl"><caption>Conversion parameters and their status</caption><thead><tr><th>Parameter</th><th>Status</th><th>Unit</th><th>Note</th></tr></thead><tbody>' + rows + '</tbody></table></div>';
}
