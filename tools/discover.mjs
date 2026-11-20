// SPDX-License-Identifier: LicenseRef-Ultrastable-USL-1.0
// Copyright (c) 2026 Rowan Brad Quni-Gudzinas. Non-commercial use free; commercial use requires a license. See LICENSE.
// SYNTHESES-1 discovery loop. A model proposes new transfers and combinations of catalogue interventions, a second call red-teams each one,
// and the proposals that survive are written to ledger/synth-discovered.json. Nothing a model writes is published by this step: the entry
// still has to pass tools/synth.mjs (every paper found in Crossref, every quoted figure in its abstract) before it appears on the site.
// Models only propose and challenge; code decides. Model-proposed benefit-cost links are forced to grade D and labelled assumptions.
//   node tools/discover.mjs [--max 2]
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { SOLUTIONS } from '../worker/src/solutions.js';
import { PROBLEMS } from '../worker/src/problems.js';
import { validate } from '../vendor/ultrastable/core/benefitcost/index.js';
import { complete } from '../ps/llm.js';
import { SYNTHESES } from '../worker/src/syntheses-data.js';
import { DISCOVERED, loadDiscovered } from './synth.mjs';

const REQUIRED = ['id', 'title', 'headline', 'domain', 'problem', 'transfer', 'components', 'mechanism', 'citations', 'novelty', 'who', 'takes', 'first_test', 'cost_note', 'limits', 'risks', 'model'];
const KINDS = ['direct', 'multiplier', 'spillover', 'unintended'], UNITS = ['daly', 'death_averted', 'wellby', 'consumption_doubling_year'];
const catalogIds = new Set(SOLUTIONS.map(s => s.id));

// Structural check: everything the page needs, every citation checkable, a first test that can fail, a model the engine accepts.
export function validateCandidate(c) {
  const errs = [], need = (cond, msg) => { if (!cond) errs.push(msg); };
  for (const k of REQUIRED) need(c && c[k] != null && c[k] !== '', 'missing ' + k);
  if (errs.length) return errs;
  need(/^[a-z0-9-]{4,60}$/.test(c.id), 'id must be kebab-case');
  need(Array.isArray(c.components) && c.components.length >= 1 && c.components.every(x => catalogIds.has(x)), 'components must be catalogue ids');
  need(Array.isArray(c.citations) && c.citations.length >= 3 && c.citations.every(x => x.id && x.q && Number.isInteger(x.year) && x.cite && x.supports && x.role), 'at least three citations, each with id, exact title (q), year, cite, supports and role');
  need(c.citations.every(x => !x.numbers || x.numbers.length === 0), 'discovered entries may not quote figures (numbers must be empty); only hand-checked entries do');
  need(c.novelty && c.novelty.statement && Array.isArray(c.novelty.queries) && c.novelty.queries.length >= 1 && c.novelty.queries.every(q => q.label && q.q && Array.isArray(q.must) && q.must.length), 'novelty needs a statement and queries with must-words');
  need(Array.isArray(c.risks) && c.risks.length >= 2, 'at least two risks');
  need(/stop|fail|not at least|if .*(below|under|less)/i.test(c.first_test), 'first test must state when it fails');
  need(c.transfer && c.transfer.from && c.transfer.to, 'transfer needs from and to');
  const m = c.model; need(m && m.cost && m.cost.upfront > 0 && Array.isArray(m.nodes) && m.nodes.length >= 1, 'model needs a cost and nodes');
  if (m && Array.isArray(m.nodes)) { need(m.nodes.every(n => KINDS.includes(n.kind) && UNITS.includes(n.unit)), 'node kind or unit not allowed'); need(m.nodes.some(n => n.kind === 'direct'), 'a direct node is required'); }
  need(!SYNTHESES.some(s => s.id === c.id) && !loadDiscovered().some(s => s.id === c.id), 'id already exists');
  return errs;
}
// Model-proposed links are assumptions: grade D, source says so, whatever the model claimed.
export function sanitize(c) { const m = { ...c.model, nodes: c.model.nodes.map(n => ({ ...n, grade: 'D', source: 'assumption proposed by a model: ' + String(n.source || n.label).slice(0, 160) })) }; return { ...c, model: m, discovered: true }; }
export function modelAccepted(c) { const errs = validate({ id: c.id, title: c.title, ...c.model, contexts: {} }); return errs; }

