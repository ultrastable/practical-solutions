// SPDX-License-Identifier: LicenseRef-Ultrastable-USL-1.0
// Copyright (c) 2026 Rowan Brad Quni-Gudzinas. Non-commercial use free; commercial use requires a license. See LICENSE.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { SYNTHESES } from '../worker/src/syntheses-data.js';
import { verifyEntry, genModule, bcaOf, similarity, LEDGER } from '../tools/synth.mjs';

// A fake of the three public registers: Crossref finds the paper by title, Europe PMC returns an abstract, OpenAlex returns related works.
const fakeFetch = (abstract = '') => async url => {
  const u = String(url), body = u.includes('crossref') ? { message: { items: [{ DOI: '10.1/x', title: [decodeURIComponent(u.split('query.bibliographic=')[1].split('&')[0])], issued: { 'date-parts': [[Number(global.__year)]] }, 'container-title': ['J'] }] } }
    : u.includes('europepmc') ? { resultList: { result: [{ abstractText: abstract }] } } : { results: [{ title: 'A barbershop study', publication_year: 2018, doi: 'https://doi.org/10.1/y' }], meta: { count: 1 } };
  return { ok: true, json: async () => body };
};
const withYear = (s, f) => async url => { global.__year = String(url).includes('crossref') ? (s.citations.find(c => decodeURIComponent(String(url)).includes(c.q)) || {}).year : 0; return f(url); };

test('every synthesis has parts that are cited, a first test that can fail, risks and a valid benefit-cost model', () => {
  assert.ok(SYNTHESES.length >= 3);
  for (const s of SYNTHESES) {
    assert.ok(s.citations.length >= 3, s.id); assert.ok(s.first_test && s.risks.length && s.limits, s.id);
    assert.ok(s.novelty.queries.length >= 1, s.id);
    const b = bcaOf(s); assert.ok(b.wellby_per_1000_usd.p50 > 0 && b.evidence_share, s.id);
    assert.ok((b.evidence_share.D || 0) > 0, s.id + ' must show that its estimate rests on assumptions');
  }
});
test('the gate passes an entry only when every paper is found and every quoted figure is in its abstract', async () => {
  const s = SYNTHESES.find(x => x.id === 'expectation-framing-hearts');
  const good = await verifyEntry(withYear(s, fakeFetch('symptom scores 16.3 and 15.4 and 41 percent more')), { ...s, citations: s.citations.map(c => ({ ...c })) });
  assert.equal(good.status, 'verified');
  const bad = await verifyEntry(withYear(s, fakeFetch('no figures here')), s);
  assert.equal(bad.status, 'failed');
  assert.match(Object.values(bad.citations).map(c => c.reason).join(' '), /figure not in abstract/);
  assert.ok(similarity('Placebo and Nocebo Effects', 'placebo & nocebo effects') > 0.8);
});
test('an unverified synthesis is never in the generated module and a verified one is, with its benefit-cost result', () => {
  const none = JSON.parse(genModule({ entries: {} }, SYNTHESES).split('SYNTHESES_PUBLISHED = ')[1].replace(/;\s*$/, ''));
  assert.equal(none.published.length, 0); assert.equal(none.pending.length, SYNTHESES.length);
  const one = SYNTHESES[0].id, ok = JSON.parse(genModule({ at: 't', entries: { [one]: { status: 'verified', citations: {}, novelty: [], checked_at: 't' } } }, SYNTHESES).split('SYNTHESES_PUBLISHED = ')[1].replace(/;\s*$/, ''));
  assert.deepEqual(ok.published.map(s => s.id), [one]); assert.ok(ok.published[0].bca.wellby_per_1000_usd);
});
test('the committed generated module matches the committed verification record', () => {
  const L = existsSync(LEDGER) ? JSON.parse(readFileSync(LEDGER, 'utf8')) : { entries: {} };
  assert.equal(readFileSync(new URL('../worker/src/syntheses.gen.js', import.meta.url), 'utf8'), genModule(L));
});

