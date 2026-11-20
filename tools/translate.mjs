// SPDX-License-Identifier: LicenseRef-Ultrastable-USL-1.0
// Copyright (c) 2026 Rowan Brad Quni-Gudzinas. Non-commercial use free; commercial use requires a license. See LICENSE.
// I18N-1 loop: renders every page of the site in the source language, cuts the text into segments (core/i18n), translates the missing ones with the free
// model route, keeps only translations that pass the deterministic checks, and writes ledger/i18n/<lang>/<shard>.json plus ledger/i18n/manifest.json
// (which languages are live, and the shard hashes the Worker's tick copies). Machine-translated, labelled as such on every page.
//   node tools/translate.mjs [--langs es,fr] [--calls 30] [--batch 25] [--minutes 20] [--stats]
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { LANGS, segmentsOf, segKey, shardOf, translateBatch, MT_KEY } from '../vendor/ultrastable/core/i18n/index.js';
import { buildCatalog } from '../worker/src/catalog.js';
import { SOLUTIONS } from '../worker/src/solutions.js';
import { route, sitemapPaths } from '../worker/src/site.js';
import { askPage } from '../worker/src/ask.js';
import { SCAN } from '../worker/src/problem-scan.gen.js';
import { ENSEMBLE } from '../worker/src/ensemble-config.js';
import { askModel } from '../ps/llm.js';

export const DIR = 'ledger/i18n', SHARDS = 8, LIVE_AT = 0.5;
export const MT_TEXT = 'This page was machine-translated from English and may contain errors. Read the original:';
const O = 'https://ultrastable.org';

// Every segment of the site with the number of pages it appears on (so shared navigation and headings are translated first).
export async function harvest() {
  const c = buildCatalog({ problems: null, solutions: SOLUTIONS }), pages = new Map();
  const add = html => { for (const s of segmentsOf(html)) { const e = pages.get(s.key) || { key: s.key, text: s.text, pages: 0 }; e.pages++; pages.set(s.key, e); } };
  const paths = [...new Set([...sitemapPaths(c), '/search?q=water', '/compare?ids=kmc&ids=cash', '/solutions?page=2', '/problems?page=2', '/catalogue?page=2'])];
  for (const p of paths) { const r = route(new URL(O + p), c); if (r && r.status === 200) add(await r.text()); }
  const src = [{ id: 'a', n: 1, url: '/solutions/kmc', title: 't', type: 'solution' }];
  for (const r of [{ ok: false }, { ok: true, mode: 'none' }, { ok: true, mode: 'generated', answer: 'x [1]', sources: src }, { ok: true, mode: 'extractive', sources: src, passages: [{ n: 1, title: 't', url: '/solutions/kmc', quote: 'q' }] }]) add(askPage('example question', r, O));
  const mt = { key: segKey(MT_KEY), text: MT_TEXT, pages: 1e6 }; pages.set(mt.key, mt);
  return { c, pages };
}

const read = (lang, n, dir = DIR) => { const f = `${dir}/${lang}/${n}.json`; return existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : {}; };
export const load = (lang, dir = DIR) => Object.assign({}, ...Array.from({ length: SHARDS }, (_, n) => read(lang, n, dir)));
export function save(lang, dict, dir = DIR) {
  const shards = Array.from({ length: SHARDS }, () => ({}));
  for (const k of Object.keys(dict).sort()) shards[shardOf(k, SHARDS)][k] = dict[k];
  mkdirSync(`${dir}/${lang}`, { recursive: true });
  return shards.map((s, n) => { const body = JSON.stringify(s) + '\n'; writeFileSync(`${dir}/${lang}/${n}.json`, body); return createHash('sha256').update(body).digest('hex').slice(0, 16); });
}
export const coverage = (pages, dict) => { let a = 0, b = 0; for (const e of pages.values()) { b += e.pages; if (dict[e.key]) a += e.pages; } return b ? a / b : 0; };

// Models for translation: the multilingual-strong members of the pool first; the first that answers with passing lines wins.
// GitHub Models (free, on the run's GITHUB_TOKEN with models: read) first, so the translation does not draw on the Workers AI allowance that Ask needs; Workers AI is the fallback.
const GH = ['gpt-4.1-mini', 'llama-3.3-70b-gh', 'mistral-small-gh'].map(id => ENSEMBLE.github_models.find(m => m.id === id)).filter(Boolean);
const LADDER = [...GH, ...['gemma-4', 'qwen3-30b', 'llama-3.3-70b', 'mistral-small-3.1'].map(id => ENSEMBLE.pool.find(m => m.id === id)).filter(Boolean)];
const strikes = new Map();   // a model that fails three calls in a row is skipped for the rest of the run (a route that answers a bare "OK" costs a round trip every batch)
const generator = () => async ({ system, user, maxTokens }) => {
  const why = [];   // Workers AI free plan: a daily neuron quota (error 4006) that resets at 00:00 UTC; the run stops on it and the next daily run continues
  for (const spec of LADDER) { if ((strikes.get(spec.id) || 0) >= 3) continue; const r = await askModel({ secrets: process.env, spec, prompt: system + '\n\n' + user, maxTokens }); if (r.ok && r.text) { strikes.set(spec.id, 0); return r.text.replace(/<think>[\s\S]*?<\/think>/g, ''); } strikes.set(spec.id, (strikes.get(spec.id) || 0) + 1); why.push(`${spec.id}: ${r.error || 'empty'}`); }
  throw new Error('no model route answered (' + why.join('; ').slice(0, 400) + ')');   // the reasons ride in the run report, so a quota or plan error is data
};

