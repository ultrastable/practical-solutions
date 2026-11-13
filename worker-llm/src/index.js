// SPDX-License-Identifier: LicenseRef-Ultrastable-USL-1.0
// Copyright (c) 2026 Rowan Brad Quni-Gudzinas. Non-commercial use free; commercial use requires a license. See LICENSE.
// ps-llm: the keyless model route. A workflow run of this repository proves itself with its own GitHub OIDC token (no stored secret);
// the Worker verifies it and runs its Workers AI binding. Deployed by tools/deploy_llm.mjs (bundle) as its own small Worker.
import { verifyOidc } from '../../ps/oidc.js';
import { WORKERS_AI_MODEL } from '../../ps/llm.js';

export const LLM_AUDIENCE = 'practical-solutions-llm';
export const LLM_REPOSITORY = 'QNFO/practical-solutions';

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    if (pathname === '/health') return Response.json({ ok: true, ai: Boolean(env.AI) });
    if (pathname !== '/ps/llm') return new Response('not found\n', { status: 404 });
    if (request.method !== 'POST') return new Response('POST only\n', { status: 405 });
    if (!env.AI || !env.AI.run) return Response.json({ error: 'no_ai_binding' }, { status: 503 });
    const v = await verifyOidc((request.headers.get('authorization') || '').replace(/^Bearer /, ''), { audience: LLM_AUDIENCE, repository: LLM_REPOSITORY });
    if (!v.ok) return Response.json({ error: 'forbidden', reason: v.reason }, { status: 403 });
    const b = await request.json().catch(() => null);
    if (!b || typeof b.prompt !== 'string' || b.prompt.length > 6000) return Response.json({ error: 'bad_request' }, { status: 400 });
    const out = await env.AI.run(WORKERS_AI_MODEL, { messages: [{ role: 'user', content: b.prompt }], max_tokens: Math.min(Number(b.max_tokens) || 600, 800) });
    return Response.json({ text: String((out && (out.response || out.result)) || '').trim(), model: WORKERS_AI_MODEL });
  },
};
