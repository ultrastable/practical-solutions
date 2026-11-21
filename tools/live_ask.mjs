// SPDX-License-Identifier: LicenseRef-Ultrastable-USL-1.0
// Copyright (c) 2026 Rowan Brad Quni-Gudzinas. Non-commercial use free; commercial use requires a license. See LICENSE.
// ASK-2: runs every suggested question and a nonsense question against the live site. Each suggested one must return a written or structured answer
// with at least one source or item, every link must load, and nothing may answer "not found".   node tools/live_ask.mjs <origin>
import { EXAMPLES } from '../worker/src/ask.js';
const origin = (process.argv[2] || 'https://tenant-ps-web.ultrastable.workers.dev').replace(/\/$/, '');
const get = async p => { for (let i = 0; i < 4; i++) { const r = await fetch(origin + p); if (r.status !== 503 && r.status !== 429) return r; await new Promise(s => setTimeout(s, 8000)); } return fetch(origin + p); };
let bad = 0; const fail = m => { bad++; console.error('FAIL', m); };
for (const q of [...EXAMPLES, 'zzzz qqqq xxxx']) {
  const r = await get('/api/ask?q=' + encodeURIComponent(q)), j = await r.json().catch(() => ({}));
  const items = j.items || j.sources || [], isExample = EXAMPLES.includes(q);
  console.log(r.status, j.mode, items.length, q);
  if (r.status !== 200) { fail(`${q}: HTTP ${r.status}`); continue; }
  if (j.mode === 'none' || !items.length) fail(`${q}: no answer (${j.mode})`);
  if (isExample && !['generated', 'structured'].includes(j.mode)) fail(`${q}: weak mode ${j.mode}`);
  for (const it of items.slice(0, 5)) { const p = await get(it.url); if (p.status !== 200) fail(`${q}: ${it.url} -> ${p.status}`); }
  const page = await get('/ask?q=' + encodeURIComponent(q)), html = await page.text();
  if (page.status !== 200 || /Not found on this site/.test(html) || !/id="answer"/.test(html)) fail(`${q}: page has no answer`);
}
if (bad) process.exit(1); console.log('ask live ok');
