// SPDX-License-Identifier: LicenseRef-Ultrastable-USL-1.0
// Copyright (c) 2026 Rowan Brad Quni-Gudzinas. Non-commercial use free; commercial use requires a license. See LICENSE.
// The continuous-improvement tick. Each cron run does a bounded slice of four jobs and records what changed:
//   1. refresh the problem ranking from World Bank indicators (at most every 6 hours)
//   2. re-verify solutions: search Europe PMC (health) or OpenAlex (economics) for the cited paper and check that the quoted numbers are in its abstract
//   3. look for new candidate evidence: recent Cochrane reviews for the problems that rank highest
//   4. append every change to a capped changelog
// Self-contained and injectable: `store` has get/put (a KV namespace fits), `fetchFn` is fetch. No model calls, no core bindings.
import { findSpots } from './brightspots.js';
import { buildGraph, questionsFor, unsolvedProblemIds } from './graph.js';
const EPMC = 'https://www.ebi.ac.uk/europepmc/webservices/rest/search';
// Economics and development papers (JPE, Econometrica, JEP, QJE) are mostly outside Europe PMC; OpenAlex indexes them with abstracts.
const OPENALEX = 'https://api.openalex.org/works';
const HOUR = 3600e3;
// cadence the /method page states, rendered from here
export const CADENCE = { problemsHours: 6, checkHours: 24, maxVerify: 3, candidateSearchesPerRun: 1, brightSpotHours: 24 };
const BACKEND_URL = 'https://ps-practical-solutions.q08.workers.dev';

export const SEARCH = {
  tobacco: 'tobacco smoking cessation',
  under5: 'child mortality', neonatal: 'neonatal mortality newborn', maternal: 'maternal mortality', ncd: 'hypertension cardiovascular mortality',
  suicide: 'suicide prevention depression', tb: 'tuberculosis treatment', poverty: 'cash transfer poverty', hunger: 'malnutrition food insecurity',
  water: 'drinking water treatment diarrhoea', cooking: 'cookstove household air pollution', education: 'learning outcomes primary school',
  road: 'road traffic injury prevention', electricity: 'rural electrification', sanitation: 'sanitation diarrhoea', stunting: 'child stunting nutrition', air: 'air pollution health', internet: 'internet access development', 'women-power': 'women political representation', finance: 'financial inclusion poverty', birthreg: 'birth registration',
};

const strip = s => String(s || '').replace(/<[^>]+>/g, ' ');

async function epmc(fetchFn, query, size, sorted = true) {
  const u = `${EPMC}?query=${encodeURIComponent(query)}&format=json&resultType=core&pageSize=${size}${sorted ? '&sort=' + encodeURIComponent('P_PDATE_D desc') : ''}`;
  const r = await fetchFn(u);
  if (!r.ok) throw new Error(`Europe PMC HTTP ${r.status}`);
  return ((await r.json()).resultList || {}).result || [];
}

// OpenAlex returns abstracts as an inverted index (word -> positions); rebuild the text so the same quote check applies.
export function oaAbstract(inv) {
  if (!inv) return '';
  const words = [];
  for (const [w, pos] of Object.entries(inv)) for (const i of pos) words[i] = w;
  return words.filter(w => w !== undefined).join(' ');
}