const json = t => { const m = /[\[{][\s\S]*[\]}]/.exec(String(t || '')); if (!m) return null; try { return JSON.parse(m[0]); } catch { return null; } };
// NOVEL-SEED-1: a rotating cross-sector pairing and a list of standard programmes to exclude, so proposals are not rewordings.
export const STANDARD = ['unconditional or conditional cash transfers', 'graduation (ultra-poor) programmes', 'community health worker programmes', 'insecticide-treated bed nets', 'oral rehydration with zinc', 'kangaroo mother care', 'school feeding', 'deworming', 'microfinance', 'vaccination drives'];
export function seedPair(n = 0, list = SOLUTIONS) {
  const a = list[n % list.length], rest = list.filter(s => !(s.problem_ids || []).some(p => (a.problem_ids || []).includes(p)) && s.id !== a.id), b = (rest.length ? rest : list.filter(s => s.id !== a.id))[Math.floor(n / list.length) % Math.max(1, (rest.length || list.length - 1))];
  return [a, b];
}
export const proposePrompt = (max, existing, papers = [], seed = null) => `You propose NEW practical solutions made by transferring or combining interventions that published studies support, to a context or combination that no published trial has tested. Do not invent papers: every citation must be a real, published paper whose exact title and year you are sure of.${papers.length ? ' Cite ONLY papers from the verified list below, copying each title and year exactly; an idea that needs a paper not on the list is left out.' : ''} Do not quote figures (leave "numbers" as an empty list). If you are not sure a paper exists, leave that idea out.

${papers.length ? 'Verified papers (found in Crossref):\n' + papers.map(p => `- ${p.title} (${p.year})`).join('\n') + '\n\n' : ''}Catalogue entries you may build on (use their ids in "components"):
${SOLUTIONS.slice(0, 30).map(s => `- ${s.id}: ${s.title}`).join('\n')}

Pressing problems with a measured gap to target: ${PROBLEMS.map(p => p.title).join('; ')}.
Already proposed (do not repeat): ${existing.join(', ')}.
Standard programmes (a proposal that is a rewording of any of these, or of any catalogue entry above, is rejected by the reviewer): ${STANDARD.join('; ')}.${seed ? `\nStart from this cross-sector pairing and ask what one lends the other that neither has been tried with: "${seed[0].title}" and "${seed[1].title}". The novelty must be a mechanism or delivery channel carried from one setting into another, not a bundle of two programmes.` : ''}

Return a JSON array of at most ${max} objects, nothing else. Each object has exactly these fields: id (kebab-case), title, headline (one sentence an implementer can act on), domain, problem, transfer {from, to}, components (catalogue ids), mechanism (why the parts should combine), citations (3 to 5 of {id, role, cite, q (exact paper title), year (integer), numbers: [], supports (what the paper shows)}), novelty {statement, queries: [{label, q, must: [words that would appear in the title of a paper that already tested this]}]}, who, takes, first_test (a cheap randomised pilot that states a stop rule: when it counts as failed), cost_note, limits, risks (at least 2), model {cost: {upfront: USD, years: 1}, nodes: [{id, label, kind: "direct"|"multiplier"|"spillover"|"unintended", parent (for non-direct), amount: {kind: "ci90", low, high, shape: "lognormal"}, unit: "daly"|"death_averted"|"wellby"|"consumption_doubling_year", years, source: "assumption: show the arithmetic"}]}.`;
export const redTeamPrompt = c => `You are a hostile reviewer. A proposal says: "${c.title}": ${c.headline} It combines: ${c.transfer.from} -> ${c.transfer.to}. Cited papers: ${c.citations.map(x => `${x.q} (${x.year})`).join('; ')}.
Say whether it is fatally flawed: (a) a published trial of exactly this combination already exists, (b) a cited paper does not exist or does not support what is claimed, (c) it is likely to cause harm, or (d) it is a rewording of a standard programme. Reply with one JSON object only: {"fatal": true|false, "reasons": ["..."], "closest_existing_work": "title or none"}.`;

