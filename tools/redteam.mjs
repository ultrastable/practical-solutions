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

import { CONFIG, configFor } from '../worker/src/redteam-config.js';
import { complete } from '../ps/llm.js';

// Second route when GitHub Models does not answer (#59): Workers AI through the tenant's model Worker, reached with this run's OIDC token.
// Llama is a different family from the entries' author, so the challenge stays independent.
export const workerAiModel = ({ env, fetch: f }) => (env.PS_LLM_URL && env.ACTIONS_ID_TOKEN_REQUEST_URL && env.ACTIONS_ID_TOKEN_REQUEST_TOKEN) ? async ({ prompt }) => {
  const secrets = { PS_LLM_URL: env.PS_LLM_URL, ACTIONS_ID_TOKEN_REQUEST_URL: env.ACTIONS_ID_TOKEN_REQUEST_URL, ACTIONS_ID_TOKEN_REQUEST_TOKEN: env.ACTIONS_ID_TOKEN_REQUEST_TOKEN };
  const r = await complete({ fetch: f, secrets, prompt: 'You are a careful adversarial reviewer. Reply with one JSON object only.\n\n' + prompt, maxTokens: 900 });
  if (!r.ok) throw new Error(r.tried.join('; ') || 'worker-ai failed');
  const m = /\{[\s\S]*\}/.exec(r.text); let o = {}; try { o = m ? JSON.parse(m[0]) : {}; } catch { throw new Error('worker-ai answer was not JSON'); }
  return { family: 'meta', findings: Array.isArray(o.findings) ? o.findings : [] };
} : null;
export { CONFIG };

export async function runRedTeam({ prev = { bySubject: {} }, env = process.env, fetch: f = globalThis.fetch, now = () => Date.now(), budget = 4, offset = 0, fallback = false } = {}) {
  const cfg = configFor(Math.floor(now() / 864e5) + offset), port = modelFor({ config: cfg, env, fetch: f }), author_family = port.author_family;
  const model = fallback ? workerAiModel({ env, fetch: f }) : port.model;
  const at = new Date(now()).toISOString();
  if (!model) return fallback || !workerAiModel({ env, fetch: f }) ? { ...prev, at, error: 'no model route (GITHUB_TOKEN with models: read, or PS_LLM_URL with an OIDC token)' } : runRedTeam({ prev, env, fetch: f, now, budget, offset, fallback: true });
  const subjects = subjectsFrom(buildCatalog({ problems: null, solutions: SOLUTIONS })).filter(s => s.type === 'solution');
  const targets = [...subjects].sort((a, b) => String((prev.bySubject[a.id] || {}).at || '').localeCompare(String((prev.bySubject[b.id] || {}).at || '')) || a.id.localeCompare(b.id)).slice(0, budget);
  const bySubject = { ...prev.bySubject }, errors = [];
  for (const s of targets) {
    const r = await redTeam(s, { model, author_family });
    const found = r.findings.filter(x => x.source === 'model');
    if (r.model_error) errors.push({ subject: s.id, error: r.model_error });
    else bySubject[s.id] = { at, family: (found[0] || {}).family || (fallback ? 'meta' : cfg.ignorance.models.red.family), findings: found };
  }
  // a model that is not served today (or errors on every entry) is replaced by the next pool member, up to three tries, so one vendor's outage never stops the pass
  if (!fallback && errors.length && errors.length >= targets.length) return offset < 2 ? runRedTeam({ prev, env, fetch: f, now, budget, offset: offset + 1 }) : (workerAiModel({ env, fetch: f }) ? runRedTeam({ prev, env, fetch: f, now, budget, offset, fallback: true }) : { schema: 'ps-redteam/1', at, model: cfg.ignorance.models.red.model, bySubject, errors });
  return { schema: 'ps-redteam/1', at, model: fallback ? 'workers-ai (tenant model Worker)' : cfg.ignorance.models.red.model, bySubject, errors };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
  const out = arg('--out', 'ledger/redteam.json'), prev = existsSync(out) ? JSON.parse(readFileSync(out, 'utf8')) : { bySubject: {} };
  const r = await runRedTeam({ prev, budget: Number(arg('--budget', 4)) });
  writeFileSync(out, JSON.stringify(r, null, 1) + '\n');
  console.log(JSON.stringify({ at: r.at, challenged: Object.keys(r.bySubject).length, errors: r.errors || r.error }));
  if (r.error || (r.errors && r.errors.length && !Object.keys(r.bySubject).length)) process.exit(1);
}
