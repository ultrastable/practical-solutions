// SPDX-License-Identifier: LicenseRef-Ultrastable-USL-1.0
// Copyright (c) 2026 Rowan Brad Quni-Gudzinas. Non-commercial use free; commercial use requires a license. See LICENSE.
// Runs the user stories and the structural audit against a running site (the live Worker after a deploy, or a local server), over
// plain HTTP. Exit code 1 on any failed story or audit rule. Usage: node tools/live_ux.mjs https://tenant-ps-web.ultrastable.workers.dev
import { STORIES } from '../ux/stories.js';
import { runAll } from '../ux/runner.js';
import { auditHtml } from '../worker/src/kit/audit.js';

const base = (process.argv[2] || process.env.BASE || '').replace(/\/$/, '');
if (!base) { console.error('usage: live_ux.mjs <base url>'); process.exit(2); }
// The edge throttles a fast crawl with 429/502/503 before the Worker runs (no Worker event is logged), so retry those with backoff.
const sleep = ms => new Promise(res => setTimeout(res, ms));
const get = async path => {
  let r;
  for (let i = 0; i < 5; i++) { r = await fetch(base + path, { redirect: 'follow' }); if (![429, 502, 503].includes(r.status)) break; await r.text(); await sleep(500 * 2 ** i); }
  return { status: r.status, type: r.headers.get('content-type') || '', text: await r.text() };
};

const results = await runAll(STORIES, get);
for (const r of results) console.log(r.ok ? 'ok  ' : 'FAIL', r.id, ...r.failures);
const idx = JSON.parse((await get('/index.json')).text);
const pages = ['/', '/for', '/solutions', '/problems', '/domains', '/method', '/api', '/compare', ...idx.solutions.map(s => '/solutions/' + s.id), ...idx.problems.map(p => '/problems/' + p.id), ...idx.domains.map(d => '/domains/' + d.slug)];
const bad = [];
for (const p of pages) { const r = await get(p); if (r.status !== 200) bad.push(`${p} ${r.status}`); for (const v of auditHtml(r.text)) bad.push(`${p}: ${v.rule}: ${v.detail}`); }
console.log(`audited ${pages.length} pages, ${bad.length} violations`); for (const b of bad) console.log('  ' + b);
process.exit(results.some(r => !r.ok) || bad.length ? 1 : 0);
