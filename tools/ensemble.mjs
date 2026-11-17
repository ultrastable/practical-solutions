// SPDX-License-Identifier: LicenseRef-Ultrastable-USL-1.0
// Copyright (c) 2026 Rowan Brad Quni-Gudzinas. Non-commercial use free; commercial use requires a license. See LICENSE.
// The ensemble run, from Actions on the run's own token (GitHub Models, models: read) and the tenant's model Worker (Workers AI, OIDC). Models propose
// updates to entries from real abstracts; other-vendor models vote; code checks the evidence; a unanimous, evidence-backed change is applied through the
// code agent's edit path (scope guard, npm test, branch, pull request, merge), the deploy workflow ships it and the agent's settle step reverts it if the
// live check fails. Everything else is recorded as uncertainty or rejection in ledger/ensemble.json and generated into worker/src/ensemble-ledger.gen.js.
//   node tools/ensemble.mjs run [--budget 3] [--dry]
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ensembleRun, swapLiteral, genModule } from '../ps/ensemble.js';
import { askModel } from '../ps/llm.js';
import { ENSEMBLE } from '../worker/src/ensemble-config.js';
import { SOLUTIONS } from '../worker/src/solutions.js';
import { applyEdits, sh, gh, note } from './agent.mjs';

export const LEDGER = 'ledger/ensemble.json', GEN = 'worker/src/ensemble-ledger.gen.js', TARGET = 'worker/src/solutions.js';

