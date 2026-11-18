// SPDX-License-Identifier: LicenseRef-Ultrastable-USL-1.0
// Copyright (c) 2026 Rowan Brad Quni-Gudzinas. Non-commercial use free; commercial use requires a license. See LICENSE.
// SYNTHESES-1 gate. Run from Actions (network) or offline (--build only):
//   node tools/synth.mjs            verify every synthesis against Crossref, Europe PMC and OpenAlex, then build the generated module
//   node tools/synth.mjs --build    rebuild worker/src/syntheses.gen.js from the stored verification record, no network
//   node tools/synth.mjs --check    fail if the generated module is stale
// A synthesis is published only when every citation is found (title and year) and every quoted figure appears in the paper's abstract.
// A source that cannot be reached leaves the previous record in place and marks the run `unreached`; it never turns an entry on.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { SYNTHESES } from '../worker/src/syntheses-data.js';
import { score, validate } from '../vendor/ultrastable/core/benefitcost/index.js';

export const LEDGER = 'ledger/syntheses-verified.json', DISCOVERED = 'ledger/synth-discovered.json', GEN = 'worker/src/syntheses.gen.js', SEED = 20261118;
const UA = { 'user-agent': 'practical-solutions-verifier (+https://ultrastable.org/method)' };
const norm = s => String(s || '').toLowerCase().replace(/&amp;|&/g, ' and ').replace(/<[^>]+>/g, ' ').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
export const similarity = (a, b) => { const A = new Set(norm(a).split(' ')), B = new Set(norm(b).split(' ')); const i = [...A].filter(x => B.has(x)).length; return i / (new Set([...A, ...B]).size || 1); };
const getJson = async (f, url) => {
  let last;
  for (let i = 0; i < 4; i++) { const r = await f(url, { headers: UA }); if (r.ok) return r.json(); last = r.status; if (![429, 500, 502, 503, 504].includes(r.status)) break; await new Promise(res => setTimeout(res, 1500 * (i + 1))); }
  throw new Error(`${url.split('?')[0]} -> HTTP ${last}`);
};

export async function findPaper(f, c) {
  const j = await getJson(f, `https://api.crossref.org/works?query.bibliographic=${encodeURIComponent(c.q)}&rows=5&select=DOI,title,issued,container-title`);
  const items = (j.message && j.message.items) || [];
  const scored = items.map(it => ({ it, sim: similarity((it.title || [])[0], c.q), year: it.issued && it.issued['date-parts'] && it.issued['date-parts'][0] && it.issued['date-parts'][0][0] })).sort((a, b) => b.sim - a.sim);
  const best = scored[0];
  if (!best || best.sim < 0.8) return { found: false, reason: `no Crossref title match (best ${best ? best.sim.toFixed(2) : 'none'})` };
  const yearOk = best.year != null && Math.abs(best.year - c.year) <= 1;
  return { found: yearOk, doi: best.it.DOI, title: (best.it.title || [])[0], year: best.year, journal: (best.it['container-title'] || [])[0], similarity: Number(best.sim.toFixed(2)), reason: yearOk ? 'matched' : `year ${best.year} is not ${c.year}` };
}

export async function abstractOf(f, doi) {
  try {
    const j = await getJson(f, `https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=${encodeURIComponent('DOI:"' + doi + '"')}&resultType=core&format=json&pageSize=1`);
    const t = j.resultList && j.resultList.result && j.resultList.result[0] && j.resultList.result[0].abstractText; if (t) return { text: String(t).replace(/<[^>]+>/g, ' '), via: 'europepmc' };
  } catch (e) { /* fall through to OpenAlex */ }
  const w = await getJson(f, `https://api.openalex.org/works/doi:${doi}?select=abstract_inverted_index`);
  const idx = w.abstract_inverted_index; if (!idx) return { text: '', via: 'none' };
  const words = []; for (const [word, pos] of Object.entries(idx)) for (const p of pos) words[p] = word;
  return { text: words.join(' '), via: 'openalex' };
}

export async function noveltyCheck(f, n) {
  const out = [];
  for (const q of n.queries) {
    const j = await getJson(f, `https://api.openalex.org/works?mailto=verifier@ultrastable.org&search=${encodeURIComponent(q.q)}&per-page=5&select=id,title,publication_year,doi,type`);
    const closest = (j.results || []).map(w => ({ title: w.title, year: w.publication_year, url: w.doi || w.id, hit: q.must.some(m => norm(w.title).includes(norm(m))) }));
    out.push({ label: q.label, total: (j.meta && j.meta.count) ?? null, closest, possible_prior_work: closest.some(c => c.hit) });
  }
  return out;
}

