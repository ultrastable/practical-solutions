// SPDX-License-Identifier: LicenseRef-Ultrastable-USL-1.0
// Copyright (c) 2026 Rowan Brad Quni-Gudzinas. Non-commercial use free; commercial use requires a license. See LICENSE.
// IMPACT-LOOP-1 evidence acquisition. For a solution the loop wants to make more implementable, search open literature (Europe PMC, with the abstract) for
// real-world delivery evidence: scale-up, programme evaluations, cost-effectiveness in practice. A source is kept only if it has a DOI that resolves at
// Crossref and an abstract that names the intervention. Sources are leads with their abstract text beside them; the agent may cite them, the code never invents one.
// `fetch` and `now` are arguments so the tests run offline.
const STOP = /\b(a|an|the|of|in|to|for|and|or|with|every|most|were|was|gone|within|year|whatever|their|them|low-income|households?)\b/gi;
export const keywords = title => String(title).replace(/\([^)]*\)/g, ' ').replace(/[^A-Za-z0-9 -]+/g, ' ').replace(STOP, ' ').replace(/\s+/g, ' ').trim().split(' ').slice(0, 6).join(' ');
export const urlFor = q => `https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=${encodeURIComponent(`(${q}) AND (implementation OR "scale-up" OR "scaled up" OR "programme evaluation" OR "cost-effectiveness" OR "real-world") AND HAS_ABSTRACT:y AND (FIRST_PDATE:[2012-01-01 TO 2026-12-31])`)}&resultType=core&pageSize=8&format=json&sort=CITED desc`;
const clean = s => String(s || '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
export const names = (abstract, kw) => { const w = kw.toLowerCase().split(' ').filter(x => x.length > 3), a = abstract.toLowerCase(); return w.length > 0 && w.filter(x => a.includes(x.slice(0, 5))).length >= Math.min(2, w.length); };

export async function gather({ solutions, prev = { items: {} }, fetch: f = globalThis.fetch, now = () => Date.now(), max = 6, refresh_days = 7 }) {
  const items = { ...(prev.items || {}) }, log = []; let used = 0;
  for (const s of solutions) {
    const have = items[s.id];
    if (have && now() - Date.parse(have.at) < refresh_days * 86400e3) continue;
    if (used >= max) { log.push({ id: s.id, event: 'deferred: request budget' }); continue; }
    used++;
    const kw = keywords(s.title), hits = [];
    try {
      const r = await f(urlFor(kw), { headers: { accept: 'application/json', 'user-agent': 'practical-solutions evidence search (public reader)' } });
      if (!r.ok) { log.push({ id: s.id, event: 'search failed: HTTP ' + r.status }); continue; }
      const res = ((await r.json()).resultList || {}).result || [];
      for (const x of res) {
        if (hits.length >= 3) break;
        const abstract = clean(x.abstractText), doi = x.doi && String(x.doi).trim();
        if (!doi || !abstract || !x.title || !names(abstract, kw)) continue;
        try { const c = await f(`https://api.crossref.org/works/${encodeURIComponent(doi)}`, { headers: { accept: 'application/json' } }); if (!c.ok) continue; } catch { continue; }   // a DOI that does not resolve is dropped
        hits.push({ title: clean(x.title).replace(/\.$/, ''), year: Number(x.pubYear) || null, doi, url: `https://doi.org/${doi}`, abstract: abstract.slice(0, 700) });
      }
      items[s.id] = { at: new Date(now()).toISOString(), query: kw, hits };
      log.push({ id: s.id, event: `kept ${hits.length} of ${res.length}` });
    } catch (e) { log.push({ id: s.id, event: 'search error: ' + String(e.message || e).slice(0, 100) }); }
  }
  return { schema: 'ps-impl-evidence/1', at: new Date(now()).toISOString(), note: 'Real papers with a DOI that resolved at Crossref and an abstract that names the intervention. A lead to read, never a finding.', items, log: log.slice(-40) };
}
