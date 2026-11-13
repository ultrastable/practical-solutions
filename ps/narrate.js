// SPDX-License-Identifier: LicenseRef-Ultrastable-USL-1.0
// Copyright (c) 2026 Rowan Brad Quni-Gudzinas. Non-commercial use free; commercial use requires a license. See LICENSE.
// Optional model role: writes the transfer hypothesis. The deterministic brief stands without it; the call is recorded either way.
export const NARRATOR = 'narrator';

export async function narrate({ fetch: f = globalThis.fetch, env = {}, key, model = 'claude-sonnet-5-5', brief }) {
  if (!key) return { text: null, called: false };
  const prompt = `You are a careful analyst. Write at most 120 words: a transfer hypothesis for why this bright spot may do better than its context predicts, who could test it, and the cheapest first test. Use only these facts, and say plainly that this is a hypothesis.\n${JSON.stringify({ unit: brief.name, z: brief.z, practices: brief.practices, peers: brief.peers, contextKeys: brief.contextKeys })}`;
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
