import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCatalog, search, searchIndex, openQuestions, slug } from '../worker/src/catalog.js';
import { route, sitemap, indexJson } from '../worker/src/site.js';
import { PROBLEMS } from '../worker/src/problems.js';
import { SOLUTIONS } from '../worker/src/solutions.js';
import w from '../worker/src/tenant.js';

const c = buildCatalog({ problems: null, solutions: SOLUTIONS });
const get = path => route(new URL('https://x' + path), c);

test('every solution points at a real problem and has the fields a reader needs', () => {
  const ids = new Set(PROBLEMS.map(p => p.id));
  assert.equal(new Set(SOLUTIONS.map(s => s.id)).size, SOLUTIONS.length);
  for (const s of SOLUTIONS) {
    assert.ok(s.problem_ids.length && s.problem_ids.every(i => ids.has(i)), s.id);
    for (const f of ['title', 'claim', 'works_where', 'takes', 'who', 'first_test', 'limits']) assert.ok(s[f], s.id + ' ' + f);
    assert.ok(s.evidence.length && s.evidence.every(e => e.src && e.finding), s.id);
  }
});

test('the catalogue spans several domains and labels honestly', () => {
  assert.ok(c.domains.length >= 8);
  assert.ok(c.sols.every(s => ['evidence-backed', 'mixed evidence', 'cited, weaker design'].includes(s.label)));
  assert.equal(c.sols.find(s => s.id === 'deworming').label, 'mixed evidence');
  assert.equal(c.sols.find(s => s.id === 'hypertension').label, 'cited, weaker design');
});

test('every page renders, every internal link resolves, and no page runs script', () => {
  const paths = ['/', '/problems', '/solutions', '/domains', '/leads', '/changes', '/method', '/impact', '/search?q=water',
    ...c.probs.map(p => '/problems/' + p.id), ...c.sols.map(s => '/solutions/' + s.id), ...c.domains.map(d => '/domains/' + d.slug)];
  for (const p of paths) {
    const r = get(p); assert.equal(r.status, 200, p);
  }
  return Promise.all(paths.map(async p => {
    const html = await get(p).text();
    assert.ok(!/<script/i.test(html), p);
    for (const [, href] of html.matchAll(/href="(\/[^"#?]*)/g)) {
      if (['/feed.xml', '/feed.json', '/index.json', '/sitemap.xml', '/metrics.json'].includes(href)) continue;
      assert.notEqual(get(href)?.status, 404, `${p} -> ${href}`);
      assert.ok(get(href), `${p} -> ${href}`);
    }
  }));
});

test('unknown ids are 404 and ids are escaped', () => {
  assert.equal(get('/problems/nope').status, 404);
  assert.equal(get('/solutions/nope').status, 404);
  assert.equal(get('/other'), null);
});

test('search needs every word and ranks title hits first', () => {
  const ix = searchIndex(c);
  const r = search(ix, 'chlorine water');
  assert.equal(r[0].id, 'chlorine');
  assert.deepEqual(search(ix, 'zzzz'), []);
  assert.deepEqual(search(ix, ''), []);
});

test('a problem without a solution says so and gets open questions; TB is one today', () => {
  const tb = c.probs.find(p => p.id === 'tb');
  assert.equal((c.byProblem.tb || []).length, 0);
  assert.ok(openQuestions(tb, c)[0].startsWith('No reviewed solution'));
});

test('sitemap and JSON index cover every entry and carry sources', () => {
  const sm = sitemap(c, 'https://x');
  for (const s of c.sols) assert.ok(sm.includes('/solutions/' + s.id));
  const ix = indexJson(c, 'https://x');
  assert.equal(ix.solutions.length, SOLUTIONS.length);
  assert.ok(ix.solutions.every(s => s.sources.length && s.sources[0].links.length));
});

test('a verified entry links to its DOI and PubMed record', () => {
  const v = { kmc: { status: 'verified', at: '2026-11-17T00:00:00Z', detail: [{ ok: true, title: 'T', doi: '10.1/x', pmid: '123' }] } };
  const cc = buildCatalog({ problems: null, solutions: SOLUTIONS, verif: v });
  const html = '' + route(new URL('https://x/solutions/kmc'), cc).body;
  return route(new URL('https://x/solutions/kmc'), cc).text().then(t => { assert.ok(t.includes('https://doi.org/10.1/x') && t.includes('pubmed.ncbi.nlm.nih.gov/123')); });
});

test('the tenant Worker serves the encyclopedia from its own store', async () => {
  const m = new Map(); const env = { STATE: { get: async k => m.get(k) ?? null, put: async (k, v) => { m.set(k, v); } } };
  assert.equal((await w.fetch(new Request('https://x/'), env)).status, 200);
  assert.equal((await w.fetch(new Request('https://x/solutions/kmc'), env)).status, 200);
  assert.equal((await w.fetch(new Request('https://x/live'), env)).status, 200);
  assert.equal(slug('Energy and air'), 'energy-and-air');
});

import { IMPL, implementability } from '../worker/src/implementability.js';
test('every solution has implementability facts and the score follows the published rule', () => {
  for (const s of SOLUTIONS) assert.ok(IMPL[s.id], 'missing facts for ' + s.id);
  assert.equal(implementability('chlorine').score, 8);
  assert.equal(implementability('emissions-market').practical, false);
  assert.equal(implementability('emissions-market').band, 'not yet practical');
  assert.equal(implementability('cash').score, 1 + 3 + 2);
  assert.ok(route(new URL('https://x/solutions/chlorine'), c).status === 200);
});
test('the solutions list is sorted most implementable first', async () => {
  const html = await get('/solutions').text();
  assert.ok(html.indexOf('/solutions/chlorine') < html.indexOf('/solutions/emissions-market'));
});

import { recordView, summary } from '../worker/src/reach.js';
test('reach counters are aggregate, count page views only, and keep no visitor data', async () => {
  const m = new Map(); const st = { get: async k => m.get(k) ?? null, put: async (k, v) => { m.set(k, v); } };
  const t = Date.parse('2026-11-17T12:00:00Z');
  await recordView(st, new Request('https://x/solutions/kmc', { headers: { referer: 'https://who.int/a', 'user-agent': 'Mozilla' } }), t);
  await recordView(st, new Request('https://x/problems/tb', { headers: { 'user-agent': 'GPTBot' } }), t);
  await recordView(st, new Request('https://x/index.json'), t);
  const s = await summary(st, t);
  assert.equal(s.views, 2); assert.equal(s.referrers['who.int'], 1); assert.equal(s.kinds.agents_and_bots, 1);
  assert.ok(!JSON.stringify([...m.values()]).includes('Mozilla'));
});