const S2 = 'https://api.semanticscholar.org/graph/v1/paper/search';
const CROSSREF = 'https://api.crossref.org/works';
async function openalexOnly(fetchFn, c, mailto) {
  const u = `${OPENALEX}?search=${encodeURIComponent(c.title || c.q)}&filter=publication_year:${c.year}&per-page=10${mailto ? '&mailto=' + encodeURIComponent(mailto) : ''}`;
  const r = await fetchFn(u);
  if (!r.ok) throw new Error(`OpenAlex HTTP ${r.status}`);
  return ((await r.json()).results || []).map(x => ({ title: x.title || x.display_name, doi: x.doi || null, pmid: null, abstractText: oaAbstract(x.abstract_inverted_index) }));
}
async function semanticScholar(fetchFn, c) {
  const r = await fetchFn(`${S2}?query=${encodeURIComponent(c.title || c.q)}&year=${c.year}&limit=10&fields=title,year,abstract,externalIds`);
  if (!r.ok) throw new Error(`Semantic Scholar HTTP ${r.status}`);
  return ((await r.json()).data || []).map(x => ({ title: x.title, doi: (x.externalIds || {}).DOI || null, pmid: null, abstractText: x.abstract || '' }));
}
async function crossref(fetchFn, c, mailto) {
  const r = await fetchFn(`${CROSSREF}?query.bibliographic=${encodeURIComponent(c.title || c.q)}&filter=from-pub-date:${c.year},until-pub-date:${c.year}&rows=10&select=title,DOI,abstract${mailto ? '&mailto=' + encodeURIComponent(mailto) : ''}`);
  if (!r.ok) throw new Error(`Crossref HTTP ${r.status}`);
  return (((await r.json()).message || {}).items || []).map(x => ({ title: (x.title || [])[0], doi: x.DOI || null, pmid: null, abstractText: x.abstract || '' }));
}
// SOURCE-LADDER-1: OpenAlex answers 429 to shared Worker egress even with a contact address. Economics papers are checked against OpenAlex, then Semantic
// Scholar, then Crossref; a rung that fails (HTTP error) or has no abstract containing the quoted numbers hands over to the next, and the last error is thrown
// only when every rung failed. Never a key from a person: all three are open APIs.
export async function openalex(fetchFn, c, mailto) {
  const rungs = [() => openalexOnly(fetchFn, c, mailto), () => semanticScholar(fetchFn, c), () => crossref(fetchFn, c, mailto)];
  let rows = [], lastErr = null, answered = 0;
  for (const rung of rungs) {
    try {
      const got = await rung(); answered++;
      if (got.some(x => c.numbers.every(n => strip(x.abstractText).includes(n)))) return got;
      if (got.length > rows.length) rows = got;
    } catch (e) { lastErr = e; }
  }
  if (!answered) throw lastErr;
  return rows;
}

export async function verifySolution(fetchFn, sol, { mailto } = {}) {
  const checks = sol.checks || [];
  if (!checks.length) return { status: 'no_check', detail: 'no automated check defined' };
  const out = [];
  for (const c of checks) {
    const rows = c.source === 'openalex' ? await openalex(fetchFn, c, mailto) : await epmc(fetchFn, c.title ? `TITLE:"${c.title}" AND PUB_YEAR:${c.year}` : `${c.q} AND PUB_YEAR:${c.year}`, 10, false);
    const hit = rows.find(x => c.numbers.every(n => strip(x.abstractText).includes(n)));
    out.push(hit ? { ok: true, title: hit.title, pmid: hit.pmid || null, doi: hit.doi || null } : { ok: false, found: rows.length });
  }
  const ok = out.every(x => x.ok);
  return { status: ok ? 'verified' : (out.some(x => x.found > 0) ? 'mismatch' : 'not_found'), detail: out };
}

export function verifiedText(v, today) {
  if (!v) return null;
  if (v.status === 'verified') return `automatically checked ${v.at.slice(0, 10)}: the quoted numbers appear in the abstract of "${(v.detail[0] || {}).title || 'the cited paper'}".`;
  if (v.status === 'mismatch') return `automatic check ${v.at.slice(0, 10)} FOUND papers but not the quoted numbers; treat the figures as unconfirmed.`;
  if (v.status === 'not_found') return `automatic check ${v.at.slice(0, 10)} could not find the cited paper in Europe PMC.`;
  return null;
}

async function getJson(store, k, d) { const v = await store.get(k); return v ? JSON.parse(v) : d; }
const putJson = (store, k, v) => store.put(k, JSON.stringify(v));

