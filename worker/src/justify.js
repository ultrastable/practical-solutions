// SPDX-License-Identifier: LicenseRef-Ultrastable-USL-1.0
// Copyright (c) 2026 Rowan Brad Quni-Gudzinas. Non-commercial use free; commercial use requires a license. See LICENSE.
// JUSTIFY-1: a connection is shown only when it can say why. Similarity in meaning finds candidates; it is never the reason. A candidate
// survives only with a stated mechanism from the catalogue's own data (a shared main outcome, a shared way of delivery, a shared
// population), with sources named, and a model panel can veto it. Anything that cannot justify itself is dropped, with the reason kept.
// Pure functions, no I/O: tools/connections.mjs applies them every run, the tests apply them to the whole catalogue.

// ---- vocabularies read from the catalogue's own words --------------------------------------------------------------------------------------
const POPS = [
  ['newborns', /newborn|neonat|low[- ]birth|baby|babies|birth/i], ['mothers', /maternal|mother|childbirth|postpartum|pregnan|maternity/i],
  ['children', /child|under[- ]five|under five|infant|school|pupil|stunt/i], ['women', /\bwomen|\bgirls?\b|female/i],
  ['people living in poverty', /poverty|poor\b|hunger|food insecur|ultra-poor/i], ['road users', /road|motorcycl|rider|driver/i],
];
// delivery channels: narrow ones name a place or programme two solutions can share; broad ones (a whole ministry) are too loose to justify a bundle alone
const CHANNELS = [
  { id: 'maternity wards', narrow: true, re: /maternity|midwi/i }, { id: 'schools', narrow: true, re: /school|education depart|ministries of education/i },
  { id: 'social-protection programmes', narrow: true, re: /social[- ]protection|BRAC|cash/i }, { id: 'primary-care clinics', narrow: true, re: /primary[- ]care|clinics?\b|community health/i },
  { id: 'national immunisation and nutrition programmes', narrow: true, re: /immunisation|nutrition programme|malaria programme|tuberculosis programme/i },
  { id: 'water and sanitation authorities', narrow: true, re: /water authorit|sanitation|village committee/i },
  { id: 'health ministries', narrow: false, re: /health|medicines|hospital/i }, { id: 'energy ministries', narrow: false, re: /energy|electricity|utilit/i },
];
const tags = (text, list, key = 'id') => list.filter(x => (x.re || x[1]).test(text)).map(x => x[key] ?? x[0]);

/** What the catalogue holds about one solution that can justify a link: outcomes, delivery channels, populations, evidence and its strength. */
export function profile(s, problemsById = new Map()) {
  const outcomes = (s.problem_ids || []).slice();
  const probText = outcomes.map(id => (problemsById.get(id) || {}).title || '').join(' ');
  const popText = [s.title, s.claim, s.works_where, probText].join(' ');
  const who = String(s.who || '');
  return {
    id: s.id, title: s.title, outcomes, main: outcomes[0] || null,
    pops: tags(popText, POPS), channels: tags(who + ' ' + String(s.takes || ''), CHANNELS), narrowChannels: tags(who + ' ' + String(s.takes || ''), CHANNELS.filter(c => c.narrow)),
    sources: (s.evidence || []).map(e => e.src).filter(Boolean),
    strength: s.verdict === 'works' ? 1 : s.verdict === 'mixed' ? 0.5 : s.verdict ? 0.3 : 0.7,
  };
}
const shared = (a, b) => a.filter(x => b.includes(x));
const list = xs => xs.length < 2 ? xs.join('') : xs.slice(0, -1).join(', ') + ' and ' + xs[xs.length - 1];
const roundTo = (x, step = 5) => Math.round(x / step) * step;

export const TIERS = [[75, 'Strong rationale'], [55, 'Good rationale'], [0, 'Plausible rationale']];
export const tierOf = v => TIERS.find(([min]) => v >= min)[1];

/**
 * Two solutions are worth testing together only for a reason the catalogue can state:
 *   same outcome  : the main target of one is a stated target of the other, so both move the same measured number by different routes; or
 *   same delivery : both are delivered through the same narrow channel (a ward, a school, a programme) to the same population, so one visit can carry both.
 * Outcome alone also needs a shared delivery channel or population, so two unrelated things that happen to touch one indicator do not pass.
 */
