// SPDX-License-Identifier: LicenseRef-Ultrastable-USL-1.0
// Copyright (c) 2026 Rowan Brad Quni-Gudzinas. Non-commercial use free; commercial use requires a license. See LICENSE.
// Cross-vendor review of a code change before the code agent merges it (tools/agent.mjs). The reviewers are pool members from vendors other than
// the model that wrote the change; the rule is ps/ensemble.js reviewDecision. Tests and the live check stay the primary gates: this adds a second family's eyes.
import { candidates, askPanel, reviewPrompt, parseReview, reviewDecision, flaggedIds } from './ensemble.js';
import { askModel } from './llm.js';
import { ENSEMBLE } from '../worker/src/ensemble-config.js';

const ALIAS = { 'mistral-ai': 'mistral', 'ai21-labs': 'ai21' };
export function vendorOfModel(model, cfg = ENSEMBLE) {
  const hit = cfg.pool.find(m => m.model === model); if (hit) return hit.vendor;
  const v = String(model || '').replace(/^@cf\//, '').split('/')[0].toLowerCase(); return ALIAS[v] || v;
}
export async function crossReview({ title, diff, authorModel, secrets, fetch: f, cfg = ENSEMBLE, ask, seed = 0 }) {
  const doAsk = ask || ((spec, prompt, max) => askModel({ fetch: f, secrets, spec, prompt, maxTokens: max }));
  const author = vendorOfModel(authorModel, cfg), health = {};
  const r = await askPanel({ cands: candidates({ cfg, seed, flagged: flaggedIds({}, cfg) }), want: cfg.review_panel, ask: doAsk, prompt: reviewPrompt(title, diff), parse: parseReview, cfg, excludeVendors: [author], health, maxTokens: 250 });
  const votes = r.got.map(g => ({ id: g.member.id, vendor: g.member.vendor, model: g.model, ...g.parsed }));
  return { ...reviewDecision(votes), votes, author_vendor: author, tried: r.tried };
}
