// SPDX-License-Identifier: LicenseRef-Ultrastable-USL-1.0
// Copyright (c) 2026 Rowan Brad Quni-Gudzinas. Non-commercial use free; commercial use requires a license. See LICENSE.
// One model port with three routes, tried in order. No route needs a key a person mints:
//   1. github-models: the workflow's own GITHUB_TOKEN (permission `models: read`), minted by GitHub for each run.
//   2. worker-ai:    the deployed Worker's Workers AI binding, reached from an Actions run with its own OIDC token (audience practical-solutions-llm).
//   3. workers-ai:   an account-bound Cloudflare binding (inside the Worker itself).
//   4. anthropic:    an API key, only when one is already bound.
// Returns { text, route, model, ok } and never throws; a failed route is recorded and the next is tried.
export const GITHUB_MODEL = 'openai/gpt-4.1';
export const WORKERS_AI_MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';
export const ANTHROPIC_MODEL = 'claude-sonnet-5-5';

// Workers AI returns `response` already parsed (an object) when the model's answer is JSON; String() of that is "[object Object]" (the cause of run 9's rejected answers).
export const textOf = out => { const r = out && (out.response ?? out.result); return (r && typeof r === 'object' ? JSON.stringify(r) : String(r ?? '')).trim(); };

export function routesFor(secrets = {}) {
  const r = [];
  const gh = secrets.GITHUB_MODELS_TOKEN || secrets.GITHUB_TOKEN;
  if (gh) r.push('github-models');
  if (secrets.PS_LLM_URL && secrets.ACTIONS_ID_TOKEN_REQUEST_URL && secrets.ACTIONS_ID_TOKEN_REQUEST_TOKEN) r.push('worker-ai');
  if (secrets.AI && secrets.AI.run) r.push('workers-ai');
  if (secrets.ANTHROPIC_API_KEY) r.push('anthropic');
  return r;
}

export async function complete({ fetch: f = globalThis.fetch, secrets = {}, prompt, maxTokens = 600 }) {
  const tried = [];
  for (const route of routesFor(secrets)) {
    try {
      if (route === 'github-models') {
        const r = await f('https://models.github.ai/inference/chat/completions', { method: 'POST',
          headers: { 'content-type': 'application/json', accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28', authorization: `Bearer ${secrets.GITHUB_MODELS_TOKEN || secrets.GITHUB_TOKEN}` },
          body: JSON.stringify({ model: GITHUB_MODEL, messages: [{ role: 'user', content: prompt }], max_tokens: maxTokens, temperature: 0 }) });
        if (!r.ok) { tried.push(`github-models HTTP ${r.status}`); continue; }
        const j = await r.json(); const text = String(j.choices?.[0]?.message?.content || '').trim();
        if (text) return { text, route, model: GITHUB_MODEL, ok: true, tried };
        tried.push('github-models empty');
      } else if (route === 'worker-ai') {
        const t = await f(`${secrets.ACTIONS_ID_TOKEN_REQUEST_URL}&audience=practical-solutions-llm`, { headers: { authorization: `Bearer ${secrets.ACTIONS_ID_TOKEN_REQUEST_TOKEN}` } });
        if (!t.ok) { tried.push(`oidc token HTTP ${t.status}`); continue; }
        const { value } = await t.json();
        const r = await f(secrets.PS_LLM_URL, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${value}` }, body: JSON.stringify({ prompt, max_tokens: maxTokens }) });
        if (!r.ok) { tried.push(`worker-ai HTTP ${r.status}`); continue; }
        const j = await r.json();
        if (j.text) return { text: j.text, route, model: j.model || WORKERS_AI_MODEL, ok: true, tried };
        tried.push('worker-ai empty');
      } else if (route === 'workers-ai') {
        const out = await secrets.AI.run(WORKERS_AI_MODEL, { messages: [{ role: 'user', content: prompt }], max_tokens: maxTokens });
        const text = textOf(out);
        if (text) return { text, route, model: WORKERS_AI_MODEL, ok: true, tried };
        tried.push('workers-ai empty');
      } else {
        const r = await f('https://api.anthropic.com/v1/messages', { method: 'POST',
          headers: { 'content-type': 'application/json', 'x-api-key': secrets.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
          body: JSON.stringify({ model: ANTHROPIC_MODEL, max_tokens: maxTokens, messages: [{ role: 'user', content: prompt }] }) });
        if (!r.ok) { tried.push(`anthropic HTTP ${r.status}`); continue; }
        const j = await r.json(); const text = (j.content || []).map(c => c.text || '').join('').trim();
        if (text) return { text, route, model: ANTHROPIC_MODEL, ok: true, tried };
        tried.push('anthropic empty');
      }
    } catch (e) { tried.push(`${route} ${String(e.message).slice(0, 80)}`); }
  }
  return { text: null, route: null, model: null, ok: false, tried };
}
