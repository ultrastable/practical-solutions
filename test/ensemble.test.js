// SPDX-License-Identifier: LicenseRef-Ultrastable-USL-1.0
// Copyright (c) 2026 Rowan Brad Quni-Gudzinas. Non-commercial use free; commercial use requires a license. See LICENSE.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ensembleRun, genModule, ledgerView, adjudicate, askPanel, candidates, effectiveVotes, mostCorrelatedVendor, reviewDecision, evidenceChecks } from '../ps/ensemble.js';
import { crossReview, vendorOfModel } from '../ps/review.js';
import { ENSEMBLE } from '../worker/src/ensemble-config.js';
import { allowed } from '../ps/scope.js';
import { ensembleBlock } from '../worker/src/ensemble-view.js';
import { configFor, RED_POOL } from '../worker/src/redteam-config.js';
import { runRedTeam } from '../tools/redteam.mjs';
import { route } from '../worker/src/site.js';
import { buildCatalog } from '../worker/src/catalog.js';
import { SOLUTIONS } from '../worker/src/solutions.js';

const NOW = Date.parse('2026-11-17T06:00:00Z'), TEXT = 'The trial found a 12 percent reduction in deaths among infants.';
const entries = [{ id: 'e1', title: 'Kangaroo care', claim: 'Old claim of about 10 percent here', limits: 'l', works_where: 'w', takes: 't', first_test: 'f' }];
const fileSrc = "x = { claim: 'Old claim of about 10 percent here' };";
const epmc = async () => ({ ok: true, json: async () => ({ resultList: { result: [{ id: '1', source: 'MED', title: 'T', pubYear: '2020', abstractText: TEXT }] } }) });
const PROPOSAL = { field: 'claim', new: 'A claim of a 12 percent reduction in infant deaths', source: 1, quote: TEXT, why: 'w' };
// verdicts by vendor; the proposer is whichever model answers the proposal prompt
const mk = (verdicts, proposal = PROPOSAL) => async (m, prompt) => {
  if (/Propose at most ONE/.test(prompt)) return { ok: true, model: m.model, text: JSON.stringify(proposal) };
  const v = verdicts[m.vendor] ?? verdicts.default; return v ? { ok: true, model: m.model, text: JSON.stringify({ verdict: v, reason: 'r' }) } : { ok: false, error: 'HTTP 500' };
};
const run = (ask, extra = {}) => ensembleRun({ ledger: {}, entries, fileSrc, fetch: epmc, ask, now: () => NOW, cfg: ENSEMBLE, seed: 1, ...extra });