export const norm = t => String(t || '').toLowerCase().replace(/<[^>]+>/g, ' ').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
// GROUNDING-1: the model cannot recall papers reliably (every citation of the first two proposals failed verification), so it is handed real
// titles from Crossref for a rotating sample of catalogue interventions and may cite only those.
export async function groundPapers({ f = globalThis.fetch, n = 8, now = Date.now() } = {}) {
  const pool = SOLUTIONS.slice(0, 30), start = Math.floor(now / 86400000) % pool.length, out = [];
  for (let i = 0; i < n; i++) {
    const s = pool[(start + i) % pool.length];
    try { const r = await f(`https://api.crossref.org/works?query.bibliographic=${encodeURIComponent(s.title + ' randomized trial')}&rows=3&select=title,issued&filter=type:journal-article`, { headers: { 'user-agent': 'practical-solutions-discovery (+https://ultrastable.org/method)' } });
      if (!r.ok) continue; const j = await r.json();
      for (const it of (j.message && j.message.items) || []) { const t = (it.title || [])[0], y = it.issued && it.issued['date-parts'] && it.issued['date-parts'][0] && it.issued['date-parts'][0][0]; if (t && Number.isInteger(y)) out.push({ title: t, year: y }); }
    } catch (e) { console.error('grounding lookup failed for ' + s.id + ': ' + String(e.message || e)); }
  }
  return out;
}

// REPAIR-1: free models drop bookkeeping fields (id, cite, role) from a citation while keeping the paper itself; fill those in from the paper's title and year
// and never invent the substance: a citation still needs a title, an integer year and what it supports.
export const repairCitations = c => !c || !Array.isArray(c.citations) ? c : { ...c, citations: c.citations.map((x, i) => { if (!x || typeof x !== 'object') return x; const q = x.q || x.title, year = typeof x.year === 'string' && /^\d{4}$/.test(x.year) ? Number(x.year) : x.year;
  return { ...x, q, year, id: x.id || String(i + 1), role: x.role || 'Supporting study', cite: x.cite || (q ? `${q} (${year})` : x.cite), numbers: Array.isArray(x.numbers) ? x.numbers : [] }; }) };

