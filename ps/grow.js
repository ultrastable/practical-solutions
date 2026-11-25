// SPDX-License-Identifier: LicenseRef-Ultrastable-USL-1.0
// Copyright (c) 2026 Rowan Brad Quni-Gudzinas. Non-commercial use free; commercial use requires a license. See LICENSE.
// IMPACT-LOOP-1 catalogue growth, one problem and one entry at a time. A model drafts ONE solution entry as JSON from real sources (ps/implevidence.js: DOI resolved at
// Crossref, abstract that names the intervention); this file checks the draft and renders the two insertions, so the model never edits a file. Gates, all in code:
// every figure quoted in a finding must appear in the abstract of the source it names; adoption and cost claims are capped by what that abstract says;
// the entry starts "not yet checked against the source" so the loop's own citation check still has the last word. Pure; tools/growsolution.mjs does the I/O.
const DESIGNS = ['review', 'trial', 'observational', 'guidance'], VERDICTS = ['works', 'mixed', 'limited'], COSTS = ['low', 'medium', 'high'], ADOPTS = ['scaled', 'piloted', 'trial-only'];
const SCALE_RE = /(scale[- ]?up|scaled|national|nationwide|programme|program\b|routine|implementation|rollout|roll-out)/i, CHEAP_RE = /(low[- ]cost|cost[- ]effective|cheap|inexpensive|affordable)/i;
export const nums = t => [...new Set(String(t).match(/\d+(?:[.,]\d+)?/g) || [])];

export function buildPrompt(problem, hits) {
  return `You add ONE practical solution to an evidence catalogue. Problem: "${problem.title}" (${problem.domain}; ${problem.unit}).
Use ONLY the sources below. Every number you quote must appear in the abstract of the source you name. Prefer an intervention that has been delivered in real programmes.
Answer with a single JSON object and nothing else:
{"id":"kebab-case-slug","title":"imperative title, under 90 characters","claim":"one sentence, no number the source does not give","design":"review|trial|observational|guidance","verdict":"works|mixed|limited",
"evidence":[{"source":0,"finding":"what the source found, with its own figures"}],"works_where":"where the evidence comes from","takes":"what it takes to deliver","who":"who holds the remit and money","first_test":"a small first test","limits":"what the evidence does not show",
"implementability":{"cost":"low|medium|high","cost_note":"why","adoption":"scaled|piloted|trial-only","channel":"an existing delivery channel or null","actors":"who"}}
SOURCES:
${hits.map((h, i) => `[${i}] ${h.title} (${h.year || 'n.d.'}) ${h.url}\nAbstract: ${h.abstract}`).join('\n')}`;
}

// Returns { ok, entry, impl, why }. entry goes into MORE (worker/src/more-solutions.js), impl into IMPL (worker/src/implementability.js).
export function check(text, { problem, hits, ids = [] }) {
  let j; try { j = JSON.parse((/\{[\s\S]*\}/.exec(String(text).replace(/^```(?:json)?|```$/gm, '')) || [''])[0]); } catch { return { ok: false, why: 'the answer was not JSON' }; }
  const bad = why => ({ ok: false, why });
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(j.id || '') || j.id.length > 40) return bad('id is not a short kebab-case slug');
  if (ids.includes(j.id)) return bad('id already in the catalogue');
  for (const k of ['title', 'claim', 'works_where', 'takes', 'who', 'first_test', 'limits']) if (typeof j[k] !== 'string' || j[k].trim().length < 12) return bad(`field ${k} is missing or too short`);
  if (!DESIGNS.includes(j.design) || !VERDICTS.includes(j.verdict)) return bad('design or verdict is not one of the allowed words');
  if (!Array.isArray(j.evidence) || !j.evidence.length) return bad('no evidence');
  const evidence = [];
  for (const e of j.evidence) {
    const h = hits[Number(e && e.source)]; if (!h || typeof e.finding !== 'string') return bad('evidence names a source that was not given');
    const miss = nums(e.finding).filter(n => !nums(h.abstract).includes(n)); if (miss.length) return bad(`figure(s) ${miss.join(', ')} are not in the abstract of source ${e.source}`);
    evidence.push({ src: `${h.title} (${h.year || 'n.d.'}), ${h.url}`, finding: e.finding.trim() });
  }
  const i = j.implementability || {}, abs = hits.map(h => h.abstract).join(' ');
  if (!COSTS.includes(i.cost) || !ADOPTS.includes(i.adoption) || typeof i.cost_note !== 'string' || typeof i.actors !== 'string') return bad('implementability facts are incomplete');
  const adoption = i.adoption !== 'trial-only' && !SCALE_RE.test(abs) ? 'trial-only' : i.adoption, cost = i.cost === 'low' && !CHEAP_RE.test(abs) ? 'medium' : i.cost;   // a claim the abstracts do not support is capped, never accepted
  const entry = { id: j.id, design: j.design, verdict: j.verdict, checks: [], problem_ids: [problem.id], verified: 'not yet checked against the source', problem: problem.title, title: j.title.trim(), claim: j.claim.trim(), evidence, works_where: j.works_where.trim(), takes: j.takes.trim(), who: j.who.trim(), first_test: j.first_test.trim(), limits: j.limits.trim() };
  return { ok: true, entry, impl: { cost, cost_note: i.cost_note.trim(), adoption, channel: typeof i.channel === 'string' && i.channel.trim() ? i.channel.trim() : null, actors: i.actors.trim() }, capped: adoption !== i.adoption || cost !== i.cost };
}

const q = s => JSON.stringify(s);
export const renderEntry = e => `\n  { id: ${q(e.id)}, design: ${q(e.design)}, verdict: ${q(e.verdict)}, checks: [], problem_ids: ${q(e.problem_ids)}, verified: ${q(e.verified)}, problem: ${q(e.problem)}, title: ${q(e.title)},\n    claim: ${q(e.claim)},\n    evidence: ${q(e.evidence)},\n    works_where: ${q(e.works_where)},\n    takes: ${q(e.takes)},\n    who: ${q(e.who)},\n    first_test: ${q(e.first_test)},\n    limits: ${q(e.limits)} },`;
export const renderImpl = (id, i) => `  ${q(id)}: { cost: ${q(i.cost)}, cost_note: ${q(i.cost_note)}, adoption: ${q(i.adoption)}, channel: ${i.channel === null ? 'null' : q(i.channel)}, actors: ${q(i.actors)} },\n`;
// Insert before the closing line of the exported array / object; returns null when the anchor is not found exactly once.
export function insertBefore(text, anchor, add) { const n = text.split(anchor).length - 1; return n === 1 ? text.replace(anchor, () => add + anchor) : null; }
export const MORE_ANCHOR = '\n];\n', IMPL_ANCHOR = '};\nexport const COST';