test('unanimous support from other-vendor verifiers is accepted and recorded with every vote', async () => {
  const r = await run(mk({ default: 'supports' }));
  assert.equal(r.accepted.length, 1); const p = r.ledger.proposals[0];
  assert.equal(p.status, 'accepted'); assert.ok(p.votes.length >= 2); assert.ok(!p.votes.some(v => v.vendor === p.proposer.vendor), 'the proposer voted');
  assert.equal(new Set(p.votes.map(v => v.vendor)).size, p.votes.length); assert.ok(p.source.url.startsWith('https://europepmc.org/article/'));
});
test('one dissenting verifier makes it uncertain and nothing is applied', async () => {
  let n = 0; const base = mk({ default: 'supports' }), ask = async (m, p) => (/Propose at most ONE/.test(p) ? base(m, p) : (n++ === 1 ? { ok: true, model: m.model, text: '{"verdict":"contradicts","reason":"r"}' } : base(m, p)));
  const r = await run(ask); assert.equal(r.accepted.length, 0); assert.equal(r.ledger.proposals[0].status, 'uncertain'); assert.match(r.ledger.proposals[0].reason, /disagree/);
  const view = ledgerView(r.ledger); assert.equal(view.by_entry.e1[0].status, 'uncertain');
});
test('a model outage never applies a change', async () => {
  const r = await run(mk({ default: null })); assert.equal(r.accepted.length, 0); assert.equal(r.ledger.proposals[0].status, 'pending');
});
test('an invented quote or number is rejected before any model votes', async () => {
  let votes = 0; const base = mk({ default: 'supports' }, { ...PROPOSAL, quote: 'A sentence no abstract contains at all' }), ask = async (m, p) => { if (!/Propose at most ONE/.test(p)) votes++; return base(m, p); };
  const r = await run(ask); assert.equal(votes, 0); assert.equal(r.ledger.proposals[0].status, 'rejected'); assert.match(r.ledger.proposals[0].reason, /quote/);
  const r2 = await run(mk({ default: 'supports' }, { ...PROPOSAL, new: 'A claim of a 99 percent reduction in infant deaths' })); assert.match(r2.ledger.proposals[0].reason, /numbers not in the abstract/);
});
test('a model that substitutes another vendor cannot sit twice on a panel', async () => {
  const ask = async m => ({ ok: true, model: ENSEMBLE.pool[0].model, text: '{"verdict":"supports","reason":"r"}' }), r = await askPanel({ cands: candidates({ cfg: ENSEMBLE }), want: 3, ask, prompt: 'p', parse: t => JSON.parse(t), cfg: ENSEMBLE });
  assert.equal(r.got.length, 1, 'one vendor answered for every member, so one seat is filled');
});
test('effective votes are measured from verdicts and identical judges count as one', () => {
  const h = Array.from({ length: 12 }, (_, i) => ({ votes: { a: i % 3 ? 'supports' : 'contradicts', b: i % 3 ? 'supports' : 'contradicts', c: i % 2 ? 'supports' : 'contradicts' } }));
  const e = effectiveVotes(h); assert.ok(e.measured); assert.ok(e.pairs.find(p => p.a === 'a' && p.b === 'b').phi === 1); assert.ok(['a', 'b'].includes(mostCorrelatedVendor(e.pairs)));
  assert.equal(effectiveVotes(h.slice(0, 4)).measured, false);
});
test('a pool with a correlated pair benches the most correlated vendor', async () => {
  const history = Array.from({ length: 12 }, (_, i) => ({ id: 'h' + i, votes: { openai: i % 2 ? 'supports' : 'contradicts', meta: i % 2 ? 'supports' : 'contradicts' } }));
  const r = await run(mk({ default: 'supports' }), { ledger: { history } }); assert.ok(Object.keys(r.ledger.benched).length >= 1); assert.equal(r.ledger.metrics.measured, true);
});
test('the generated ledger module is exactly what the committed ledger says', () => {
  const L = JSON.parse(readFileSync(new URL('../ledger/ensemble.json', import.meta.url), 'utf8')); assert.equal(readFileSync(new URL('../worker/src/ensemble-ledger.gen.js', import.meta.url), 'utf8'), genModule(L));
});
test('disagreement shows on the entry page as uncertainty, applied changes show their record', () => {
  const L = { by_entry: { s: [{ status: 'uncertain', field: 'claim', source: { url: 'https://u', title: 'T' }, new: 'new wording', votes: [{ vendor: 'a', verdict: 'supports' }, { vendor: 'b', verdict: 'contradicts' }] }, { status: 'applied', field: 'limits', at: '2026-11-17T00:00:00Z', source: { url: 'https://u2', title: 'T2' }, old: 'old wording', proposer: 'c', votes: [{ vendor: 'a', verdict: 'supports' }] }] }, examined: {} };
  const h = ensembleBlock('s', L); assert.match(h, /Models disagree/); assert.match(h, /uncertain/); assert.match(h, /a supports, b contradicts/); assert.match(h, /Updated 2026-11-17/); assert.match(h, /old wording/);
  assert.match(ensembleBlock('none', { by_entry: {}, examined: {} }), /not yet been cross-checked/);
});
test('the entry page and /ensemble.json are served from the generated ledger', async () => {
  const cat = buildCatalog({ problems: null, solutions: SOLUTIONS }); const page = await route(new URL('https://x.test/solutions/' + SOLUTIONS[0].id), cat).text(); assert.match(page, /Cross-model check/);
  const j = await route(new URL('https://x.test/ensemble.json'), cat).json(); assert.ok('by_entry' in j && 'totals' in j);
});
test('code review: an other-vendor majority blocks, a single answer proceeds and the gap is recorded', async () => {
  assert.equal(vendorOfModel('openai/gpt-4.1'), 'openai'); assert.equal(vendorOfModel('@cf/meta/llama-3.3-70b-instruct-fp8-fast'), 'meta'); assert.equal(vendorOfModel('mistral-ai/x'), 'mistral');
  const seen = []; const rej = async m => { seen.push(m.vendor); return { ok: true, model: m.model, text: '{"verdict":"reject","reason":"bug"}' }; };
  const r = await crossReview({ title: 't', diff: 'd', authorModel: 'openai/gpt-4.1', ask: rej }); assert.equal(r.merge, false); assert.ok(!seen.includes('openai'), 'the author vendor reviewed its own change');
  const one = (() => { let n = 0; return async m => (n++ ? { ok: false, error: 'x' } : { ok: true, model: m.model, text: '{"verdict":"reject","reason":"bug"}' }); })();
  const r2 = await crossReview({ title: 't', diff: 'd', authorModel: 'openai/gpt-4.1', ask: one }); assert.equal(r2.merge, true); assert.equal(r2.gap, true);
  assert.equal(reviewDecision([{ verdict: 'approve' }, { verdict: 'approve' }, { verdict: 'reject' }]).merge, true);
});
test('the models cannot edit the rules that govern them', () => {
  for (const p of ['ps/ensemble.js', 'ps/review.js', 'ps/scope.js', 'worker/src/ensemble-config.js', 'worker/src/method-claims.js', 'worker/src/ensemble-ledger.gen.js']) assert.ok(!allowed(p), p);
  assert.ok(allowed('worker/src/solutions.js'));
});
test('the red team rotates through the pool and falls back to the next model when one is not served', async () => {
  assert.notEqual(configFor(0).ignorance.models.red.model, configFor(1).ignorance.models.red.model); assert.equal(configFor(RED_POOL.length).ignorance.models.red.model, configFor(0).ignorance.models.red.model);
  const used = []; const f = async (u, o) => { const m = JSON.parse(o.body).model; used.push(m); return used.length <= 4 ? { ok: false, status: 404 } : { ok: true, json: async () => ({ choices: [{ message: { content: '{"findings":[]}' } }] }) }; };
  await runRedTeam({ env: { GITHUB_TOKEN: 't' }, fetch: f, now: () => NOW, budget: 2 }); assert.ok(new Set(used).size >= 2, 'did not fall back to another model');
});
test('evidence checks need the editable field and an exactly-once match in the file', () => {
  const src = [{ url: 'u', title: 's', year: 1, text: TEXT }], p = { field: 'claim', source: 1, quote: TEXT, new: 'The trial found a 12 percent reduction in infant deaths' };
  assert.ok(evidenceChecks({ proposal: p, entry: entries[0], sources: src, fileSrc, cfg: ENSEMBLE }).ok); assert.ok(!evidenceChecks({ proposal: p, entry: entries[0], sources: src, fileSrc: 'nothing here', cfg: ENSEMBLE }).ok);
});

