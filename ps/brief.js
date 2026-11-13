// SPDX-License-Identifier: LicenseRef-Ultrastable-USL-1.0
// Copyright (c) 2026 Rowan Brad Quni-Gudzinas. Non-commercial use free; commercial use requires a license. See LICENSE.
// A solution brief: the unit of output. Every claim in it is backed by a number in the record, and it states what the data cannot show.
export function hashDataset(ds) {
  let h = 2166136261;
  const s = JSON.stringify(ds.units.map(u => [u.id, u.outcome, ...Object.values(u.context), ...Object.values(u.practices)]));
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h.toString(16).padStart(8, '0');
}

export function briefId(problemId, unit, hash) { return `${problemId}:${unit}:${hash}`; }

const cfgOf = problem => { try { return typeof problem.config === 'string' ? JSON.parse(problem.config) : (problem.config || problem); } catch { return {}; } };

// The solution a practice stands for: from the problem's `levers` (code reads them), else the practice key itself.
export function solutionFor(problem, key) {
  const lv = (cfgOf(problem).levers || {})[key] || {};
  return { key, solution: lv.solution || key, implement: lv.implement || null, who: lv.who || null, first_test: lv.first_test || null };
}

export function makeBrief(problem, ds, spot, hash) {
  const top = spot.practices.slice(0, 3);
  return {
    candidates: top.map(p => ({ ...solutionFor(problem, p.key), effect: p.effect })),
    problemStatement: cfgOf(problem).statement || problem.title,
    id: briefId(problem.id, spot.id, hash),
    problem: problem.id, title: problem.title, unit: spot.id, name: spot.name,
    z: spot.z, stability: spot.stability, observed: spot.observed, expected: spot.expected,
    higherIsBetter: ds.higherIsBetter, peers: spot.peers, practices: spot.practices.slice(0, 3),
    contextKeys: ds.contextKeys, n: ds.units.length, dataset: hash, source: ds.source || 'unspecified',
  };
}

export function renderBrief(b, verification, narrative) {
  const dir = b.higherIsBetter ? 'higher' : 'lower';
  const cands = b.candidates || [];
  const lead = cands[0];
  const lines = [
    `# Solution brief: ${lead ? lead.solution : b.title}`, '',
    `**Problem.** ${b.problemStatement || b.title}`, '',
    lead ? `**Candidate solution.** ${lead.solution}.` : '**Candidate solution.** None stands out from the noise in this refresh; the case below is kept as evidence only.', '',
  ];
  if (lead && lead.implement) lines.push(`**What implementing it takes.** ${lead.implement}`, '');
  if (lead && lead.who) lines.push(`**Who could implement it.** ${lead.who}`, '');
  if (lead && lead.first_test) lines.push(`**Cheapest first test.** ${lead.first_test}`, '');
  lines.push(
    `**Evidence.** ${b.name} (${b.unit}) does better than its setting predicts: outcome ${b.observed.toFixed(3)} where context (${b.contextKeys.join(', ')}) predicts ${b.expected.toFixed(3)}; ${dir} is better. That is ${b.z.toFixed(2)} robust standard deviations above expectation, and it holds in ${(b.stability * 100).toFixed(0)}% of bootstrap refits (n = ${b.n}). It is evidence for the solution, not the subject of the brief. Matched comparison cases: ${b.peers.join(', ')}.`, '',
    '**What differs from comparison cases** (standardized difference; association, not cause):', '',
    ...(cands.length ? cands.map(p => `- ${p.solution} (${p.key}): ${p.effect >= 0 ? '+' : ''}${p.effect.toFixed(2)}`) : ['- no solution differs by more than the noise threshold']), '');
  if (verification) lines.push(`**Independent check** (${verification.by}): ${verification.verdict}. ${verification.reason || ''}${verification.pAdj != null ? ` Adjusted p = ${verification.pAdj.toFixed(3)} for ${verification.practice}.` : ''} Leave-one-out z = ${verification.zLoo != null ? verification.zLoo.toFixed(2) : 'n/a'}.`, '');
  if (narrative) lines.push('**Adoption path.**', '', narrative, '');
  lines.push(
    `**Prediction (scored automatically).** On the next data refresh the evidence case still stands at or above the threshold, probability ${(b.stability).toFixed(2)}. The result is recorded whether it holds or not.`, '',
    '**What this cannot show.** The data is observational and aggregate. A solution that differs is a lead to pilot, not proof that adopting it works elsewhere.', '',
    `Dataset ${b.dataset}; source ${b.source}.`);
  return lines.join('\n');
}