// DISCOVER-1: the knowledge graph's best untried combination seeds the proposal, so the graph's leads become verified syntheses and, when one
// is published, the graph confirms its own lead. Falls back to the rotating pairing when the graph has no open combination.
export function graphSeed(ledger, list = SOLUTIONS) {
  const by = new Map(list.map(s => [s.id, s]));
  const open = Object.values((ledger && ledger.entries) || {}).filter(e => e.type === 'combination' && (e.status === 'new' || e.status === 'standing') && !e.seeded)
    .map(e => ({ e, pair: e.members.map(m => by.get(String(m).replace(/^s:/, ''))) })).filter(x => x.pair.every(Boolean)).sort((a, b) => b.e.score - a.e.score);
  return open.length ? { id: open[0].e.id, pair: open[0].pair } : null;
}
export async function discover({ ask, ground = null, max = 2, prev = { entries: [], log: [] }, now = () => new Date().toISOString(), seed = null }) {
  const existing = [...SYNTHESES.map(s => s.id), ...prev.entries.map(s => s.id)], log = [...prev.log], entries = [...prev.entries];
  const papers = ground ? await ground().catch(e => { log.push({ at: now(), event: 'grounding failed', detail: String(e.message || e).slice(0, 120) }); return []; }) : [], seen = new Set(papers.map(p => norm(p.title)));
  const out = await ask(proposePrompt(max, existing, papers, seed || seedPair(Math.floor(Date.parse(now()) / 1000) % 997))), list = json(out);
  if (!Array.isArray(list)) { log.push({ at: now(), event: 'no usable proposal', detail: String(out || '').slice(0, 120) }); return { schema: 'ps-synth-discovered/1', at: now(), entries, log: log.slice(-100) }; }
  for (const raw0 of list.slice(0, max)) {
    let raw = repairCitations(raw0), errs = validateCandidate(raw);
    if (errs.length) { // REPAIR-2: one model round trip to fix exactly the named defects, keeping the paper titles it already chose
      const fixed = json(await ask(`This proposal failed validation: ${errs.join('; ')}. Return the SAME proposal as one JSON object with those defects fixed. Every citation must be {id, role, cite, q (exact paper title), year (integer), numbers: [], supports (what the paper shows)}, with at least three citations${papers.length ? ' taken only from this verified list: ' + papers.map(p => `${p.title} (${p.year})`).join('; ') : ''}. Proposal: ${JSON.stringify(raw)}`));
      if (fixed && !Array.isArray(fixed)) { raw = repairCitations(fixed); errs = validateCandidate(raw); }
    }
    if (errs.length) { const cs = Array.isArray(raw && raw.citations) ? raw.citations : []; log.push({ at: now(), id: raw && raw.id, event: 'rejected: structure', detail: [...errs.slice(0, 5), `citations=${cs.length}; fields seen: ${[...new Set(cs.flatMap(x => x && typeof x === 'object' ? Object.keys(x) : []))].join(',')}`] }); continue; }
    if (papers.length && raw.citations.some(x => !seen.has(norm(x.q)))) { log.push({ at: now(), id: raw.id, event: 'rejected: citation outside the verified list' }); continue; }
    const c = sanitize(raw), merr = modelAccepted(c); if (merr.length) { log.push({ at: now(), id: c.id, event: 'rejected: model', detail: merr }); continue; }
    const rt = json(await ask(redTeamPrompt(c))) || {};
    if (rt.fatal !== false) { log.push({ at: now(), id: c.id, event: rt.fatal === true ? 'rejected: red team' : 'rejected: red team gave no verdict', detail: rt.reasons || [] }); continue; }
    entries.push({ ...c, red_team: { at: now(), reasons: rt.reasons || [], closest_existing_work: rt.closest_existing_work || null } }); log.push({ at: now(), id: c.id, event: 'accepted for verification' });
  }
  return { schema: 'ps-synth-discovered/1', at: now(), entries, log: log.slice(-100) };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const i = process.argv.indexOf('--max'), max = i > 0 ? Number(process.argv[i + 1]) : 2;
  const ask = async prompt => { const r = await complete({ secrets: process.env, prompt: 'Reply with JSON only.\n\n' + prompt, maxTokens: 6000 }); return r.ok ? r.text : ''; };
  const prev = existsSync(DISCOVERED) ? JSON.parse(readFileSync(DISCOVERED, 'utf8')) : { entries: [], log: [] };
  const CONN = 'ledger/connections.json', ledger = existsSync(CONN) ? JSON.parse(readFileSync(CONN, 'utf8')) : null, g = graphSeed(ledger);
  const r = await discover({ ask, max, prev, ground: () => groundPapers(), seed: g ? g.pair : null });
  writeFileSync(DISCOVERED, JSON.stringify(r, null, 1) + '\n');
  if (g) { ledger.entries[g.id] = { ...ledger.entries[g.id], seeded: new Date().toISOString() }; writeFileSync(CONN, JSON.stringify(ledger, null, 1) + '\n'); }
  console.log(JSON.stringify({ entries: r.entries.length, last: r.log.slice(-3) }));
}
