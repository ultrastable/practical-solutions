#!/usr/bin/env node
// SPDX-License-Identifier: LicenseRef-Ultrastable-USL-1.0
// Copyright (c) 2026 Rowan Brad Quni-Gudzinas. Non-commercial use free; commercial use requires a license. See LICENSE.
// PIPELINE-1 backfill: rebuilds the pipeline history from git, one row per day (the last commit of that day on main), by counting each stage
// from the files as they were then. Rows carry source "git" so a reader can tell them from live runs. The probe needs a full window of history; this gives it one
// on the first day instead of a week of "warming".
//   node tools/pipeline_backfill.mjs [--days 8]
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { solvedSet, counts, record, RULES } from '../ps/pipeline.js';

const git = (...a) => execFileSync('git', a, { encoding: 'utf8', maxBuffer: 1 << 28 }).trim();
const at = (c, p) => { try { return execFileSync('git', ['show', `${c}:${p}`], { encoding: 'utf8', maxBuffer: 1 << 28, stdio: ['ignore', 'pipe', 'ignore'] }); } catch { return null; } };
const days = Number(process.argv[process.argv.indexOf('--days') + 1]) || 8;
const lines = git('log', 'origin/main', `--since=${days} days ago`, '--format=%H %cI').split('\n').filter(Boolean).map(l => l.split(' '));
const perDay = new Map(); for (const [h, d] of lines) if (!perDay.has(d.slice(0, 10))) perDay.set(d.slice(0, 10), { h, d });   // newest first, so the first seen is the day's last commit
let history = [];
const tmp = mkdtempSync(join(tmpdir(), 'pl-'));
for (const [day, { h, d }] of [...perDay].sort()) {
  const dir = join(tmp, day); mkdirSync(join(dir, 'worker/src'), { recursive: true });
  for (const f of ['problems.js', 'solutions.js', 'more-solutions.js', 'bca-precomputed.gen.js']) { const t = at(h, 'worker/src/' + f); if (t != null) writeFileSync(join(dir, 'worker/src', f), t); }
  const j = f => { const t = at(h, 'ledger/' + f); return t ? JSON.parse(t) : null; };
  const mod = async f => import(pathToFileURL(join(dir, 'worker/src', f)).href);
  try {
    const { PROBLEMS } = await mod('problems.js'), { SOLUTIONS } = await mod('solutions.js'), pre = existsSync(join(dir, 'worker/src/bca-precomputed.gen.js')) ? (await mod('bca-precomputed.gen.js')).PRECOMPUTED : null;
    const scan = j('problem-scan.json') || { entries: [] }, solved = solvedSet({ problems: PROBLEMS, scan, solutions: SOLUTIONS });
    const c = counts({ problems: PROBLEMS, scan, solutions: SOLUTIONS, solved, queue: [], evidence: null, connections: j('connections.json'), redteam: j('redteam.json'), verifiedSyntheses: j('syntheses-verified.json'), discovered: j('synth-discovered.json'), bca: pre });
    history = record(history, c, Date.parse(d), { ...RULES, history_keep_days: 3650 }, 'git');
    console.log(day, h.slice(0, 7), JSON.stringify(c));
  } catch (e) { console.error(day, 'skipped:', String(e.message).slice(0, 120)); }
}
const f = 'ledger/pipeline.json', prev = existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : {};
writeFileSync(f, JSON.stringify({ ...prev, history: [...history, ...(prev.history || []).filter(x => x.source !== 'git')] }, null, 1) + '\n');
