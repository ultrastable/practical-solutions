// SPDX-License-Identifier: LicenseRef-Ultrastable-USL-1.0
// Copyright (c) 2026 Rowan Brad Quni-Gudzinas. Non-commercial use free; commercial use requires a license. See LICENSE.
// What an entry page shows of the model ensemble: applied changes with their record, and disagreement shown as uncertainty. Reads only the generated ledger.
import { ENSEMBLE_LEDGER } from './ensemble-ledger.gen.js';
import { ENSEMBLE } from './ensemble-config.js';
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const day = s => String(s || '').slice(0, 10);
const FIELD = { claim: 'the claim', limits: 'the limits', works_where: 'where it works', takes: 'what it takes', first_test: 'the cheapest first test' };
const votes = v => v.map(x => `${esc(x.vendor)} ${esc(x.verdict)}`).join(', ');

export function ensembleBlock(id, L = ENSEMBLE_LEDGER) {
  const items = (L.by_entry && L.by_entry[id]) || [], seen = L.examined && L.examined[id];
  const applied = items.filter(x => x.status === 'applied'), unc = items.filter(x => x.status === 'uncertain');
  const out = [];
  for (const a of applied) out.push(`<p><b>Updated ${esc(day(a.at))}</b> after a cross-model check: ${esc(FIELD[a.field] || a.field)} was reworded to match <a href="${esc(a.source.url)}">${esc(a.source.title)}</a>. Proposed by ${esc(a.proposer)}; ${votes(a.votes)}. <span class="m">Before: ${esc(a.old)}</span></p>`);
  for (const u of unc) out.push(`<p><b>Models disagree</b> about a proposed change to ${esc(FIELD[u.field] || u.field)} (${votes(u.votes)}), so the entry is unchanged and its wording there should be read as uncertain. Source: <a href="${esc(u.source.url)}">${esc(u.source.title)}</a>. <span class="m">Proposed wording, not adopted: ${esc(u.new)}</span></p>`);
  if (!out.length) out.push(seen ? `<p>Last cross-checked ${esc(day(seen))}: no change was supported. ` + 'Models do not vote on whether a claim is true, only on whether a quoted source supports a sentence.</p>' : '<p>This entry has not yet been cross-checked by the model ensemble. It examines the stalest entries first, a few each day.</p>');
  return out.join('') + `<p class="m">How it works, and why agreement between models is not treated as evidence: <a href="/method#models">method</a>. Panel size is at least ${ENSEMBLE.min_verifiers} vendors; the full record is <a href="/ensemble.json">/ensemble.json</a>.</p>`;
}
