// SPDX-License-Identifier: LicenseRef-Ultrastable-USL-1.0
// Copyright (c) 2026 Rowan Brad Quni-Gudzinas. Non-commercial use free; commercial use requires a license. See LICENSE.
// CONNECT-1 (tenant side): the catalogue as a knowledge graph plus vectors, run through the core connection engine (vendor core/connect).
// Items: the curated problems, the 789-entry problem catalogue (PROBLEM-SCAN-1) and every solution. Edges: solution -addresses-> problem.
// The engine ranks connections nobody has made: a proven solution for a problem that means nearly the same as an unsolved one (transfer),
// two solutions from different domains that share a mechanism (bridge), and Swanson ABC closures. The shortlist seeds the discovery loop
// (tools/discover.mjs) in place of a blind rotation; what happens to each seed downstream comes back as an outcome and re-weights the engine.
//   node tools/connect.mjs            embed (first route that answers), discover, check prior work in OpenAlex, write the ledger and module
//   node tools/connect.mjs --offline  lexical route only, no prior-work search (tests, and any run with no network)
//   node tools/connect.mjs --build    rebuild worker/src/connections.gen.js from the ledger, no network
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { PROBLEMS } from '../worker/src/problems.js';
import { SOLUTIONS } from '../worker/src/solutions.js';
import { SCAN } from '../worker/src/problem-scan.gen.js';
import { SYNTHESES } from '../worker/src/syntheses-data.js';
import { lexicalEmbedder, githubModelsEmbedder, httpEmbedder, embedAll, discover, calibrate, questions } from '../vendor/ultrastable/core/connect/index.js';
import { tokenize } from '../vendor/ultrastable/core/ask/index.js';

export const LEDGER = 'ledger/connections.json', VECTORS = 'ledger/connect-vectors.json', GEN = 'worker/src/connections.gen.js', DISCOVERED = 'ledger/synth-discovered.json';
export const SHORTLIST = 30, PRIOR_CHECKS = 12;
const DESIGN_W = { review: 1, trial: 0.85, observational: 0.6, guidance: 0.45 }, VERDICT_W = { works: 1, mixed: 0.7, limited: 0.5 };

// Problems, scanned problems and solutions as items. A scanned indicator that IS a curated problem's indicator is the same node, not a new one.
export function catalogueItems({ problems = PROBLEMS, solutions = SOLUTIONS, scan = SCAN } = {}) {
  const curatedInd = new Map(problems.map(p => [p.ind, p.id]));
  const items = problems.map(p => ({ id: 'problem:' + p.id, kind: 'problem', label: p.title, group: p.domain, weight: 1, url: '/problems/' + p.id, text: `${p.title}. ${p.domain}. Measured as ${p.unit || p.ind}.` }));
  for (const e of scan.entries || []) if (!curatedInd.has(e.code)) items.push({ id: 'scan:' + e.id, kind: 'problem', label: e.title, group: e.domain || 'Other', weight: 0.6, url: '/catalogue/' + e.id, text: `${e.title}. ${e.domain || ''}.` });
  for (const s of solutions) {
    const dom = (problems.find(p => (s.problem_ids || []).includes(p.id)) || {}).domain || 'Other';
    items.push({ id: 'solution:' + s.id, kind: 'solution', label: s.title, group: dom, weight: (DESIGN_W[s.design] ?? 0.6) * (VERDICT_W[s.verdict] ?? 0.8), url: '/solutions/' + s.id,
      text: [s.title, s.claim, s.problem && 'Problem: ' + s.problem, s.takes && 'Takes: ' + s.takes].filter(Boolean).join('. ').slice(0, 1500) });
  }
  const edges = solutions.flatMap(s => (s.problem_ids || []).map(p => ({ src: 'solution:' + s.id, rel: 'addresses', dst: 'problem:' + p, status: 'confirmed', provenance: [{ source: (s.evidence && s.evidence[0] && s.evidence[0].src) || 'catalogue' }] })));
  return { items, edges };
}

