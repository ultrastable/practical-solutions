// SPDX-License-Identifier: LicenseRef-Ultrastable-USL-1.0
// Copyright (c) 2026 Rowan Brad Quni-Gudzinas. Non-commercial use free; commercial use requires a license. See LICENSE.
// The model ensemble's configuration: the one place that says which models may be asked, in which roles, and by what rule their answers count.
// /method states it from this data (method-claims.js), tools/ensemble.mjs runs it, and ps/ensemble.js enforces it. Every route is free and keyless:
// GitHub Models on the Action's own token, and Workers AI through the tenant's model Worker. Lessons carried from an earlier fleet's ensemble policy
// (ENSEMBLE-POLICY-1): errors of one model family are correlated, so a panel is worth fewer votes than it has members; judges must come from
// families other than the writer's, a vendor appears once per panel, and the correlation is measured rather than assumed.
export const ENSEMBLE = {
  author_family: 'anthropic',      // the family that wrote the catalogue entries; it is never asked to judge them
  min_verifiers: 2,                // an update needs at least this many verifiers from distinct vendors, none from the proposer's vendor
  channel_overlap_max: 0.25,       // two members sharing a vendor (overlap 0.5) or a lineage (1) are one correlated channel and never sit on one panel
  proposals_per_run: 3,            // entries examined per daily run (the stalest first)
  review_panel: 2,                 // reviewers asked to read a code change before the code agent merges it
  health: { flag_error_share: 0.3, min_calls: 12 },
  min_effective_votes: 1.3,        // measured n_eff = 2 / (1 + phi) over verifier verdicts; below this the most correlated vendor is benched
  fields: ['claim', 'limits', 'works_where', 'takes', 'first_test'],  // the only entry fields a proposal may change
  max_growth: 1.5,                 // a replacement may be at most this many times as long as the text it replaces (plus 80 characters)
  // The voting pool is Workers AI, reached from Actions through the tenant's model Worker on the run's OIDC token. GitHub Models answered every call with a
  // bare "OK" (no completion) on 2026-11-17, so its members are kept apart, used only by the red team, and rejoin the pool when they serve again.
  pool: [
    { id: 'gpt-oss-120b', route: 'workers-ai', model: '@cf/openai/gpt-oss-120b', vendor: 'openai', lineage: 'gpt-oss' },
    { id: 'llama-3.3-70b', route: 'workers-ai', model: '@cf/meta/llama-3.3-70b-instruct-fp8-fast', vendor: 'meta', lineage: 'llama' },
    { id: 'mistral-small-3.1', route: 'workers-ai', model: '@cf/mistralai/mistral-small-3.1-24b-instruct', vendor: 'mistral', lineage: 'mistral' },
    { id: 'gemma-4', route: 'workers-ai', model: '@cf/google/gemma-4-26b-a4b-it', vendor: 'google', lineage: 'gemma' },
    { id: 'qwen3-30b', route: 'workers-ai', model: '@cf/qwen/qwen3-30b-a3b-fp8', vendor: 'alibaba', lineage: 'qwen' },
    // glm-5.3-flash, kimi-k2.6 and deepseek-v4-flash left the pool on 2026-11-18: Workers AI answers 5035 (not available on the Workers Free plan), and this system stays on the free plan (FREE-TIER-1)
    { id: 'nemotron-3', route: 'workers-ai', model: '@cf/nvidia/nemotron-3-120b-a12b', vendor: 'nvidia', lineage: 'nemotron' },
  ],
  github_models: [
    { id: 'gpt-4.1-mini', route: 'github-models', model: 'openai/gpt-4.1-mini', vendor: 'openai', lineage: 'gpt' },
    { id: 'llama-3.3-70b-gh', route: 'github-models', model: 'meta/llama-3.3-70b-instruct', vendor: 'meta', lineage: 'llama' },
    { id: 'mistral-small-gh', route: 'github-models', model: 'mistral-ai/mistral-small-2503', vendor: 'mistral', lineage: 'mistral' },
    { id: 'phi-4', route: 'github-models', model: 'microsoft/phi-4', vendor: 'microsoft', lineage: 'phi' },
  ],
};
// the models Workers AI may be asked for through the tenant's model Worker (worker-llm); anything else is refused there
export const WORKERS_AI_ALLOW = ENSEMBLE.pool.filter(m => m.route === 'workers-ai').map(m => m.model);
