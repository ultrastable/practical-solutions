import test from 'node:test';
import assert from 'node:assert/strict';
import { tick, verifySolution, extractDraft, reviewDraft } from '../worker/src/improve.js';
import { SOLUTIONS } from '../worker/src/solutions.js';

const mem = () => { const m = new Map(); return { get: async k => m.get(k) ?? null, put: async (k, v) => { m.set(k, v); }, m }; };
const epmcFake = rows => async () => ({ ok: true, json: async () => ({ resultList: { result: rows } }) });
const rank = async () => ({ basis: 'b', problems: [{ id: 'under5', rank: 1, year: 2023, title: 'x' }], unranked: [] });

test('verification confirms numbers present in the abstract, flags mismatch and not-found', async () => {
  const sol = { id: 's', checks: [{ q: 'q', year: 2022, numbers: ['0.88', '0.83'] }] };
  assert.equal((await verifySolution(epmcFake([{ title: 'T', abstractText: 'RR 0.88 (0.83 to 0.93)' }]), sol)).status, 'verified');
  assert.equal((await verifySolution(epmcFake([{ title: 'T', abstractText: 'RR 0.5' }]), sol)).status, 'mismatch');
  assert.equal((await verifySolution(epmcFake([]), sol)).status, 'not_found');
  assert.equal((await verifySolution(epmcFake([]), { id: 'n' })).status, 'no_check');
});

test('a tick refreshes problems, verifies stale solutions, finds candidates and logs changes', async () => {
  const store = mem();
  await store.put('solutions', JSON.stringify(SOLUTIONS));
  const f = epmcFake([{ title: 'Cochrane thing', pubYear: '2024', pmid: '1', abstractText: 'x 12.0 15.7 0.88 0.83 0.93 17 43.6 80.4' }]);
  const r1 = await tick({ store, fetchFn: f, rank, now: Date.parse('2026-11-16T00:00:00Z') });
  assert.ok(r1.changes.some(c => c.kind === 'verification' && c.status === 'verified'));
  const v = JSON.parse(await store.get('verif'));
  assert.ok(Object.keys(v).length >= 1 && Object.keys(v).length <= 3);
  assert.ok(JSON.parse(await store.get('candidates')).under5.items.length === 1);
  // a second tick one hour later checks the next solutions, not the same ones
  await tick({ store, fetchFn: f, rank, now: Date.parse('2026-11-16T01:00:00Z') });
  assert.equal(Object.keys(JSON.parse(await store.get('verif'))).length, Math.min(6, SOLUTIONS.filter(x => (x.checks || []).length).length));
  assert.ok(JSON.parse(await store.get('changes')).length >= 4);
});

test('a failing source is recorded, not thrown', async () => {
  const store = mem();
  await store.put('solutions', JSON.stringify(SOLUTIONS));
  const bad = async () => ({ ok: false, status: 503, json: async () => ({}) });
  const r = await tick({ store, fetchFn: bad, rank, now: Date.now() });
  assert.ok(!r.changes.some(c => /_error$/.test(c.kind)), 'errors stay out of the changes feed');
  assert.ok(r.errors.some(c => c.kind === 'verification_error'));
  assert.ok(!JSON.parse(await store.get('changes')).some(c => /_error$/.test(c.kind)));
  await tick({ store, fetchFn: bad, rank, now: Date.now() + 60000 });
  assert.equal((JSON.parse(await store.get('verif'))[SOLUTIONS.find(x => (x.checks || []).length).id] || {}).attempts, 1, 'a failed check is not retried before its backoff');
  const first = SOLUTIONS.find(x => (x.checks || []).length).id;
  assert.equal(JSON.parse(await store.get('errors')).find(e => e.kind === 'verification_error' && e.id === first).count, 1, 'the same failure is one row');
});

test('the tenant Worker serves data from its own store and never touches core', async () => {
  const { default: w } = await import('../worker/src/tenant.js');
  const store = mem();
  await store.put('solutions', JSON.stringify(SOLUTIONS));
  const env = { STATE: store };
  const s = await (await w.fetch(new Request('https://x/solutions.json'), env)).json();
  assert.equal(s.solutions.length, SOLUTIONS.length);
  assert.ok(s.solutions.every(x => !('checks' in x)));
  assert.equal((await w.fetch(new Request('https://x/'), env)).status, 200);
  assert.deepEqual(await (await w.fetch(new Request('https://x/candidates.json'), env)).json(), {});
  const src = (await import('node:fs')).readFileSync(new URL('../worker/src/tenant.js', import.meta.url), 'utf8');
  assert.ok(!/ultrastable-|env\.(DB|AI|AGENTS|SITE|DASHBOARD)/.test(src));
});

const ABS = "BACKGROUND: x. MAIN RESULTS: We included 19 trials. Vitamin A reduced all-cause mortality (risk ratio 0.88, 95% CI 0.83 to 0.93). AUTHORS' CONCLUSIONS: Supplementation probably reduces deaths. Effects vary by baseline deficiency.";