export async function verifyEntry(f, s) {
  const citations = {}; let ok = true;
  for (const c of s.citations) {
    const r = await findPaper(f, c);
    if (r.found && c.numbers && c.numbers.length) {
      const a = await abstractOf(f, r.doi), missing = c.numbers.filter(n => !a.text.includes(n));
      r.numbers_checked = { via: a.via, quoted: c.numbers, missing };
      if (!a.text || missing.length) { r.found = false; r.reason = a.text ? `figure not in abstract: ${missing.join(', ')}` : 'no abstract to check the quoted figure against'; }
    }
    citations[c.id] = r; if (!r.found) ok = false;
  }
  let novelty = [], novelty_error = null;
  try { novelty = await noveltyCheck(f, s.novelty); } catch (e) { novelty_error = String(e.message || e); }
  return { status: ok ? 'verified' : 'failed', citations, novelty, novelty_error, checked_at: new Date().toISOString() };
}

export const loadDiscovered = () => existsSync(DISCOVERED) ? (JSON.parse(readFileSync(DISCOVERED, 'utf8')).entries || []) : [];
export const allSyntheses = (disc = loadDiscovered()) => [...SYNTHESES, ...disc.filter(d => !SYNTHESES.some(s => s.id === d.id))];

export async function verifyAll({ f = globalThis.fetch, prev = { entries: {} }, only = null, list = allSyntheses() } = {}) {
  const entries = { ...prev.entries }, errors = [];
  for (const s of list) {
    if (only && !only.includes(s.id)) continue;
    try { entries[s.id] = await verifyEntry(f, s); } catch (e) { errors.push({ id: s.id, error: String(e.message || e) }); }
  }
  return { schema: 'ps-syntheses-verified/1', at: new Date().toISOString(), entries, errors };
}

export function bcaOf(s) {
  const m = { id: s.id, title: s.title, ...s.model, contexts: {} }, errs = validate(m); if (errs.length) throw new Error(s.id + ': ' + errs.join('; '));
  const r = score(m, { draws: 3000, seed: SEED }), direct = s.model.nodes.find(n => n.kind === 'direct');
  const out = { wellby_per_1000_usd: r.wellby_per_1000_usd, wellby_total: r.wellby_total, unintended_per_1000_usd: r.unintended_per_1000_usd, prob_net_positive: r.prob_net_positive, evidence_share: r.evidence_share, order_share: r.order_share, sensitivity: (r.sensitivity || []).slice(0, 3), cost_usd: s.model.cost.upfront, nodes: s.model.nodes.map(n => ({ id: n.id, label: n.label, kind: n.kind, grade: n.grade, source: n.source })) };
  if (direct && direct.unit === 'daly' && direct.amount.kind === 'ci90') out.cost_per_daly = { low: Math.round(s.model.cost.upfront / direct.amount.high), high: Math.round(s.model.cost.upfront / direct.amount.low), note: 'direct effect only; interval is the range of the assumption, not a statistical confidence interval' };
  return out;
}

export function genModule(ledger, list = allSyntheses()) {
  const live = [], pending = [];
  for (const s of list) { const v = ledger.entries && ledger.entries[s.id]; if (v && v.status === 'verified') live.push({ ...s, model: undefined, verification: v, bca: bcaOf(s) }); else pending.push({ id: s.id, status: v ? v.status : 'unchecked' }); }
  const body = { schema: 'ps-syntheses/1', verified_at: ledger.at || null, published: live, pending };
  return `// SPDX-License-Identifier: LicenseRef-Ultrastable-USL-1.0\n// Copyright (c) 2026 Rowan Brad Quni-Gudzinas. Non-commercial use free; commercial use requires a license. See LICENSE.\n// GENERATED by tools/synth.mjs from worker/src/syntheses-data.js and ledger/syntheses-verified.json. Do not edit. Only verified syntheses appear.\nexport const SYNTHESES_PUBLISHED = ${JSON.stringify(body, null, 1)};\n`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const has = k => process.argv.includes(k), read = () => existsSync(LEDGER) ? JSON.parse(readFileSync(LEDGER, 'utf8')) : { entries: {} };
  if (has('--check')) { if (readFileSync(GEN, 'utf8') !== genModule(read())) { console.error(GEN + ' is stale: run node tools/synth.mjs --build'); process.exit(1); } console.log('syntheses.gen.js is current'); }
  else {
    let ledger = read();
    if (!has('--build')) { ledger = await verifyAll({ prev: ledger }); writeFileSync(LEDGER, JSON.stringify(ledger, null, 1) + '\n'); }
    writeFileSync(GEN, genModule(ledger));
    const statuses = Object.fromEntries(Object.entries(ledger.entries || {}).map(([k, v]) => [k, v.status]));
    console.log(JSON.stringify({ at: ledger.at, statuses, errors: ledger.errors || [] }));
    if (ledger.errors && ledger.errors.length) process.exitCode = 2;
  }
}
