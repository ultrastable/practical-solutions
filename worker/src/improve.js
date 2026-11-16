// SPDX-License-Identifier: LicenseRef-Ultrastable-USL-1.0
// Copyright (c) 2026 Rowan Brad Quni-Gudzinas. Non-commercial use free; commercial use requires a license. See LICENSE.
// The continuous-improvement tick. Each cron run does a bounded slice of four jobs and records what changed:
//   1. refresh the problem ranking from World Bank indicators (at most every 6 hours)
//   2. re-verify solutions: search Europe PMC for the cited paper and check that the quoted numbers are in its abstract
//   3. look for new candidate evidence: recent Cochrane reviews for the problems that rank highest
//   4. append every change to a capped changelog
// Self-contained and injectable: `store` has get/put (a KV namespace fits), `fetchFn` is fetch. No model calls, no core bindings.
const EPMC = 'https://www.ebi.ac.uk/europepmc/webservices/rest/search';
const HOUR = 3600e3;

export const SEARCH = {
  under5: 'child mortality', neonatal: 'neonatal mortality newborn', maternal: 'maternal mortality', ncd: 'hypertension cardiovascular mortality',
  suicide: 'suicide prevention depression', tb: 'tuberculosis treatment', poverty: 'cash transfer poverty', hunger: 'malnutrition food insecurity',
  water: 'drinking water treatment diarrhoea', cooking: 'cookstove household air pollution', education: 'learning outcomes primary school',
};

const strip = s => String(s || '').replace(/<[^>]+>/g, ' ');

async function epmc(fetchFn, query, size) {
  const u = `${EPMC}?query=${encodeURIComponent(query)}&format=json&resultType=core&pageSize=${size}&sort=${encodeURIComponent('P_PDATE_D desc')}`;
  const r = await fetchFn(u);
  if (!r.ok) throw new Error(`Europe PMC HTTP ${r.status}`);
  return ((await r.json()).resultList || {}).result || [];
}

export async function verifySolution(fetchFn, sol) {
  const checks = sol.checks || [];
  if (!checks.length) return { status: 'no_check', detail: 'no automated check defined' };
  const out = [];
  for (const c of checks) {
    const rows = await epmc(fetchFn, `${c.q} AND PUB_YEAR:${c.year}`, 10);
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

export async function tick({ store, fetchFn = fetch, rank, now = Date.now(), maxVerify = 3 }) {
  const at = new Date(now).toISOString();
  const changes = [];
  // 1. problems
  const prev = await getJson(store, 'problems', null);
  if (!prev || now - Date.parse(prev.at) > 6 * HOUR) {
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
  const due = sols.filter(s => (s.checks || []).length && (!verif[s.id] || now - Date.parse(verif[s.id].at) > 24 * HOUR))
    .sort((a, b) => Date.parse((verif[a.id] || { at: 0 }).at) - Date.parse((verif[b.id] || { at: 0 }).at)).slice(0, maxVerify);
  for (const s of due) {
    try {
      const v = await verifySolution(fetchFn, s);
      if (!verif[s.id] || verif[s.id].status !== v.status) changes.push({ kind: 'verification', id: s.id, status: v.status });
      verif[s.id] = { ...v, at };
    } catch (e) { changes.push({ kind: 'verification_error', id: s.id, error: String(e.message || e) }); }
  }
  await putJson(store, 'verif', verif);
  // 3. candidate evidence for one top problem per tick, rotating
  const cand = await getJson(store, 'candidates', {});
  const top = problems.problems.slice(0, 5);
  if (top.length) {
    const p = top.sort((a, b) => Date.parse((cand[a.id] || { at: 0 }).at) - Date.parse((cand[b.id] || { at: 0 }).at))[0];
    try {
      const rows = await epmc(fetchFn, `(${SEARCH[p.id] || p.title}) AND JOURNAL:"Cochrane Database Syst Rev"`, 4);
      const items = rows.map(x => ({ title: strip(x.title), year: x.pubYear, pmid: x.pmid || null, doi: x.doi || null, abstract: strip(x.abstractText).slice(0, 600) }));
      const known = new Set(((cand[p.id] || {}).items || []).map(i => i.pmid));
      for (const i of items) if (i.pmid && !known.has(i.pmid) && cand[p.id]) changes.push({ kind: 'candidate_added', problem: p.id, title: i.title });
      cand[p.id] = { at, items };
      await putJson(store, 'candidates', cand);
    } catch (e) { changes.push({ kind: 'candidate_error', problem: p.id, error: String(e.message || e) }); }
  }
  // 4. changelog
  const log = await getJson(store, 'changes', []);
  const next = [...changes.map(c => ({ at, ...c })), ...log].slice(0, 200);
  await putJson(store, 'changes', next);
  await putJson(store, 'last_tick', { at, changes: changes.length });
  return { at, changes };
}