export function judgeCombination(a, b, problemsById = new Map()) {
  const outcomes = shared(a.outcomes, b.outcomes).filter(o => o === a.main || o === b.main);
  const pops = shared(a.pops, b.pops), chans = shared(a.channels, b.channels), narrow = shared(a.narrowChannels, b.narrowChannels);
  const out0 = outcomes.map(o => (problemsById.get(o) || {}).title || o);
  let kind = null;
  if (outcomes.length && (pops.length || chans.length)) kind = 'outcome';
  else if (narrow.length && pops.length) kind = 'delivery';
  if (!kind) return { ok: false, code: 'no-shared-mechanism', reason: `${a.title} and ${b.title} share no main outcome, delivery channel or population, so nothing explains why they belong together.` };
  const parts = [];
  if (outcomes.length) parts.push(`both act on ${list(out0.map(x => `"${x}"`))}, by different routes ("${a.title}"; "${b.title}")`);
  if (narrow.length) parts.push(`both are delivered through ${list(narrow)}, so one programme can carry both and share its costs`);
  else if (chans.length && kind === 'outcome') parts.push(`both are run by ${list(chans)}`);
  if (pops.length) parts.push(`both reach ${list(pops)}`);
  const value = roundTo(Math.min(100, (outcomes.length ? 40 : 0) + (narrow.length ? 25 : chans.length ? 10 : 0) + (pops.length ? 15 : 0) + 20 * ((a.strength + b.strength) / 2)));
  const cite = [...a.sources.slice(0, 1).map(s => `${a.title}: ${s}`), ...b.sources.slice(0, 1).map(s => `${b.title}: ${s}`)];
  return { ok: true, kind, value, tier: tierOf(value), why: `${parts.join('; ')}.`.replace(/^./, c => c.toUpperCase()), sources: cite, how: kind === 'outcome' ? 'shared outcome' : 'shared delivery' };
}

// ---- problem-to-problem and solution-to-problem links ------------------------------------------------------------------------------------
const STOP = new Set('the of and in per for to a an on by with from number proportion percentage percent rate total population share people persons all any age aged years year level levels cent use using services service estimated estimate average annual mean median national global index per-cent'.split(' '));
const SYN = { neonatal: 'newborn', newborns: 'newborn', mortality: 'death', deaths: 'death', dying: 'death', died: 'death', children: 'child', infant: 'child', infants: 'child', toilets: 'sanitation', latrines: 'sanitation', hygiene: 'sanitation', maternal: 'mother', mothers: 'mother', drinking: 'water' };
export const words = t => [...new Set((String(t || '').toLowerCase().match(/[a-z]{3,}/g) || []).map(w => SYN[w] || w).filter(w => !STOP.has(w)))];
const overlap = (a, b) => { const A = new Set(words(a)), B = words(b); return B.filter(w => A.has(w)); };

/** The same problem under another measure (rural/urban split, a different indicator code): a missing catalogue link, not a discovery. */
export const isAlias = (a, b) => { const o = overlap(a, b), n = Math.min(words(a).length, words(b).length) || 1; return o.length >= 1 && o.length / n >= 0.5; };

/** A proven solution and a different problem in the same field: shown only when the problem is not an alias of one it already addresses. */
export function judgeTransfer(sol, target, addressed) {
  if (addressed.some(p => isAlias(p.label, target.label))) return { ok: false, code: 'same-problem-other-measure', reason: `"${target.label}" is another measure of "${addressed.map(p => p.label).join('", "')}", which the solution already addresses: a link to add to the catalogue, not a new test.` };
  const domains = [...new Set(addressed.map(p => p.domain))];
  if (!domains.includes(target.domain)) return { ok: false, code: 'different-field', reason: `"${target.label}" is in ${target.domain || 'another field'}, not ${domains.join(' or ') || 'the fields the solution has evidence in'}, and no shared mechanism is on record.` };
  return { ok: true, needsModel: true, value: 50, tier: tierOf(50), why: `"${sol.title}" has evidence against ${list(addressed.map(p => `"${p.label}"`))}; "${target.label}" is in the same field (${target.domain}) but is a different outcome, so the result might carry over.`, how: 'same field, different outcome' };
}