export async function run({ langs, calls = 30, batch = 25, generate = generator(), pages, now = new Date().toISOString(), dir = DIR, deadline = Infinity }) {
  const man = existsSync(`${dir}/manifest.json`) ? JSON.parse(readFileSync(`${dir}/manifest.json`, 'utf8')) : { schema: 'ps-i18n/1', langs: {} };
  const report = {}; let quotaOut = false;   // one language hitting the daily quota stops the others too: no point burning calls
  await Promise.all(langs.map(async lang => {   // languages run side by side: the model route is the slow part, not the machine
    const keep = new Set(pages.keys()); let dict = Object.fromEntries(Object.entries(load(lang, dir)).filter(([k]) => keep.has(k)));   // translations of text that no longer exists are dropped
    const todo = [...pages.values()].filter(e => !dict[e.key]).sort((a, b) => b.pages - a.pages || a.text.length - b.text.length || a.text.localeCompare(b.text)), stat = { before: Object.keys(dict).length, rejected: {}, calls: 0 };
    for (let i = 0; i < calls && i * batch < todo.length && Date.now() < deadline; i++) {
      const seg = todo.slice(i * batch, (i + 1) * batch); stat.calls++;
      if (quotaOut) { stat.error = 'quota: free daily model allowance used up; the next daily run continues'; break; }
      let r; try { r = await translateBatch({ generate, lang, segments: seg.map(s => s.text) }); } catch (e) { stat.error = String(e.message || e); if (/4006|used up/.test(stat.error)) quotaOut = true; break; }
      if (r.rejected.some(x => /4006|used up/.test(x.why))) quotaOut = true;
      Object.assign(dict, r.ok); for (const x of r.rejected) stat.rejected[x.why] = (stat.rejected[x.why] || 0) + 1;
      if (!Object.keys(r.ok).length && stat.calls >= 2) { stat.error = 'two batches with no accepted translation'; break; }
    }
    const shards = save(lang, dict, dir), cov = coverage(pages, dict);
    man.langs[lang] = { live: cov >= LIVE_AT, coverage: Math.round(cov * 1000) / 1000, segments: Object.keys(dict).length, of: pages.size, shards, at: now };
    report[lang] = { ...stat, after: Object.keys(dict).length, coverage: man.langs[lang].coverage, live: man.langs[lang].live };
  }));
  man.at = now; man.source = 'en'; man.total_segments = pages.size; man.last_run = { at: now, report };   // the report rides in the manifest so a run's failure reasons are data the next run and the check-in loop can read
  mkdirSync(dir, { recursive: true }); writeFileSync(`${dir}/manifest.json`, JSON.stringify(man, null, 1) + '\n');
  return report;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = (n, d) => { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : d; };
  const { pages } = await harvest();
  if (process.argv.includes('--stats')) { console.log(JSON.stringify({ segments: pages.size, characters: [...pages.values()].reduce((a, e) => a + e.text.length, 0), top: [...pages.values()].sort((a, b) => b.pages - a.pages).slice(0, 5).map(e => [e.pages, e.text]) })); process.exit(0); }
  const man = existsSync(`${DIR}/manifest.json`) ? JSON.parse(readFileSync(`${DIR}/manifest.json`, 'utf8')) : { langs: {} };
  // Rollout order: languages that are not yet live first (in LANGS order), then the least covered; at most --max-langs per run.
  const all = LANGS.map(l => l.code).filter(c => c !== 'en'), cov = c => (man.langs[c] || { coverage: 0 }).coverage;
  const langs = arg('langs') ? arg('langs').split(',') : [...all].sort((a, b) => cov(a) - cov(b) || all.indexOf(a) - all.indexOf(b)).slice(0, Number(arg('max-langs', 2)));
  const out = await run({ langs, calls: Number(arg('calls', 30)), batch: Number(arg('batch', 25)), pages, deadline: Date.now() + Number(arg('minutes', 20)) * 60e3 });
  console.log(JSON.stringify(out));
  if (Object.values(out).every(r => r.error && r.after === r.before)) { console.error('no language progressed'); process.exit(1); }
}