test('extraction is purely quotation and the reviewer passes it only when the abstract contains every quote', async () => {
  const d = extractDraft({ pmid: '9', title: 'T', year: '2022', abstract_full: ABS });
  assert.ok(d && d.quotes.results[0].includes('0.88') && d.numbers.includes('0.88'));
  assert.equal((await reviewDraft(epmcFake([{ abstractText: ABS }]), d)).pass, true);
  assert.equal((await reviewDraft(epmcFake([{ abstractText: ABS.replace('0.88', '0.99') }]), d)).pass, false);
  assert.equal((await reviewDraft(epmcFake([]), d)).pass, false);
  assert.equal(extractDraft({ pmid: '1', abstract_full: 'no sections here' }), null);
});

test('a tick turns a candidate into a reviewed draft', async () => {
  const store = mem();
  await store.put('solutions', '[]');
  const f = epmcFake([{ title: 'Review', pubYear: '2022', pmid: '9', abstractText: ABS }]);
  await tick({ store, fetchFn: f, rank, now: Date.parse('2026-11-16T00:00:00Z') });
  const drafts = JSON.parse(await store.get('drafts'));
  assert.equal(drafts['9'].status, 'reviewed');
});

test('an empty ranking is not kept for six hours, and the World Bank is called one request at a time', async () => {
  const store = mem();
  await store.put('solutions', '[]');
  await tick({ store, fetchFn: epmcFake([]), rank: async () => ({ basis: 'b', problems: [], unranked: [] }), now: Date.parse('2026-11-16T00:00:00Z') });
  let called = 0;
  await tick({ store, fetchFn: epmcFake([]), rank: async () => { called++; return { basis: 'b', problems: [{ id: 'under5', rank: 1, year: 2023, title: 'x' }], unranked: [] }; }, now: Date.parse('2026-11-16T00:30:00Z') });
  assert.equal(called, 1);
});

test('extraction handles Cochrane headings without colons and curly apostrophes, and skips protocols', async () => {
  const abs = "Rationale Why. Objectives To assess x. Main results We included 19 trials. Mortality was lower (risk ratio 0.88, 95% CI 0.83 to 0.93). Authors\u2019 conclusions Supplementation probably reduces deaths. Effects vary.";
  const d = extractDraft({ pmid: '5', title: 'T', abstract_full: abs });
  assert.ok(d, 'draft expected');
  assert.ok(d.quotes.results[0].includes('0.88'));
  assert.ok(d.quotes.conclusions[0].startsWith('Supplementation'));
  assert.equal((await reviewDraft(epmcFake([{ abstractText: abs }]), d)).pass, true);
  assert.equal(extractDraft({ pmid: '6', abstract_full: 'Objectives This is a protocol for a Cochrane Review. Main results 5%. Authors\u2019 conclusions x.' }), null);
});

test('economics entries are checked against OpenAlex abstracts rebuilt from the inverted index', async () => {
  const { oaAbstract } = await import('../worker/src/improve.js');
  assert.equal(oaAbstract({ lifted: [0], '194,000': [1], households: [2] }), 'lifted 194,000 households');
  let url = '';
  const oa = rows => async u => { url = u; return { ok: true, json: async () => ({ results: rows }) }; };
  const sol = { id: 'e', checks: [{ source: 'openalex', title: 'Women as Policy Makers', year: 2004, numbers: ['West Bengal'] }] };
  assert.equal((await verifySolution(oa([{ title: 'Women as Policy Makers', abstract_inverted_index: { 'West': [0], 'Bengal': [1] } }]), sol)).status, 'verified');
  assert.match(url, /api\.openalex\.org\/works\?search=Women.*publication_year:2004/);
  assert.equal((await verifySolution(oa([{ title: 'x', abstract_inverted_index: { India: [0] } }]), sol)).status, 'mismatch');
  for (const id of ['tarl', 'rural-electrification', 'mobile-money', 'women-leaders', 'graduation', 'emissions-market']) {
    const { SOLUTIONS: all } = await import('../worker/src/solutions.js');
    const { MORE } = await import('../worker/src/more-solutions.js').catch(() => ({}));
    const s = [...all, ...(MORE || [])].find(x => x.id === id);
    assert.ok(s && (s.checks || []).length, id + ' has a check');
  }
});

test('SOURCE-LADDER-1: OpenAlex 429 falls through to Semantic Scholar then Crossref; only a full failure is an error', async () => {
  const sol = { id: 'e', checks: [{ source: 'openalex', title: 'Women as Policy Makers', year: 2004, numbers: ['West Bengal'] }] };
  const seen = [];
  const ladder = (okHost, body) => async u => { seen.push(new URL(u).host); return u.includes(okHost) ? { ok: true, json: async () => body } : { ok: false, status: 429 }; };
  const s2 = { data: [{ title: 'Women as Policy Makers', year: 2004, abstract: 'in West Bengal and Rajasthan', externalIds: { DOI: '10.1/x' } }] };
  const r1 = await verifySolution(ladder('semanticscholar', s2), sol);
  assert.equal(r1.status, 'verified'); assert.equal(r1.detail[0].doi, '10.1/x');
  assert.deepEqual(seen, ['api.openalex.org', 'api.semanticscholar.org']);
  const cr = { message: { items: [{ title: ['Women as Policy Makers'], DOI: '10.2/y', abstract: '<jats:p>West Bengal villages</jats:p>' }] } };
  assert.equal((await verifySolution(ladder('crossref', cr), sol)).status, 'verified');
  await assert.rejects(() => verifySolution(async () => ({ ok: false, status: 429 }), sol), /HTTP 429/);
});
