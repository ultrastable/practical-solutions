import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGraph, questionsFor, unsolvedProblemIds, RULES } from '../worker/src/graph.js';
import { SOLUTIONS } from '../worker/src/solutions.js';
import { PROBLEMS } from '../worker/src/problems.js';
import { tick } from '../worker/src/improve.js';

const AG = { nodes: [{ id: 'agency:gh-moh', kind: 'agency', name: 'Ministry of Health, Ghana', country: 'GH', sectors: ['health'], level: 'national', url: 'https://moh.gov.gh/contact' }],
  edges: [{ src: 'solution:kmc', rel: 'implementable_by', dst: 'agency:gh-moh', why: 'newborn programmes' }, { src: 'solution:nope', rel: 'implementable_by', dst: 'agency:gh-moh', why: 'x' }] };

test('TB has no solution, so the graph asks for one; a solved problem does not', async () => {
  const open = await unsolvedProblemIds(SOLUTIONS);
  assert.ok(open.includes('tb')); assert.ok(!open.includes('neonatal'));
});

test('every graph fact carries provenance and agency edges stay proposed leads', async () => {
  const g = await buildGraph({ solutions: SOLUTIONS, agencies: AG });
  assert.deepEqual(await g.validate(), []);
  assert.equal((await g.edges({ rel: 'implementable_by' })).length, 0);
  assert.equal((await g.edges({ rel: 'implementable_by', status: 'proposed' })).length, 1);
  const qs = await questionsFor(g);
  assert.ok(qs.some(q => q.id === 'unsolved:problem:tb'));
  assert.ok(qs.some(q => q.id === 'unadopted:solution:kmc'));
  assert.equal(RULES.length, 2);
});

test('a tick stores the graph and its questions, and a problem with no solution joins the search rotation', async () => {
  const m = new Map(); const store = { get: async k => m.get(k) ?? null, put: async (k, v) => { m.set(k, v); } };
  await store.put('solutions', JSON.stringify(SOLUTIONS));
  const urls = [];
  const f = async u => { urls.push(String(u)); if (String(u).includes('/agencies.json')) return { ok: true, json: async () => AG }; return { ok: true, json: async () => ({ resultList: { result: [] } }) }; };
  const rank = async () => ({ basis: 'b', problems: [{ id: 'neonatal', rank: 1, year: 2023, title: 'n' }, { id: 'tb', rank: 9, year: 2023, title: 'TB' }], unranked: [] });
  await tick({ store, fetchFn: f, rank, now: Date.parse('2026-11-17T00:00:00Z') });
  const q = JSON.parse(await store.get('questions'));
  assert.ok(q.questions.some(x => x.subject === 'problem:tb'));
  assert.ok(JSON.parse(await store.get('graph')).nodes.some(n => n.id === 'agency:gh-moh'));
  assert.ok(JSON.parse(await store.get('candidates')).tb, 'TB was searched although it ranks outside the top');
});
