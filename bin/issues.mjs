#!/usr/bin/env node
// SPDX-License-Identifier: LicenseRef-Ultrastable-USL-1.0
// Copyright (c) 2026 Rowan Brad Quni-Gudzinas. Non-commercial use free; commercial use requires a license. See LICENSE.
// Applies ps/issues.js to GitHub through gh on the run's own token (ISSUE-LOOP-1). `--dry-run` prints the plan only.
// Usage: node bin/issues.mjs --db ledger/ps.sqlite --briefs ledger/briefs [--dry-run]
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { planIssues, LABEL, AWAITING, verdictLabel } from '../ps/issues.js';

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const dry = process.argv.includes('--dry-run');
const dir = arg('--briefs', 'ledger/briefs');
const repo = process.env.GITHUB_REPOSITORY || 'ultrastable/practical-solutions';
const gh = (...a) => execFileSync('gh', [...a, '-R', repo], { encoding: 'utf8' });

const briefs = JSON.parse(readFileSync(`${dir}/index.json`, 'utf8'));
const db = new DatabaseSync(arg('--db', 'ledger/ps.sqlite'), { readOnly: true });
const preds = db.prepare('SELECT * FROM ps_predictions').all();
const issues = dry ? [] : JSON.parse(gh('issue', 'list', '--label', LABEL, '--state', 'all', '--limit', '1000', '--json', 'number,title,state,labels'));
const plan = planIssues(briefs, preds, issues);
console.log(JSON.stringify({ briefs: briefs.length, issues: issues.length, actions: plan.length, plan: dry ? plan : undefined }));
if (dry) process.exit(0);

for (const [name, color, desc] of [[LABEL, '0e8a16', 'Lead from the loop; a hypothesis to check, not a finding'], [AWAITING, 'c5def5', 'Prediction registered, not yet scored'], [verdictLabel('hit'), '0e8a16', 'Prediction held'], [verdictLabel('miss'), 'd93f0b', 'Prediction did not hold']])
  gh('label', 'create', name, '--color', color, '--description', desc, '--force');

let failed = 0;
const numbers = new Map(issues.map(i => [i.title, i.number]));
for (const a of plan) {
  try {
    if (a.op === 'create') {
      const url = gh('issue', 'create', '--label', [LABEL, ...a.add].join(','), '--title', a.title, '--body-file', `${dir}/${a.file}`).trim();
      const n = Number(url.split('/').pop());
      numbers.set(a.title, n);
      gh('issue', 'close', String(n), '--comment', a.comment);
    } else {
      const n = String(a.number ?? numbers.get(a.title));
      if (a.comment) gh('issue', 'comment', n, '--body', a.comment);
      const edit = [...(a.add || []).flatMap(l => ['--add-label', l]), ...(a.remove || []).flatMap(l => ['--remove-label', l])];
      if (edit.length) gh('issue', 'edit', n, ...edit);
      if (a.op === 'close' || a.close) gh('issue', 'close', n);
    }
    console.log(`issues: ${a.op} ${a.title}`);
  } catch (e) {
    failed++;
    console.error(`issues: ${a.op} ${a.title} failed: ${String(e.stderr || e.message).slice(-300)}`);
  }
}
process.exit(failed ? 1 : 0);
