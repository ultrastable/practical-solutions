// SPDX-License-Identifier: LicenseRef-Ultrastable-USL-1.0
// Copyright (c) 2026 Rowan Brad Quni-Gudzinas. Non-commercial use free; commercial use requires a license. See LICENSE.
// The model red team, run from Actions on the run's own token (permission models: read; no stored secret). It challenges the entries
// that were challenged least recently, through GitHub Models (a different model family from the entries' author), and writes
// ledger/redteam.json. The tenant's ignorance tick reads that file from the public repository and shows the findings, tagged unverified.
//   node tools/redteam.mjs [--budget 4] [--out ledger/redteam.json]
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { buildCatalog } from '../worker/src/catalog.js';
import { SOLUTIONS } from '../worker/src/solutions.js';
import { subjectsFrom } from '../worker/src/unknowns.js';
import { redTeam } from '../vendor/ultrastable/core/ignorance/index.js';
import { modelFor } from '../vendor/ultrastable/core/ignorance/org.js';

import { CONFIG } from '../worker/src/redteam-config.js';
export { CONFIG };

export async function runRedTeam({ prev = { bySubject: {} }, env = process.env, fetch: f = globalThis.fetch, now = () => Date.now(), budget = 4 } = {}) {
  const { model, author_family } = modelFor({ config: CONFIG, env, fetch: f });
  const at = new Date(now()).toISOString();
  if (!model) return { ...prev, at, error: 'no model route (GITHUB_TOKEN with models: read is needed)' };
  const subjects = subjectsFrom(buildCatalog({ problems: null, solutions: SOLUTIONS })).filter(s => s.type === 'solution');
  const targets = [...subjects].sort((a, b) => String((prev.bySubject[a.id] || {}).at || '').localeCompare(String((prev.bySubject[b.id] || {}).at || '')) || a.id.localeCompare(b.id)).slice(0, budget);
  const bySubject = { ...prev.bySubject }, errors = [];
  for (const s of targets) {
    const r = await redTeam(s, { model, author_family });
    const found = r.findings.filter(x => x.source === 'model');
    if (r.model_error) errors.push({ subject: s.id, error: r.model_error });
    else bySubject[s.id] = { at, family: (found[0] || {}).family || 'openai', findings: found };
  }
  return { schema: 'ps-redteam/1', at, model: CONFIG.ignorance.models.red.model, bySubject, errors };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
  const out = arg('--out', 'ledger/redteam.json'), prev = existsSync(out) ? JSON.parse(readFileSync(out, 'utf8')) : { bySubject: {} };
  const r = await runRedTeam({ prev, budget: Number(arg('--budget', 4)) });
  writeFileSync(out, JSON.stringify(r, null, 1) + '\n');
  console.log(JSON.stringify({ at: r.at, challenged: Object.keys(r.bySubject).length, errors: r.errors || r.error }));
  if (r.error || (r.errors && r.errors.length && !Object.keys(r.bySubject).length)) process.exit(1);
}