/** Two problems that read alike but sit apart: shown only when they are different outcomes (not one measure twice) and share a field or mechanism words. */
export function judgeBridge(a, b) {
  if (isAlias(a.label, b.label)) return { ok: false, code: 'same-problem-other-measure', reason: `"${a.label}" and "${b.label}" measure the same thing in different ways.` };
  const w = overlap(a.label, b.label);
  if (a.domain === b.domain || w.length >= 2) return { ok: true, needsModel: true, value: 45, tier: tierOf(45), why: `"${a.label}" and "${b.label}" are different outcomes that share ${a.domain === b.domain ? `the field ${a.domain}` : `the terms ${list(w)}`}; the catalogue links them to nothing in common.`, how: 'shared field' };
  return { ok: false, code: 'no-shared-mechanism', reason: `"${a.label}" and "${b.label}" share no field or terms.` };
}

/** An open question: a problem nothing in the catalogue addresses. It is a gap with a measured size, not a similarity claim, so only measured problems count. */
export function judgeFrontier(p) {
  const m = p.m || null;
  if (!m || m.pace == null || !p.note) return { ok: false, code: 'no-measure', reason: `"${p.label}" has no measured trend or source note, so its size and urgency are unknown.` };
  const dir = m.status || (m.dir === 'up' ? 'rising' : 'falling');
  const value = roundTo(Math.min(100, 45 + 6 * Math.min(5, Math.abs(Number(m.pace)))));
  return { ok: true, value, tier: tierOf(value), how: 'measured gap', why: `Nothing in the catalogue addresses "${p.label}". Its own source reads ${m.value != null ? 'a latest value of ' + Number(m.value).toPrecision(3) + (m.year ? ' (' + m.year + ')' : '') + ', ' : ''}${dir}${p.note ? ': ' + String(p.note).slice(0, 140) : ''}.` };
}

/** "Alike in meaning" links shown on pages: kept only inside a field, or across fields with two shared terms. The number shown is a band, never a percentage. */
export function judgeNear(a, b, sim) {
  if (a.domain && a.domain === b.domain) return { ok: true, band: band(sim) };
  if (overlap(a.label, b.label).length >= 2 && sim >= 0.8) return { ok: true, band: band(sim) };
  return { ok: false, code: 'different-field-no-shared-terms' };
}
export const band = s => (s >= 0.85 ? 'very close' : s >= 0.75 ? 'close' : 'related');

// ---- model panel (a veto, never a source of facts) -----------------------------------------------------------------------------------------
export const judgePrompt = (stance, e) => `You are a ${stance} reviewer of a claim that two items in a catalogue of evidence-based practical solutions to global problems should be linked.\n\n${e.items.map(i => `- ${i.kind} "${i.label}": ${String(i.text || '').slice(0, 400)}`).join('\n')}\n\nProposed reason: ${e.why}\n\nIs there a real, specific causal mechanism, shared delivery channel, shared population or documented bundling that makes this link useful to an implementer? Be strict: reject links that only share words, a field or a statistic. Reply with exactly one JSON object: {"verdict":"keep" or "drop","reason":"one sentence, no figures not in the text above"}.`;
export const digitsIn = s => (String(s).match(/\d[\d.,]*/g) || []).map(x => x.replace(/[.,]+$/, ''));
export function parseVerdict(text) {
  const m = /\{[\s\S]*\}/.exec(String(text || '')); if (!m) return null;
  try { const j = JSON.parse(m[0]); if (j.verdict !== 'keep' && j.verdict !== 'drop') return null; return { verdict: j.verdict, reason: String(j.reason || '').replace(/\s+/g, ' ').slice(0, 240) }; } catch { return null; }
}
/** The panel's decision: every answering member must keep it, and at least `min` must have answered. Silence is not approval. */
export function panel(votes, min = 2) {
  const ok = votes.filter(Boolean);
  if (ok.length < min) return { decided: false, votes: ok };
  return { decided: true, keep: ok.every(v => v.verdict === 'keep'), votes: ok };
}