export async function main({ root = process.cwd(), env = process.env, dry = false, budget = ENSEMBLE.proposals_per_run, fetch: f = globalThis.fetch, now = () => Date.now(), ask } = {}) {
  const ledger = existsSync(root + '/' + LEDGER) ? JSON.parse(readFileSync(root + '/' + LEDGER, 'utf8')) : {};
  const secrets = { GITHUB_TOKEN: env.GITHUB_TOKEN, PS_LLM_URL: env.PS_LLM_URL, ACTIONS_ID_TOKEN_REQUEST_URL: env.ACTIONS_ID_TOKEN_REQUEST_URL, ACTIONS_ID_TOKEN_REQUEST_TOKEN: env.ACTIONS_ID_TOKEN_REQUEST_TOKEN };
  const doAsk = ask || ((spec, prompt, maxTokens) => askModel({ fetch: f, secrets, spec, prompt, maxTokens }));
  const fileSrc = readFileSync(root + '/' + TARGET, 'utf8');
  const day = Math.floor(now() / 864e5);
  const r = await ensembleRun({ ledger, entries: SOLUTIONS, fileSrc, fetch: f, ask: doAsk, now, cfg: ENSEMBLE, seed: day, budget });
  const L = r.ledger, applied = [], failed = [];
  // apply each accepted change one at a time through the agent's scope-guarded edit path; the suite must pass after every one
  for (const rec of r.accepted) {
    if (dry) break;
    const cur = readFileSync(root + '/' + TARGET, 'utf8'), sw = swapLiteral(cur, rec.old, rec.new);
    if (!sw.ok) { rec.status = 'rejected'; rec.reason = sw.why; failed.push(rec.id); continue; }
    try { applyEdits([{ path: TARGET, find: sw.find, replace: sw.replace }], root); sh('npm', ['test'], { cwd: root, maxBuffer: 1 << 26 }); rec.status = 'applied'; rec.applied_at = new Date(now()).toISOString(); applied.push(rec); }
    catch (e) { writeFileSync(root + '/' + TARGET, cur); rec.status = 'rejected'; rec.reason = 'applying it failed: ' + String(e.message).split('\n')[0].slice(0, 120); failed.push(rec.id); }
  }
  const summary = { at: L.at, run: r.run, applied: applied.map(a => ({ id: a.id, entry: a.entry, field: a.field })), failed, metrics: L.metrics };
  if (dry) { console.log(JSON.stringify({ dry: true, ...summary })); return summary; }
  writeFileSync(root + '/' + LEDGER, JSON.stringify(L, null, 1) + '\n'); writeFileSync(root + '/' + GEN, genModule(L));
  const changed = sh('git', ['status', '--porcelain', '--', LEDGER, GEN, TARGET], { cwd: root }).trim();
  if (!changed) { console.log(JSON.stringify({ ...summary, shipped: false })); return summary; }
  const files = [LEDGER, GEN, ...(applied.length ? [TARGET] : [])], deploy = /ensemble-ledger\.gen\.js|solutions\.js/.test(changed);
  sh('git', ['config', 'user.name', 'practical-solutions-ensemble']); sh('git', ['config', 'user.email', 'ensemble@users.noreply.github.com']);
  const branch = 'agent/ensemble-' + new Date(now()).toISOString().slice(0, 10);
  let how;
  if (applied.length) {
    // an applied change is work: it gets an item, a branch, a pull request that merges, and the agent's settle step watches the deploy
    const title = 'Ensemble update: ' + applied.map(a => `${a.entry} ${a.field}`).join(', ');
    const body = applied.map(a => `- ${a.entry} / ${a.field}: verified by ${a.votes.map(v => v.vendor).join(', ')} against ${a.source.url}`).join('\n');
    const n = gh('issue', 'create', '--title', title, '--label', 'ensemble', '--body', `Item: ensemble update\nProposed by ${applied.map(a => a.proposer.vendor).join(', ')}; every verifier said the source supports it and the evidence checks passed.\n${body}\n\nClosing probe: the live check after deploy; settle reverts the change if it fails.`).trim().split('/').pop();
    sh('git', ['checkout', '-b', branch]); sh('git', ['add', ...files]);
    sh('git', ['commit', '-m', `Agent: ${title} (#${n})\n\nItem: #${n}\nAuthor: model ensemble (proposers: ${applied.map(a => a.proposer.model).join(', ')})\nReviewer: verifiers from other vendors (${[...new Set(applied.flatMap(a => a.votes.map(v => v.model)))].join(', ')}), the evidence checks, npm test and the live check after deploy.`]);
    try { sh('git', ['push', '-u', 'origin', branch]); const url = gh('pr', 'create', '--base', 'main', '--head', branch, '--title', 'Agent: ' + title, '--body', `Item: #${n}\nAuthor: model ensemble\nReviewer: verifiers from other vendors, the evidence checks, \`npm test\`, the live check after deploy.\nEvidence:\n${body}`).trim(); gh('pr', 'merge', url, '--squash', '--delete-branch'); how = 'merged via pull request'; }
    catch { how = 'merged by direct push'; sh('git', ['fetch', 'origin', 'main']); sh('git', ['rebase', 'origin/main']); sh('git', ['push', 'origin', 'HEAD:main']); try { sh('git', ['push', 'origin', '--delete', branch]); } catch { /* no remote branch */ } }
    note(n, `Applied: ${how}. The deploy workflow ships it and the live check runs; a failure reverts it.`); gh('issue', 'close', n, '--reason', 'completed');
  } else {
    // a ledger-only run (uncertainty recorded, nothing changed in an entry) goes straight to main like the red-team ledger
    sh('git', ['add', ...files]); sh('git', ['commit', '-m', 'ensemble: ledger (proposals, votes and disagreements recorded)']);
    sh('git', ['fetch', 'origin', 'main']); sh('git', ['rebase', 'origin/main']); sh('git', ['push', 'origin', 'HEAD:main']); how = 'ledger pushed to main';
  }
  console.log(JSON.stringify({ ...summary, shipped: true, how, deploy }));
  return { ...summary, shipped: true, deploy };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const a = process.argv.slice(2), i = a.indexOf('--budget');
  if (a[0] !== 'run') { console.error('usage: ensemble.mjs run [--budget N] [--dry]'); process.exit(2); }
  await main({ dry: a.includes('--dry'), budget: i >= 0 ? Number(a[i + 1]) : ENSEMBLE.proposals_per_run });
}