// A failed source call is an operational fact, not a change to the catalogue: it goes to the 'errors' log (deduplicated, with a count), never to the public changes feed.
const isError = c => /_error$/.test(c.kind || '');
const retryAfterHours = attempts => Math.min(CADENCE.checkHours, 2 ** Math.max(0, attempts - 1));
export async function recordErrors(store, errors, at) {
  if (!errors.length) return;
  const log = await getJson(store, 'errors', []);
  for (const e of errors) {
    const key = [e.kind, e.id || e.problem || '', e.error].join('|');
    const hit = log.find(x => x.key === key);
    if (hit) { hit.count += 1; hit.last = at; } else log.unshift({ key, kind: e.kind, id: e.id || e.problem || null, error: e.error, first: at, last: at, count: 1 });
  }
  await putJson(store, 'errors', log.slice(0, 100));
}

export async function tick({ store, fetchFn = fetch, rank, now = Date.now(), maxVerify = CADENCE.maxVerify, mailto }) {
  const at = new Date(now).toISOString();
  const changes = [];
  // 1. problems
  const prev = await getJson(store, 'problems', null);
  if (!prev || !(prev.problems || []).length || now - Date.parse(prev.at) > CADENCE.problemsHours * HOUR) {
    const r = await rank(fetchFn);
    const old = Object.fromEntries(((prev || {}).problems || []).map(p => [p.id, p]));
    for (const p of r.problems) {
      const o = old[p.id];
      if (!o) { if (prev) changes.push({ kind: 'problem_added', id: p.id }); }
      else if (o.rank !== p.rank || o.year !== p.year) changes.push({ kind: 'problem_moved', id: p.id, from_rank: o.rank, to_rank: p.rank, year: p.year });
    }
    await putJson(store, 'problems', { ...r, at });
  }
  const problems = await getJson(store, 'problems', { problems: [] });
  // 2. verification of the stalest solutions
  const sols = await getJson(store, 'solutions', []);
  const verif = await getJson(store, 'verif', {});
  const dueAt = v => v.retry_at ? Date.parse(v.retry_at) : Date.parse(v.at) + CADENCE.checkHours * HOUR;
  const due = sols.filter(s => (s.checks || []).length && (!verif[s.id] || now >= dueAt(verif[s.id])))
    .sort((a, b) => Date.parse((verif[a.id] || { at: 0 }).at) - Date.parse((verif[b.id] || { at: 0 }).at)).slice(0, maxVerify);
  for (const s of due) {
    try {
      const v = await verifySolution(fetchFn, s, { mailto });
      if (!verif[s.id] || verif[s.id].status !== v.status) changes.push({ kind: 'verification', id: s.id, status: v.status });
      verif[s.id] = { ...v, at };
    } catch (e) {
      // keep the last good result; retry with backoff (1 h, 2 h, 4 h ... up to the check interval) instead of on every tick
      const prev = verif[s.id] || {}, attempts = (prev.attempts || 0) + 1, error = String(e.message || e);
      verif[s.id] = { ...prev, at: prev.at || at, attempts, last_error: { at, error }, retry_at: new Date(now + retryAfterHours(attempts) * HOUR).toISOString() };
      changes.push({ kind: 'verification_error', id: s.id, error });
    }
  }
  await putJson(store, 'verif', verif);
  // 3. candidate evidence for one top problem per tick, rotating
  const cand = await getJson(store, 'candidates', {});
  const top = problems.problems.slice(0, 5);
  // a problem with no solution in the catalogue always joins the search rotation, so gaps like TB are worked on until they are filled
  const open = new Set(await unsolvedProblemIds(sols));
  const pool = [...new Map([...problems.problems.filter(p => open.has(p.id)), ...top].map(p => [p.id, p])).values()];
  if (top.length) {
    const p = [...pool].sort((a, b) => Date.parse((cand[a.id] || { at: 0 }).at) - Date.parse((cand[b.id] || { at: 0 }).at))[0];
    try {
      const rows = (await epmc(fetchFn, `(${SEARCH[p.id] || p.title}) AND JOURNAL:"Cochrane Database Syst Rev" AND PUB_YEAR:[2015 TO 2030] AND (mortality OR death OR survival)`, 12, false)).filter(x => !/This is a protocol/i.test(strip(x.abstractText))).slice(0, 4);
      const items = rows.map(x => ({ title: strip(x.title), year: x.pubYear, pmid: x.pmid || null, doi: x.doi || null, abstract: strip(x.abstractText).slice(0, 600) }));
      const known = new Set(((cand[p.id] || {}).items || []).map(i => i.pmid));
      for (const i of items) if (i.pmid && !known.has(i.pmid) && cand[p.id]) changes.push({ kind: 'candidate_added', problem: p.id, title: i.title });
      cand[p.id] = { at, items };
      await putJson(store, 'candidates', cand);
    } catch (e) { changes.push({ kind: 'candidate_error', problem: p.id, error: String(e.message || e) }); }
  }
  // 3a. bright spots: countries beating their income-predicted level in two periods, for one top problem per tick
  const bs = await getJson(store, 'brightspots', {});
  if (top.length) {
    const p = [...top].sort((a, b) => Date.parse((bs[a.id] || { at: 0 }).at) - Date.parse((bs[b.id] || { at: 0 }).at))[0];
    if (!bs[p.id] || now - Date.parse(bs[p.id].at) > CADENCE.brightSpotHours * HOUR) {
      try {
        const r = await findSpots(fetchFn, p, { now: new Date(now).getUTCFullYear() });
        const before = new Set(((bs[p.id] || {}).spots || []).map(x => x.iso));
        for (const s of r.spots) if (bs[p.id] && !before.has(s.iso)) changes.push({ kind: 'brightspot_added', problem: p.id, id: s.iso, title: s.name });
        bs[p.id] = { at, ...r };
        await putJson(store, 'brightspots', bs);
      } catch (e) { changes.push({ kind: 'brightspot_error', problem: p.id, error: String(e.message || e) }); }
    }
  }
  // 3b. extract and independently review drafts from candidate evidence
  changes.push(...await draftStep({ store, fetchFn, at }));
  // 3c. knowledge graph: rebuild from the catalogue and the outreach interface's agency nodes; its gaps are the questions the loop works on next
  try {
    let agencies = await getJson(store, 'agencies_view', null);
    if (BACKEND_URL && fetchFn) { try { const r = await fetchFn(BACKEND_URL + '/agencies.json'); if (r.ok) { const v = await r.json(); if (v && Array.isArray(v.nodes)) { agencies = v; await putJson(store, 'agencies_view', v); } } } catch { /* keep the last copy */ } }
    const g = await buildGraph({ solutions: sols, agencies });
    await putJson(store, 'questions', { at, questions: await questionsFor(g) });
    await putJson(store, 'graph', { at, stats: await g.stats(), ...(await g.export()) });
  } catch (e) { changes.push({ kind: 'graph_error', error: String(e.message || e) }); }
  // 4. changelog
  await recordErrors(store, changes.filter(isError), at);
  const log = (await getJson(store, 'changes', [])).filter(c => !isError(c));
  const next = [...changes.filter(c => !isError(c)).map(c => ({ at, ...c })), ...log].slice(0, 200);
  await putJson(store, 'changes', next);
  await putJson(store, 'last_tick', { at, changes: changes.length });
  return { at, changes: changes.filter(c => !isError(c)), errors: changes.filter(isError) };
}

