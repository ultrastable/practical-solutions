// SPDX-License-Identifier: LicenseRef-Ultrastable-USL-1.0
// Copyright (c) 2026 Rowan Brad Quni-Gudzinas. Non-commercial use free; commercial use requires a license. See LICENSE.
// The Cloudflare Worker: cron runs one tick of every loop; fetch serves /health, /ps/briefs, /ps/criticality and the Ultrastable routes.
// Two token-gated routes exist for the bootstrap workflow: POST /ps/tick (run one tick now) and GET /ps/ledger (export state).
import { createPs } from '../../ps/org.js';
import { ledgerExport } from '../../ps/ledger.js';
import { verifyOidc } from '../../ps/oidc.js';
import { WORKERS_AI_MODEL } from '../../ps/llm.js';

export const LLM_AUDIENCE = 'practical-solutions-llm';
export const LLM_REPOSITORY = 'QNFO/practical-solutions';

const ps = env => createPs({ db: env.DB, env, secrets: env });
const authed = (request, env) => Boolean(env.PS_TICK_TOKEN) && request.headers.get('x-ps-token') === env.PS_TICK_TOKEN;

export default {
  async scheduled(_event, env, ctx) { ctx.waitUntil(ps(env).tick()); },
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    if (pathname === '/ps/tick' || pathname === '/ps/ledger') {
      if (!authed(request, env)) return new Response('forbidden\n', { status: 403 });
      if (pathname === '/ps/tick') return request.method === 'POST' ? Response.json({ report: (await ps(env).tick()).report }) : new Response('POST only\n', { status: 405 });
      return Response.json(await ledgerExport(env.DB));
    }
    if (pathname === '/ps/llm') {  // the keyless model route: a workflow run of this repository proves itself with its own OIDC token, the Worker runs its Workers AI binding
      if (request.method !== 'POST') return new Response('POST only\n', { status: 405 });
      if (!env.AI || !env.AI.run) return Response.json({ error: 'no_ai_binding' }, { status: 503 });
      const v = await verifyOidc((request.headers.get('authorization') || '').replace(/^Bearer /, ''), { audience: LLM_AUDIENCE, repository: LLM_REPOSITORY });
      if (!v.ok) return Response.json({ error: 'forbidden', reason: v.reason }, { status: 403 });
      const b = await request.json().catch(() => null);
      if (!b || typeof b.prompt !== 'string' || b.prompt.length > 6000) return Response.json({ error: 'bad_request' }, { status: 400 });
      const out = await env.AI.run(WORKERS_AI_MODEL, { messages: [{ role: 'user', content: b.prompt }], max_tokens: Math.min(Number(b.max_tokens) || 600, 800) });
      return Response.json({ text: String((out && (out.response || out.result)) || '').trim(), model: WORKERS_AI_MODEL });
    }
    return (await ps(env).handle(request)) ?? new Response('practical-solutions\n', { status: 404, headers: { 'content-type': 'text/plain' } });
  },
};
