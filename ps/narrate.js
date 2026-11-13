// SPDX-License-Identifier: LicenseRef-Ultrastable-USL-1.0
// Copyright (c) 2026 Rowan Brad Quni-Gudzinas. Non-commercial use free; commercial use requires a license. See LICENSE.
// Optional model role: writes the adoption path for the candidate solution. The deterministic brief stands without it; the call is recorded either way.
import { STANCE } from './charter.js';
export const NARRATOR = 'narrator';

export async function narrate({ fetch: f = globalThis.fetch, env = {}, key, model = 'claude-sonnet-5-5', brief }) {
  if (!key) return { text: null, called: false };
  const prompt = `${STANCE} Write at most 120 words on adopting this candidate solution: what it takes to implement, who could implement it, the cheapest first test, and one risk. Use only these facts, and say plainly this is a hypothesis from observational data.\n${JSON.stringify({ solution: (brief.candidates && brief.candidates[0] && brief.candidates[0].solution) || null, evidenceCase: brief.name, z: brief.z, differs: brief.practices, contextKeys: brief.contextKeys })}`;
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

// Key-free path: the Workers AI binding (env.AI) writes the same hypothesis, so a real model role runs without any secret.
export const AI_MODEL = '@cf/meta/llama-3.1-8b-instruct';
export async function narrateAI({ ai, brief, model = AI_MODEL }) {
  if (!ai) return { text: null, called: false };
  const prompt = `${STANCE} Write at most 120 words on adopting this candidate solution: what it takes to implement, who could implement it, the cheapest first test, and one risk. Use only these facts, and say plainly this is a hypothesis from observational data.\n${JSON.stringify({ solution: (brief.candidates && brief.candidates[0] && brief.candidates[0].solution) || null, evidenceCase: brief.name, z: brief.z, differs: brief.practices, contextKeys: brief.contextKeys })}`;
  try {
    const j = await ai.run(model, { messages: [{ role: 'user', content: prompt }], max_tokens: 300 });
    const text = String(j?.response ?? '').trim();
    return { text: text || null, called: true, ok: Boolean(text), model };
  } catch (e) { return { text: null, called: true, ok: false, model }; }
}