// ---- extraction and independent review -------------------------------------------------------------------------------
// Extractive only: a draft quotes sentences from a Cochrane abstract; it never paraphrases, so it cannot invent a claim.
// The reviewer is a separate function that re-fetches the record by PMID and confirms every quoted sentence is in the abstract
// and every effect number in the draft appears there too. A draft shows on the site only after the reviewer passes it.
// A draft is evidence for a solution, not a solution: what it takes, who acts and the first test need a person to specify.
const norm = s => strip(s).replace(/[\u2018\u2019]/g, "'").replace(/\s+/g, ' ').trim();
const sentences = t => String(t || '').split(/(?<=[.!?])\s+(?=[A-Z])/).map(s => s.trim()).filter(Boolean);
const H_MAIN = "(?:Main results|MAIN RESULTS)";
const H_CONC = "(?:Authors' conclusions|AUTHORS' CONCLUSIONS)";
const H_OTHER = "(?:Search methods|SEARCH METHODS|Data collection and analysis|DATA COLLECTION AND ANALYSIS|Selection criteria|SELECTION CRITERIA|Objectives|OBJECTIVES|Rationale|RATIONALE|Background|BACKGROUND)";
const section = (t, head, next) => {
  const m = new RegExp(`(?:^|\\s)${head}:?\\s+([\\s\\S]*?)(?=\\s${next}(?::|\\s)|$)`).exec(t);
  return m ? m[1].trim() : '';
};

