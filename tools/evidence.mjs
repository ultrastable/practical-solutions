#!/usr/bin/env node
// SPDX-License-Identifier: LicenseRef-Ultrastable-USL-1.0
// Copyright (c) 2026 Rowan Brad Quni-Gudzinas. Non-commercial use free; commercial use requires a license. See LICENSE.
// PIPELINE-1, evidence search. For each problem in the advocate queue (ledger/pipeline.json) it asks Europe PMC for systematic reviews and randomised
// trials that match the problem's wording and records the real titles it found in ledger/evidence-leads.json. A hit is a lead, never a claim: it
// says a paper exists, not what it shows. discover.mjs may cite only titles found here or by its own grounding step, and synth.mjs still checks
// every citation. No model is involved and no secret is needed. `fetch` and `now` are arguments so the tests run without a network.
//   node tools/evidence.mjs [--max 12]
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

export const FILES = { pipeline: 'ledger/pipeline.json', out: 'ledger/evidence-leads.json' };
const readJson = (f, d) => (existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : d);
const DAY = 86400e3;

// the indicator's wording, without the parts that are about how it is reported
export const queryFor = title => String(title).replace(/\([^)]*\)/g, ' ').replace(/\b(by|per|of|in|the|and|or|to|for|a|an|with|among|aged?|years?|%|percent(age)?|proportion|share|rate|number)\b/gi, ' ').replace(/[^A-Za-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim().split(' ').slice(0, 7).join(' ');
export const urlFor = q => `https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=${encodeURIComponent(`(${q}) AND (PUB_TYPE:"Systematic Review" OR PUB_TYPE:"Randomized Controlled Trial" OR PUB_TYPE:"Meta-Analysis") AND (FIRST_PDATE:[2010-01-01 TO 2026-12-31])`)}&resultType=lite&format=json&pageSize=5&sort=CITED%20desc`;

export async function search({ queue, prev = { items: {} }, fetch: f = globalThis.fetch, now = () => Date.now(), max = 12, refresh_days = 14 }) {
  const items = { ...(prev.items || {}) }, log = [];
  const live = new Set(queue.map(q => q.id));
  for (const id of Object.keys(items)) if (!live.has(id) && !(items[id].hits || []).length) delete items[id];   // empty searches for problems no longer queued are dropped; hits are kept
  let used = 0;
  for (const q of queue) {
    const have = items[q.id];
    if (have && now() - Date.parse(have.at) < refresh_days * DAY) continue;
    if (used >= max) { log.push({ id: q.id, event: 'deferred: request budget' }); continue; }
    used++;
    const query = queryFor(q.title);
    if (query.split(' ').length < 2) { items[q.id] = { at: new Date(now()).toISOString(), query, hits: [], note: 'wording too short to search' }; continue; }
    try {
      const r = await f(urlFor(query), { headers: { accept: 'application/json', 'user-agent': 'practical-solutions evidence search (public reader)' } });
      if (!r.ok) { log.push({ id: q.id, event: 'search failed: HTTP ' + r.status }); continue; }
      const j = await r.json(), res = (j.resultList && j.resultList.result) || [];
      items[q.id] = { at: new Date(now()).toISOString(), query, total: j.hitCount || res.length, hits: res.filter(x => x.title && x.pubYear).slice(0, 5).map(x => ({ title: String(x.title).replace(/<[^>]+>/g, '').replace(/\.$/, ''), year: Number(x.pubYear), id: x.doi ? 'doi:' + x.doi : x.pmid ? 'pmid:' + x.pmid : x.id, source: 'europepmc', cited_by: x.citedByCount ?? null })) };
      log.push({ id: q.id, event: `found ${items[q.id].hits.length} of ${items[q.id].total}` });
    } catch (e) { log.push({ id: q.id, event: 'search error: ' + String(e.message || e).slice(0, 100) }); }
  }
  return { schema: 'ps-evidence-leads/1', at: new Date(now()).toISOString(), note: 'Titles Europe PMC returned for a problem-wording query. A hit is a lead to read, not evidence that an intervention works.', items, log: log.slice(-60) };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const i = process.argv.indexOf('--max'), max = i > 0 ? Number(process.argv[i + 1]) : 12;
  const p = readJson(FILES.pipeline, { queue: [] });
  const r = await search({ queue: p.queue || [], prev: readJson(FILES.out, { items: {} }), max });
  writeFileSync(FILES.out, JSON.stringify(r, null, 1) + '\n');
  console.log(JSON.stringify({ problems: Object.keys(r.items).length, with_hits: Object.values(r.items).filter(x => x.hits.length).length, log: r.log.slice(-5) }));
}