import { validateCandidate, sanitize, modelAccepted, discover } from '../tools/discover.mjs';
const good = () => { const s = structuredClone(SYNTHESES[1]); s.id = 'candidate-one'; s.citations = s.citations.map(c => ({ ...c, numbers: [] })); return s; };
test('discovery: a model proposal must be structurally complete, checkable and honest about its assumptions', () => {
  assert.deepEqual(validateCandidate(good()), []);
  const noStop = { ...good(), first_test: 'Run a pilot in some clinics.' }; assert.ok(validateCandidate(noStop).some(e => /fails/.test(e)));
  const quoted = good(); quoted.citations[0].numbers = ['99']; assert.ok(validateCandidate(quoted).some(e => /quote figures/.test(e)));
  const fake = { ...good(), components: ['not-in-catalogue'] }; assert.ok(validateCandidate(fake).some(e => /catalogue/.test(e)));
  const c = sanitize(good()); assert.ok(c.model.nodes.every(n => n.grade === 'D' && /^assumption/.test(n.source))); assert.deepEqual(modelAccepted(c), []);
});
test('discovery: red team can veto, a surviving proposal is recorded for verification and nothing is published by this step', async () => {
  const answers = [JSON.stringify([good()]), JSON.stringify({ fatal: false, reasons: ['thin evidence on adherence'], closest_existing_work: 'none' })];
  const r = await discover({ ask: async () => answers.shift(), max: 1, prev: { entries: [], log: [] } });
  assert.equal(r.entries.length, 1); assert.equal(r.entries[0].discovered, true); assert.ok(r.entries[0].red_team.reasons.length);
  const veto = [JSON.stringify([good()]), JSON.stringify({ fatal: true, reasons: ['a trial already exists'] })];
  const r2 = await discover({ ask: async () => veto.shift(), max: 1, prev: { entries: [], log: [] } });
  assert.equal(r2.entries.length, 0); assert.match(r2.log.at(-1).event, /red team/);
  const none = await discover({ ask: async () => 'sorry', prev: { entries: [], log: [] } }); assert.equal(none.entries.length, 0);
});

import { titleMatch } from '../tools/synth.mjs';
test('title matching tolerates a dropped subtitle but not an unrelated title that merely contains the words', () => {
  assert.ok(titleMatch('Nonadherence to antihypertensive drugs', 'Nonadherence to antihypertensive drugs: A systematic review and meta-analysis'));
  assert.ok(titleMatch('Placebo and Nocebo Effects', 'Placebo & nocebo effects'));
  assert.ok(!titleMatch('Placebo and Nocebo Effects', 'Cultural influences on placebo and nocebo effects'));
});

import { groundPapers, proposePrompt } from '../tools/discover.mjs';
test('grounding: the model may cite only papers handed to it, and a proposal citing anything else is rejected', async () => {
  const f = async () => ({ ok: true, json: async () => ({ message: { items: [{ title: ['Real Trial of Something'], issued: { 'date-parts': [[2019]] } }] } }) });
  const papers = await groundPapers({ f, n: 1 }); assert.deepEqual(papers, [{ title: 'Real Trial of Something', year: 2019 }]);
  assert.match(proposePrompt(1, [], papers), /Real Trial of Something \(2019\)/);
  const bad = good(); bad.citations = bad.citations.map(c => ({ ...c, q: 'An Invented Paper', year: 2019 }));
  const r = await discover({ ask: async () => JSON.stringify([bad]), ground: async () => papers, max: 1, prev: { entries: [], log: [] } });
  assert.equal(r.entries.length, 0); assert.ok(r.log.some(l => /outside the verified list/.test(l.event)));
});

import { repairCitations } from '../tools/discover.mjs';
test('repair: a citation missing only its bookkeeping fields is completed, one missing substance is still rejected', async () => {
  const c = good(); c.citations = c.citations.map(x => ({ title: x.q, year: String(x.year), supports: x.supports }));
  const r = repairCitations(c); assert.deepEqual(validateCandidate(r), []);
  const bare = good(); bare.citations = bare.citations.map(x => ({ q: x.q, year: x.year })); assert.ok(validateCandidate(repairCitations(bare)).some(e => /citations/.test(e)));
});
