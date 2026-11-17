// SPDX-License-Identifier: LicenseRef-Ultrastable-USL-1.0
// Copyright (c) 2026 Rowan Brad Quni-Gudzinas. Non-commercial use free; commercial use requires a license. See LICENSE.
// Refreshes data/context.json from the World Bank API (country list and income groups, infrastructure access, per-income-group problem series)
// and the UNDP composite-indices file (HDI). Runs on GitHub Actions (.github/workflows/context.yml); the Worker bundles the result.
// A source that fails keeps its previous values and is named in `sources`; nothing is invented. Exit 1 only when nothing could be refreshed.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { PROBLEMS } from '../worker/src/problems.js';
import { INFRA, parseCountries, parseIndicator, parseHdr, build } from '../worker/src/countries.js';
import { parseGroupSeries, rankLevels } from '../worker/src/levels.js';
import { ADJUST_SERIES, buildAdjust, groupMedian, latestByCountry } from '../worker/src/adjust.js';

const WB = 'https://api.worldbank.org/v2', OUT = 'data/context.json';
const HDR = ['https://hdr.undp.org/sites/default/files/2025_HDR/HDR25_Composite_indices_complete_time_series.csv', 'https://hdr.undp.org/sites/default/files/2024-09/HDR25_Composite_indices_complete_time_series.csv', 'https://hdr.undp.org/sites/default/files/2023-24_HDR/HDR23-24_Composite_indices_complete_time_series.csv'];
// every request has a 30 s deadline: an upstream that accepts the connection and never answers must not hang the run
const sleep = ms => new Promise(r => setTimeout(r, ms));
// the World Bank answers 502 in bursts; back off up to 8 s between 5 tries (no wait under node --test, whose fakes fail on purpose)
const BACKOFF = process.env.NODE_TEST_CONTEXT ? 0 : 1;
const DEADLINE = Date.now() + 7 * 60 * 1000;  // past this, remaining requests fail at once so the snapshot is still written with what was loaded
async function get(f, url, kind = 'json') {
  let last;
  if (Date.now() > DEADLINE) throw new Error(`${url}: run deadline reached`);
  for (let a = 0; a < 5; a++) { try { const r = await f(url, { signal: AbortSignal.timeout(30000) }); if (r.ok) return kind === 'json' ? await r.json() : await r.text(); last = `HTTP ${r.status}`; } catch (e) { last = String(e.message || e); } await sleep(BACKOFF * Math.min(8000, 1000 * 2 ** a)); }
  throw new Error(`${url}: ${last}`);
}

export async function refresh({ fetch: f = globalThis.fetch, prev = { countries: {}, levels: {}, sources: {} }, now = () => new Date().toISOString() } = {}) {
  const sources = {}, state = { ...prev };
  let countries = Object.values(prev.countries || {}).map(({ hdi, infra, ...c }) => c);
  try { countries = parseCountries(await get(f, `${WB}/country?format=json&per_page=400`)); if (!countries.length) throw new Error('empty country list'); sources.countries = 'ok'; } catch (e) { sources.countries = 'failed: ' + e.message; }
  const infra = {};
  for (const [k, v] of Object.entries(INFRA)) {
    try { infra[k] = parseIndicator(await get(f, `${WB}/country/all/indicator/${v.code}?format=json&per_page=20000&date=2010:2025&mrnev=1`)); sources['infra.' + k] = Object.keys(infra[k]).length ? 'ok' : 'failed: no data'; }
    catch (e) { sources['infra.' + k] = 'failed: ' + e.message; }
    if (!Object.keys(infra[k] || {}).length) infra[k] = Object.fromEntries(Object.values(prev.countries || {}).filter(c => c.infra && c.infra[k]).map(c => [c.iso3, c.infra[k]]));
  }
  let hdi = null;
  for (const u of HDR) { try { hdi = parseHdr(await get(f, u, 'text')); if (Object.keys(hdi).length > 100) { sources.hdi = 'ok: ' + u; break; } hdi = null; sources.hdi = 'failed: file had no usable rows'; } catch (e) { sources.hdi = 'failed: ' + e.message; } }
  if (!hdi) hdi = Object.fromEntries(Object.values(prev.countries || {}).filter(c => c.hdi).map(c => [c.iso3, c.hdi]));
  // three at a time: sequential requests ran past the run deadline (6 of 21 series missed on the first run); the World Bank answers 502 to many at once
  const series = {}, queue = [...PROBLEMS];
  const worker = async () => { for (let p; (p = queue.shift());) {
    try { series[p.id] = parseGroupSeries(await get(f, `${WB}/country/LIC;LMC;UMC;HIC/indicator/${p.ind}?format=json&per_page=500&date=2000:2025`)); sources['levels.' + p.id] = 'ok'; }
    catch (e) { sources['levels.' + p.id] = 'failed: ' + e.message; series[p.id] = null; }
  } };
  await Promise.all([worker(), worker(), worker()]);
  // a failed series keeps the group's previous figures for that problem, so one bad day does not drop a problem from the ranking
  for (const p of PROBLEMS) if (!series[p.id] && prev.levels) {
    const back = {};
    for (const [g, lv] of Object.entries({ LIC: 'low', LMC: 'lower-middle', UMC: 'upper-middle', HIC: 'high' })) { const r = ((prev.levels[lv] || {}).ranked || []).find(x => x.id === p.id); if (r && r.value != null) back[g] = [{ year: r.year, value: r.value }, ...(p.target_from && r.target != null ? [{ year: p.target_from, value: r.target / p.factor }] : [])]; }
    if (Object.keys(back).length) series[p.id] = back;
  }
  const okLevels = PROBLEMS.filter(p => series[p.id]).length;
  const levels = okLevels ? rankLevels(PROBLEMS, series) : prev.levels;
  // per-income-group cost adjustments (cited World Bank series); a failed series keeps the previous figures
  const adj = {};
  for (const [k, v] of Object.entries(ADJUST_SERIES)) {
    try {
      adj[k] = v.perCountry ? groupMedian(latestByCountry(await get(f, `${WB}/country/all/indicator/${v.code}?format=json&per_page=20000&date=2015:2025&mrnev=1`)), countries)
        : parseGroupSeries(await get(f, `${WB}/country/LIC;LMC;UMC;HIC/indicator/${v.code}?format=json&per_page=500&date=2010:2025`));
      sources['adjust.' + k] = Object.keys(adj[k]).length ? 'ok' : 'failed: no group figure';
    }
    catch (e) { sources['adjust.' + k] = 'failed: ' + e.message; }
  }
  const fresh = buildAdjust(adj), adjust = { ...(prev.adjust || {}) };
  for (const [lv, o] of Object.entries(fresh)) adjust[lv] = { ...(adjust[lv] || {}), ...o };
  const out = build({ countries, infra, hdi, sources, at: now() });
  return { ...out, levels, adjust, ok: okLevels > 0 || countries.length > 0 };
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  const prev = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : undefined;
  const { ok, ...data } = await refresh({ prev });
  writeFileSync(OUT, JSON.stringify(data) + '\n');
  const bad = Object.entries(data.sources).filter(([, v]) => !String(v).startsWith('ok'));
  console.error(new Date().toISOString(), 'refresh done');
  console.log(JSON.stringify({ countries: Object.keys(data.countries).length, hdi: Object.values(data.countries).filter(c => c.hdi).length, levels: Object.keys(data.levels).length, failed: bad.length, sources: Object.fromEntries(bad) }));
  if (!ok || !Object.keys(data.countries).length) process.exit(1);
}
