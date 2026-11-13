// SPDX-License-Identifier: LicenseRef-Ultrastable-USL-1.0
// Copyright (c) 2026 Rowan Brad Quni-Gudzinas. Non-commercial use free; commercial use requires a license. See LICENSE.
// Optional model role: writes the transfer hypothesis. The deterministic brief stands without it; the call is recorded either way.
export const NARRATOR = 'narrator';

export const WORKERS_AI_MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';

// key: Anthropic API key (optional). ai: a Cloudflare Workers AI binding (account-bound, no secret, nothing for a person to paste).
export async function narrate({ fetch: f = globalThis.fetch, env = {}, key, ai, model = 'claude-sonnet-5-5', brief }) {
  if (!key && !(ai && ai.run)) return { text: null, called: false };
  const prompt = `You are a careful analyst. Write at most 120 words: a transfer hypothesis for why this bright spot may do better than its context predicts, who could test it, and the cheapest first test. Use only these facts, and say plainly that this is a hypothesis.\n${JSON.stringify({ unit: brief.name, z: brief.z, practices: brief.practices, peers: brief.peers, contextKeys: brief.contextKeys })}`;
  if (!key) {
    try {
      const out = await ai.run(WORKERS_AI_MODEL, { messages: [{ role: 'user', content: prompt }], max_tokens: 300 });
      const text = String((out && (out.response || out.result)) || '').trim();
      return { text: text || null, called: true, ok: Boolean(text), model: WORKERS_AI_MODEL };
    } catch (e) { return { text: null, called: true, ok: false, model: WORKERS_AI_MODEL }; }
  }
  const r = await f('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model, max_tokens: 300, messages: [{ role: 'user', content: prompt }] }),
  });
  if (!r.ok) return { text: null, called: true, ok: false, status: r.status, model };
  const j = await r.json();
  const text = (j.content || []).map(c => c.text || '').join('').trim();
  return { text: text || null, called: true, ok: Boolean(text), model };
}
