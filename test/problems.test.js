import test from 'node:test';
import assert from 'node:assert/strict';
import { PROBLEMS, shortfall, rankProblems } from '../worker/src/problems.js';
import { SOLUTIONS } from '../worker/src/solutions.js';

test('shortfall is zero past the target and bounded', () => {
  const p = PROBLEMS.find(x => x.id === 'under5');
  assert.equal(shortfall(p, 20).shortfall, 0);
  assert.ok(Math.abs(shortfall(p, 50).shortfall - 0.5) < 1e-9);
  const w = PROBLEMS.find(x => x.id === 'water');
  assert.ok(Math.abs(shortfall(w, 70).shortfall - 0.3) < 1e-9);
  const n = PROBLEMS.find(x => x.id === 'ncd');
  assert.ok(Math.abs(shortfall(n, 20, 18).shortfall - 0.4) < 1e-9);
});

test('rankProblems ranks by gap and reports what it could not rank', async () => {
  const values = { 'SH.DYN.MORT': 37, 'SI.POV.DDAY': 9, 'SH.H2O.SMDW.ZS': 73 };
  const fake = async url => {
    const ind = /indicator\/([^?]+)/.exec(url)[1];
    if (!(ind in values)) return { ok: true, json: async () => [{}, []] };
    return { ok: true, json: async () => [{}, [{ date: '2023', value: values[ind] }, { date: '2015', value: values[ind] }]] };
  };
  const r = await rankProblems(fake);
  assert.deepEqual(r.problems.map(x => x.id), ['poverty', 'under5', 'water']);
  assert.ok(r.problems.every((x, i, a) => i === 0 || a[i - 1].shortfall >= x.shortfall));
  assert.ok(r.unranked.length >= 8);
  assert.match(r.basis, /not deaths or DALYs/);
});

test('every solution maps to a known problem', () => {
  const ids = new Set(PROBLEMS.map(p => p.id));
  for (const s of SOLUTIONS) assert.ok(s.problem_ids.length && s.problem_ids.every(i => ids.has(i)), s.id);
});
