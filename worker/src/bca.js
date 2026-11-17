// SPDX-License-Identifier: LicenseRef-Ultrastable-USL-1.0
// Copyright (c) 2026 Rowan Brad Quni-Gudzinas. Non-commercial use free; commercial use requires a license. See LICENSE.
// Runs the core benefit-cost engine for the catalogue and renders the result. Deterministic (fixed seed), computed once per Worker instance.
import { score, PARAMS, GRADES, validate } from '../../vendor/ultrastable/core/benefitcost/index.js';
import { MODELS, GAPS } from './bca-models.js';
import { esc } from './catalog.js';

const cache = new Map();
export function bcaFor(id) {
  if (!MODELS[id]) return null;
  if (!cache.has(id)) { const errs = validate(MODELS[id]); cache.set(id, errs.length ? { error: errs.join('; ') } : score(MODELS[id], { draws: 3000, seed: 20261117 })); }
  return cache.get(id);
}
export const coverage = ids => ({ modelled: ids.filter(i => MODELS[i]).length, total: ids.length, queue: ids.filter(i => !MODELS[i]) });
const f = x => (Math.abs(x) >= 100 ? Math.round(x).toLocaleString('en') : Math.abs(x) >= 10 ? x.toFixed(1) : x.toFixed(2));
const pct = x => Math.round(x * 100) + '%';

export function bcaBlock(b, id) {
  if (!b) return '<p>Not yet estimated. It is in the queue; the loop builds a model when it has a cited effect size and a published cost per outcome for this entry.' + (GAPS[id] ? ' What was searched: ' + esc(GAPS[id]) : '') + '</p>';
  if (b.error) return '<p>The model failed validation: ' + esc(b.error) + '</p>';
  const w = b.wellby_per_1000_usd, fo = b.first_order_only_per_1000_usd;
  const nodes = b.nodes.map(n => '<tr><td>' + esc(n.label) + '</td><td>' + n.order + '</td><td>' + esc(n.kind) + '</td><td>' + esc(n.grade) + '</td><td>' + esc(n.source) + '</td></tr>').join('');
  const assum = Object.entries(b.assumptions_used).filter(([k]) => ['ls_mean', 'neutral_point', 'discount', 'consumption_doubling_wellby', 'moral_weight_death_u5'].includes(k)).map(([k, s]) => esc(k) + ' (' + esc(s) + ')').join(', ');
  return '<p><b>' + f(w.p50) + ' WELLBYs per USD 1,000</b> (90% range ' + f(w.p5) + ' to ' + f(w.p95) + '). Chance of net benefit: ' + pct(b.prob_net_positive) + '. First-order effects alone: ' + f(fo.p50) + '. Share of the estimate resting on weak evidence (grade C or D): ' + pct(b.evidence_share.C + b.evidence_share.D) + '.</p>'
    + '<table class="tbl"><caption>Causal chain, each link graded</caption><thead><tr><th>Link</th><th>Order</th><th>Kind</th><th>Grade</th><th>Source</th></tr></thead><tbody>' + nodes + '</tbody></table>'
    + '<p>Conversion assumptions used: ' + assum + '. See <a href="/method#bca">how this is calculated</a>.</p>';
}

export function methodSection() {
  const rows = Object.entries(PARAMS).map(([k, v]) => '<tr><td>' + esc(k) + '</td><td>' + esc(v.status) + '</td><td>' + esc(v.unit) + '</td><td>' + esc(v.note) + '</td></tr>').join('');
  const grades = Object.entries(GRADES).map(([g, v]) => '<li><b>' + g + '</b>: ' + esc(v.label) + '; credibility multiplier drawn between ' + v.haircut.min + ' and ' + v.haircut.max + '.</li>').join('');
  return '<p>Money is a poor measure of a life, of happiness or of suffering, and it hides who gains. So benefits are measured in <b>WELLBYs</b>: one point of 0 to 10 life satisfaction for one person for one year, the unit used in UK Treasury Green Book wellbeing guidance and by the Happier Lives Institute. Costs stay in US dollars because they are resources someone must find. The result is <b>WELLBYs per USD 1,000</b>, which compares a water programme, a school reform and a cash transfer on one scale without pricing any benefit in money.</p>'
    + '<p>Other candidates were weighed. DALYs and QALYs measure health only, so they cannot compare an education or income benefit; here a DALY is converted. GiveWell moral weights give the relative value of a death against a doubling of consumption; they are used as one of two routes for deaths averted (the other values the remaining life years above a neutral point). Copenhagen Consensus benefit-cost ratios price everything in money and are shown in their own units only where a source reports them. The capability approach is a richer framework with no agreed cardinal unit, so it informs which outcomes are listed but is not the metric. Social return on investment is a monetised ratio and inherits the weakness the WELLBY avoids.</p>'
    + '<h3>Higher-order effects</h3><p>Each entry is a causal chain. A link may hang off another (second and third order effects, multipliers) or be negative (unintended consequences). Every link has an evidence grade and a source, and a child link inherits its parent\'s credibility multiplier, so a long chain of weak links is worth less than a short chain of strong ones. The page for an entry shows the estimate with and without higher-order effects.</p><ul>' + grades + '</ul>'
    + '<h3>Uncertainty</h3><p>Every input is a range, not a point. The engine runs 3,000 Monte Carlo draws with a fixed seed, so the result can be reproduced, and shows the 90% range, the chance of net benefit, and which inputs drive the answer. Entries are ranked by the 25th percentile, so a wide, weakly evidenced estimate ranks below a tight, well evidenced one.</p>'
    + '<h3>Published conversion assumptions</h3><p>Status <i>cited</i> is taken from a named source; <i>assumption</i> is our reading with a range meant to span the published disagreement, and is replaced as evidence is pooled.</p><table class="tbl"><caption>Conversion parameters and their status</caption><thead><tr><th>Parameter</th><th>Status</th><th>Unit</th><th>Note</th></tr></thead><tbody>' + rows + '</tbody></table>'
    + '<h3>How it improves</h3><p>New evidence about a link is pooled into it by inverse-variance weighting, with prior evidence down-weighted by its grade; a link\'s grade rises only when higher-grade evidence has been pooled. The loop then points at the links that most affect the answer and have the weakest grade, and looks there first. Code: <a href="https://github.com/ultrastable/workers/tree/main/core/benefitcost">core/benefitcost</a> (generic, in Ultrastable core) and <a href="https://github.com/ultrastable/practical-solutions/blob/main/worker/src/bca-models.js">the models</a>. Entries without a model say so.</p>';
}