export function extractDraft(item) {
  const text = norm(item.abstract_full || item.abstract || '');
  if (!text || /This is a protocol/i.test(text)) return null;
  const concl = sentences(section(text, H_CONC, `(?:${H_MAIN}|${H_OTHER})`)).slice(0, 2);
  const results = sentences(section(text, H_MAIN, `(?:${H_CONC}|${H_OTHER})`)).filter(s => /\d/.test(s) && /(risk ratio|odds ratio|RR|OR|mean difference|MD|SMD|%)/.test(s)).slice(0, 2);
  if (!concl.length || !results.length) return null;
  const numbers = [...new Set(results.join(' ').match(/\d+\.\d+|\d+/g) || [])].slice(0, 6);
  return { pmid: item.pmid, title: item.title, year: item.year, quotes: { results, conclusions: concl }, numbers, status: 'draft' };
}

export async function reviewDraft(fetchFn, draft) {
  const rows = await epmc(fetchFn, `EXT_ID:${draft.pmid} AND SRC:MED`, 1);
  const abs = norm((rows[0] || {}).abstractText);
  if (!abs) return { pass: false, reason: 'record or abstract not found' };
  const all = [...draft.quotes.results, ...draft.quotes.conclusions];
  const missing = all.filter(q => !abs.includes(q));
  const nums = draft.numbers.filter(n => !abs.includes(n));
  const pass = !missing.length && !nums.length;
  return { pass, reason: pass ? 'every quoted sentence and number found in the abstract' : `not found: ${missing.length} quote(s), ${nums.length} number(s)` };
}

export async function draftStep({ store, fetchFn, at, max = 2 }) {
  const changes = [];
  const cands = await getJson(store, 'candidates', {});
  const drafts = await getJson(store, 'drafts', {});
  const todo = Object.entries(cands).flatMap(([pid, c]) => c.items.map(i => ({ ...i, problem: pid }))).filter(i => i.pmid && !drafts[i.pmid]).slice(0, max);
  for (const it of todo) {
    try {
      const rows = await epmc(fetchFn, `EXT_ID:${it.pmid} AND SRC:MED`, 1);
      const full = norm((rows[0] || {}).abstractText);
      const d = extractDraft({ ...it, abstract_full: full });
      if (!d) { drafts[it.pmid] = { pmid: it.pmid, title: it.title, problem: it.problem, status: 'no_extractable_result', at }; continue; }
      const rev = await reviewDraft(fetchFn, d);
      drafts[it.pmid] = { ...d, problem: it.problem, status: rev.pass ? 'reviewed' : 'rejected', review: rev.reason, at };
      changes.push({ kind: 'draft_' + drafts[it.pmid].status, id: it.pmid, title: it.title });
    } catch (e) { changes.push({ kind: 'draft_error', id: it.pmid, error: String(e.message || e) }); }
  }
  await putJson(store, 'drafts', drafts);
  return changes;
}