test('the red team falls back to Workers AI through the tenant model Worker when GitHub Models does not answer (#59)', async () => {
  const env = { GITHUB_TOKEN: 't', PS_LLM_URL: 'https://llm.example/ps/llm', ACTIONS_ID_TOKEN_REQUEST_URL: 'https://oidc.example/?x=1', ACTIONS_ID_TOKEN_REQUEST_TOKEN: 'r' };
  const f = async (url) => {
    const u = String(url);
    if (u.startsWith('https://oidc.example')) return { ok: true, status: 200, json: async () => ({ value: 'jwt' }), text: async () => '{"value":"jwt"}' };
    if (u.startsWith('https://llm.example')) { const body = { text: '{"findings":[{"pass":"inversion","q":"q","challenge":"What if the effect fades?","falsifier":"a follow-up","severity":"medium"}]}', model: 'llama' }; return { ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) }; }
    return { ok: true, status: 200, json: async () => { throw new SyntaxError('Unexpected token O'); }, text: async () => 'OK' };
  };
  const r = await runRedTeam({ env, fetch: f, now: () => NOW, budget: 1 });
  assert.equal(r.model, 'workers-ai (tenant model Worker)');
  assert.equal(Object.keys(r.bySubject).length, 1);
});

test('a 200 with a non-JSON body ("OK") is retried once and then reported plainly, never as a JSON parse error', async () => {
  const { askModel } = await import('../ps/llm.js');
  let n = 0;
  const f = async () => (++n, { ok: true, status: 200, text: async () => 'OK\r\n' });
  const r = await askModel({ fetch: f, secrets: { GITHUB_TOKEN: 't' }, spec: { route: 'github-models', model: 'm' }, prompt: 'p' });
  assert.equal(r.ok, false); assert.equal(n, 2); assert.match(r.error, /non-JSON body \(OK\)/);
  let k = 0;
  const g = async () => (++k === 1 ? { ok: true, status: 200, text: async () => 'OK' } : { ok: true, status: 200, text: async () => JSON.stringify({ choices: [{ message: { content: 'hi' } }] }) });
  const r2 = await askModel({ fetch: g, secrets: { GITHUB_TOKEN: 't' }, spec: { route: 'github-models', model: 'm' }, prompt: 'p' });
  assert.equal(r2.ok, true); assert.equal(r2.text, 'hi');
});
