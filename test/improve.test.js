import test from 'node:test';
import assert from 'node:assert/strict';
import { tick, verifySolution } from '../worker/src/improve.js';
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
  assert.equal(Object.keys(JSON.parse(await store.get('verif'))).length, 4);
  assert.ok(JSON.parse(await store.get('changes')).length >= 4);
});

test('a failing source is recorded, not thrown', async () => {
  const store = mem();
  await store.put('solutions', JSON.stringify(SOLUTIONS));
  const bad = async () => ({ ok: false, status: 503, json: async () => ({}) });
  const r = await tick({ store, fetchFn: bad, rank, now: Date.now() });
  assert.ok(r.changes.some(c => c.kind === 'verification_error'));
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
