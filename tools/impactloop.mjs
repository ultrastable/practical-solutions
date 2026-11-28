#!/usr/bin/env node
// SPDX-License-Identifier: LicenseRef-Ultrastable-USL-1.0
// Copyright (c) 2026 Rowan Brad Quni-Gudzinas. Non-commercial use free; commercial use requires a license. See LICENSE.
// IMPACT-LOOP-1: daily run. Reads the catalogue and the live reach counters, records the series in ledger/impact.json, settles earlier predictions, files at most 3 items
// for the free code agent (label idea + impact-loop) and dispatches the sitemap resubmission when reach plateaus. --status prints the ledger; --dry plans without filing.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { buildCatalog } from '../worker/src/catalog.js';
import { SOLUTIONS } from '../worker/src/solutions.js';
import { run, cooldownKeys } from '../ps/impactloop.js';
const FILE = new URL('../ledger/impact.json', import.meta.url), ORIGIN = process.env.PS_ORIGIN || 'https://ultrastable.org';
const state = existsSync(FILE) ? JSON.parse(readFileSync(FILE, 'utf8')) : { series: {}, ledger: [] };
// second trigger (GitHub's scheduler skips runs): a finished deploy also starts a pass, at most once every 2 hours
if (process.env.GITHUB_EVENT_NAME === 'workflow_run' && state.at && Date.now() - Date.parse(state.at) < 2 * 3600e3) { console.log(JSON.stringify({ skipped: 'ran less than 2 h ago' })); process.exit(0); }
if (process.argv.includes('--status')) { console.log(JSON.stringify({ at: state.at, readings: state.readings, pending: state.ledger.filter(e => !e.outcome).length, kept: state.ledger.filter(e => e.outcome === 'kept').length, missed: state.ledger.filter(e => e.outcome === 'missed').length }, null, 2)); process.exit(0); }
const cat = buildCatalog({ problems: null, solutions: SOLUTIONS });
let reach = null;
try { const r = await fetch(`${ORIGIN}/metrics.json`, { signal: AbortSignal.timeout(15000) }); if (r.ok) { const j = await r.json(); reach = { views: Number(j.views ?? j.total ?? j.page_views) }; } else console.error(`reach unreadable: HTTP ${r.status}`); } catch (e) { console.error('reach unreadable:', e.message); }
const dry = process.argv.includes('--dry'), gh = (...a) => execFileSync('gh', a, { encoding: 'utf8' });
let open = [];
if (!dry) { try { open = JSON.parse(gh('issue', 'list', '--state', 'open', '--label', 'impact-loop', '--limit', '200', '--json', 'body')).flatMap(i => [...String(i.body).matchAll(/impact-key: (\S+)/g)].map(m => m[1])); } catch (e) { console.error('issue list failed:', e.message); process.exit(1); }
  try { open = open.concat(cooldownKeys(JSON.parse(gh('issue', 'list', '--state', 'closed', '--label', 'impact-loop', '--limit', '200', '--json', 'body,stateReason,closedAt')))); } catch (e) { console.error('closed issue list failed (cooldown skipped):', e.message); } }
const EV = new URL('../ledger/impl-evidence.json', import.meta.url), evidence = existsSync(EV) ? JSON.parse(readFileSync(EV, 'utf8')).items : {};
const out = run({ cat, reach, hist: state.series, ledger: state.ledger, open, evidence, cap: 6 });
const filed = [];
for (const it of out.items) {
  if (dry) { console.log('would file', it.key, '|', it.prediction); filed.push(it); continue; }
  try {
    if (it.action && it.action.workflow) gh('workflow', 'run', it.action.workflow);
    else gh('issue', 'create', '--title', it.title, '--body', `${it.body}\n\nPrediction: ${it.prediction}\nimpact-key: ${it.key}`, ...it.labels.flatMap(l => ['--label', l]));
    filed.push(it);
  } catch (e) { console.error('filing failed for', it.key, e.message); }
}
const entries = filed.map(({ key, lever, metric, op, base, predicted, due, prediction }) => ({ key, lever, metric, op, base, predicted, due, prediction, at: Date.now() }));
if (!dry) writeFileSync(FILE, JSON.stringify({ at: new Date().toISOString(), readings: out.readings, assessments: out.assessments, series: out.series, ledger: [...out.ledger, ...entries].slice(-500) }, null, 1) + '\n');
console.log(JSON.stringify({ readings: out.readings, assessments: out.assessments, filed: entries.map(e => e.key) }, null, 1));