// Pairs already explored are not novel: every published or discovered synthesis, every seed handed on before.
export function knownPairs(ledger, syntheses = SYNTHESES, discovered = []) {
  const k = [];
  for (const s of [...syntheses, ...discovered]) { const c = (s.components || []).map(x => 'solution:' + x); for (let i = 0; i < c.length; i++) for (let j = i + 1; j < c.length; j++) k.push({ members: [c[i], c[j]] }); }
  for (const [id, h] of Object.entries((ledger && ledger.history) || {})) if (h.status === 'handed' && h.members) k.push({ members: h.members });
  return k;
}

export const WORDING = {
  transfer: x => `"${x.a}" works against ${x.via[0] ? '"' + x.via[0] + '"' : 'a related problem'}. Would the same mechanism reduce "${x.b}", which nobody has linked it to?`,
  bridge: x => `"${x.a}" and "${x.b}" come from different domains but work in a similar way. What does one lend the other that neither has been tried with?`,
  closure: x => `"${x.a}" shares a problem with "${x.via[1] || 'another solution'}", which also addresses "${x.b}". Would "${x.a}" address "${x.b}" too?`,
};

// OpenAlex: how many works mention the key words of both ends. Few is a signal of novelty, never proof; none of this changes the score.
const keyTerms = (label, n = 3) => [...new Set(tokenize(label).filter(w => w.length > 3 && !/^(percent|total|population|prevalence|number|rate|people|ages|female|male|years?)$/.test(w)))].slice(0, n);
export async function priorWork(f, a, b) {
  const q = [...keyTerms(a), ...keyTerms(b)].join(' ');
  const r = await f(`https://api.openalex.org/works?mailto=verifier@ultrastable.org&search=${encodeURIComponent(q)}&per-page=3&select=id,title,publication_year,doi`, { headers: { 'user-agent': 'practical-solutions-connect (+https://ultrastable.org/method)' } });
  if (!r.ok) throw new Error('OpenAlex HTTP ' + r.status);
  const j = await r.json();
  return { query: q, total: (j.meta && j.meta.count) ?? null, closest: (j.results || []).map(w => ({ title: w.title, year: w.publication_year, url: w.doi || w.id })) };
}

export function embedRoutes(env, { offline = false, corpus }) {
  const r = [];
  if (!offline && (env.GITHUB_MODELS_TOKEN || env.GITHUB_TOKEN)) r.push(githubModelsEmbedder({ token: env.GITHUB_MODELS_TOKEN || env.GITHUB_TOKEN }));
  if (!offline && env.PS_LLM_URL && env.ACTIONS_ID_TOKEN_REQUEST_URL && env.ACTIONS_ID_TOKEN_REQUEST_TOKEN) r.push(httpEmbedder({ url: env.PS_LLM_URL, token: async () => {
    const t = await fetch(`${env.ACTIONS_ID_TOKEN_REQUEST_URL}&audience=practical-solutions-llm`, { headers: { authorization: `Bearer ${env.ACTIONS_ID_TOKEN_REQUEST_TOKEN}` } }); return (await t.json()).value; } }));
  r.push(lexicalEmbedder(corpus, { dim: 512 }));
  return r;
}

