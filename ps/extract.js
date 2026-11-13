// SPDX-License-Identifier: LicenseRef-Ultrastable-USL-1.0
// Copyright (c) 2026 Rowan Brad Quni-Gudzinas. Non-commercial use free; commercial use requires a license. See LICENSE.
// LLM practice extraction. The numeric indicators say THAT a unit differs; this stage asks a model WHAT the unit is known to do
// (named programmes, policies, delivery methods) that could explain it. Output is a list of hypotheses, each marked unverified,
// each with the evidence a person would need to check it. It never changes the brief's statistics, status or prediction.
import { complete } from './llm.js';

export const EXTRACTOR = 'extractor-model';
export const MAX_PRACTICES = 5;

export const promptFor = b => `You extract candidate explanations for a statistical bright spot. Facts (from public World Bank data): unit ${b.name} (${b.unit}) has outcome ${Number(b.observed).toFixed(2)} where its context predicts ${Number(b.expected).toFixed(2)} (${b.higherIsBetter ? 'higher' : 'lower'} is better, ${Number(b.z).toFixed(2)} robust SD from expectation). Matched peers: ${b.peers.join(', ')}. Indicators that differ from peers: ${b.practices.map(p => `${p.key} ${p.effect >= 0 ? '+' : ''}${Number(p.effect).toFixed(2)}`).join('; ') || 'none'}.
List up to ${MAX_PRACTICES} specific, named practices, programmes or policies this unit is publicly reported to run that could plausibly explain the gap, and also any data-quality or measurement reasons the number could be an artefact (modelled estimates, conflict, small population, definition change). Answer with JSON only: {"practices":[{"name":"","what":"","how_to_check":"","confidence":"low|medium|high"}],"artefact_risks":[""]}. If you do not know of any, return empty lists. Do not invent programmes.`;

// Tolerant parse: models wrap JSON in prose or fences. Anything that is not the expected shape is rejected, never repaired by guessing.
export function parseExtraction(text) {
  const m = String(text || '').match(/\{[\s\S]*\}/);
  if (!m) return null;
  let j; try { j = JSON.parse(m[0]); } catch { return null; }
  if (!j || !Array.isArray(j.practices)) return null;
  const conf = new Set(['low', 'medium', 'high']);
  const practices = j.practices.filter(p => p && typeof p.name === 'string' && p.name.trim()).slice(0, MAX_PRACTICES).map(p => ({
    name: p.name.trim().slice(0, 120), what: String(p.what || '').slice(0, 400), how_to_check: String(p.how_to_check || '').slice(0, 300),
    confidence: conf.has(p.confidence) ? p.confidence : 'low', source: 'model-knowledge', verified: false }));
  const artefact_risks = (Array.isArray(j.artefact_risks) ? j.artefact_risks : []).filter(x => typeof x === 'string').slice(0, 5).map(x => x.slice(0, 200));
  return { practices, artefact_risks };
}

export async function extractPractices({ fetch, secrets, brief }) {
  const r = await complete({ fetch, secrets, prompt: promptFor(brief), maxTokens: 700 });
  if (!r.ok) return { ok: false, called: r.tried.length > 0, reason: r.tried.join('; ') || 'no model route bound', route: null, model: null };
  const parsed = parseExtraction(r.text);
  if (!parsed) return { ok: false, called: true, reason: 'model answer was not the expected JSON', route: r.route, model: r.model };
  return { ok: true, called: true, route: r.route, model: r.model, ...parsed };
}
