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

export function makeBrief(problem, ds, spot, hash) {
  return {
    id: briefId(problem.id, spot.id, hash),
    problem: problem.id, title: problem.title, unit: spot.id, name: spot.name,
    z: spot.z, stability: spot.stability, observed: spot.observed, expected: spot.expected,
    higherIsBetter: ds.higherIsBetter, peers: spot.peers, practices: spot.practices.slice(0, 3),
    contextKeys: ds.contextKeys, n: ds.units.length, dataset: hash, source: ds.source || 'unspecified',
  };
}

export function renderBrief(b, verification, narrative, extraction) {
  const dir = b.higherIsBetter ? 'higher' : 'lower';
  const lines = [
    `# ${b.title}: ${b.name}`, '',
    `**Bright spot.** ${b.name} (${b.unit}) has an outcome of ${b.observed.toFixed(3)} where its context (${b.contextKeys.join(', ')}) predicts ${b.expected.toFixed(3)}; ${dir} is better. That is ${b.z.toFixed(2)} robust standard deviations above expectation, and it stays above 1 in ${(b.stability * 100).toFixed(0)}% of bootstrap refits (n = ${b.n}).`, '',
    `**Matched peers** (nearest in context, not bright): ${b.peers.join(', ')}.`, '',
    '**What differs from those peers** (standardized difference; association, not cause):', '',
    ...(b.practices.length ? b.practices.map(p => `- ${p.key}: ${p.effect >= 0 ? '+' : ''}${p.effect.toFixed(2)}`) : ['- no practice differs by more than the noise threshold']), '',
  ];
  if (verification) lines.push(`**Independent check** (${verification.by}): ${verification.verdict}. ${verification.reason || ''}${verification.pAdj != null ? ` Adjusted p = ${verification.pAdj.toFixed(3)} for ${verification.practice}.` : ''} Leave-one-out z = ${verification.zLoo != null ? verification.zLoo.toFixed(2) : 'n/a'}.`, '');
  if (narrative) lines.push('**Transfer hypothesis.**', '', narrative, '');
  if (extraction && (extraction.practices?.length || extraction.artefact_risks?.length)) {
    lines.push(`**Candidate practices (model-extracted from its general knowledge, unverified; ${extraction.model}).**`, '');
    for (const p of extraction.practices) lines.push(`- ${p.name} [${p.confidence}]: ${p.what} To check: ${p.how_to_check}`);
    if (extraction.artefact_risks.length) lines.push('', 'Possible measurement artefacts:', ...extraction.artefact_risks.map(x => `- ${x}`));
    lines.push('');
  }
  lines.push(
    `**Prediction (scored automatically).** On the next data refresh, ${b.name}'s residual z stays at or above the problem's threshold, probability ${(b.stability).toFixed(2)}. The result is recorded whether it holds or not.`, '',
    '**What this cannot show.** The data is observational and aggregate. A practice that differs is a lead for investigation, not proof that copying it works.', '',
    `Dataset ${b.dataset}; source ${b.source}.`);
  return lines.join('\n');
}