// The whole run as a pure-ish function: ports in, ledger out.
export async function run({ env = {}, offline = false, f = globalThis.fetch, now = () => new Date().toISOString(), prev = null, cache = {}, discovered = [], log = console.error } = {}) {
  const { items, edges } = catalogueItems();
  const emb = await embedAll(items, { embedders: embedRoutes(env, { offline, corpus: items.map(i => i.text) }), cache, log });
  const history = { ...((prev && prev.history) || {}) };
  const cal = calibrate(Object.entries(history).filter(([, h]) => h.outcome).map(([id, h]) => ({ id, outcome: h.outcome })));
  const { candidates, stats } = discover({ items, edges, vectors: emb.vectors, spec: { pair: 'solution', limit: SHORTLIST, perItem: 2, kindWeight: cal.kindWeight }, known: knownPairs(prev, SYNTHESES, discovered) });
  const by = new Map(items.map(i => [i.id, i])), qs = new Map(questions(candidates, items, WORDING).map(q => [q.id, q.text]));
  const out = [];
  for (const [i, c] of candidates.entries()) {
    const A = by.get(c.a), B = by.get(c.b);
    let prior = null;
    if (!offline && i < PRIOR_CHECKS) { try { prior = await priorWork(f, A.label, B.label); } catch (e) { prior = { error: String(e.message || e).slice(0, 120) }; } }
    out.push({ id: c.id, kind: c.kind, found_by: c.found_by, score: c.score, relevance: c.relevance, novelty: c.novelty, support: c.support, sims: c.sims,
      a: { id: c.a, label: A.label, url: A.url, domain: A.group }, b: { id: c.b, label: B.label, url: B.url, domain: B.group }, via: c.via.map(v => ({ id: v, label: (by.get(v) || {}).label || v, url: (by.get(v) || {}).url || null })),
      question: qs.get(c.id), prior_work: prior });
    if (!history[c.id]) history[c.id] = { first_seen: now().slice(0, 10), status: 'listed', members: [c.a, c.b].sort() };
    history[c.id].last_seen = now().slice(0, 10);
  }
  return { ledger: { schema: 'ps-connections/1', at: now(), route: emb.route, routes_tried: emb.tried, embedded: emb.embedded, cached: emb.cached, stats, calibration: cal, candidates: out, history }, cache: emb.cache };
}

export function buildModule(ledger) {
  const pub = { schema: ledger.schema, at: ledger.at, route: ledger.route, stats: ledger.stats, calibration: { kindWeight: ledger.calibration.kindWeight, tried: ledger.calibration.tried, accepted: ledger.calibration.accepted },
    candidates: ledger.candidates, handed: Object.entries(ledger.history).filter(([, h]) => h.status === 'handed').map(([id, h]) => ({ id, handed_at: h.handed_at, outcome: h.outcome || null, synthesis: h.synthesis || null })).slice(-50) };
  return `// SPDX-License-Identifier: LicenseRef-Ultrastable-USL-1.0\n// Copyright (c) 2026 Rowan Brad Quni-Gudzinas. Non-commercial use free; commercial use requires a license. See LICENSE.\n// GENERATED by tools/connect.mjs from ${LEDGER}. Do not edit.\nexport const CONNECTIONS = ${JSON.stringify(pub)};\n`;
}

const readJson = (p, d) => (existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : d);
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop())) {
  const args = process.argv.slice(2);
  if (args.includes('--build')) { writeFileSync(GEN, buildModule(readJson(LEDGER, null))); console.log('built ' + GEN); }
  else {
    const offline = args.includes('--offline');
    const { ledger, cache } = await run({ env: process.env, offline, prev: readJson(LEDGER, null), cache: readJson(VECTORS, { vectors: {} }).vectors, discovered: readJson(DISCOVERED, { entries: [] }).entries });
    writeFileSync(LEDGER, JSON.stringify(ledger, null, 1) + '\n');
    if (!offline || !existsSync(VECTORS)) writeFileSync(VECTORS, JSON.stringify({ schema: 'ps-connect-vectors/1', route: ledger.route, vectors: cache }) + '\n');
    writeFileSync(GEN, buildModule(ledger));
    console.log(JSON.stringify({ route: ledger.route, tried: ledger.routes_tried, embedded: ledger.embedded, cached: ledger.cached, stats: ledger.stats, top: ledger.candidates.slice(0, 5).map(c => `${c.score} ${c.kind} ${c.a.label} -> ${c.b.label}`) }, null, 1));
  }
}
