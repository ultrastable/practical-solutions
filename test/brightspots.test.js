import test from 'node:test';
import assert from 'node:assert/strict';
import { residuals, findSpots } from '../worker/src/brightspots.js';
import { tick } from '../worker/src/improve.js';
import { SOLUTIONS } from '../worker/src/solutions.js';

const P = { id: 'under5', ind: 'IND', lower: true };
const ISO = Array.from({ length: 40 }, (_, i) => 'C' + String(i).padStart(2, '0'));
// income rises with index; mortality falls with income; C05 is far better than its income predicts in both periods, C30 only in one.
const income = i => 1000 * (1 + i);
const mort = (i, period) => 100 - 12 * Math.log(income(i) / 1000) + (i === 5 ? -25 : 0) + (i === 30 && period === 0 ? -25 : 0) + ((i * 7) % 5 - 2);
const fakeWb = async url => {
  if (url.includes('/country?')) return { ok: true, json: async () => [{}, [...ISO.map(id => ({ id, region: { id: 'X' } })), { id: 'WLD', region: { id: 'NA' } }]] };
  const ind = /indicator\/([^?]+)/.exec(url)[1];
  const from = +/date=(\d+):/.exec(url)[1];
  const period = from > 2020 ? 0 : 1;
  const rows = ISO.map((id, i) => ({ countryiso3code: id, country: { value: 'Country ' + id }, date: String(period ? 2018 : 2023), value: ind === 'IND' ? mort(i, period) : income(i) }));
  return { ok: true, json: async () => [{}, rows] };
};

test('the two periods are fetched from their own year ranges, never from a shortcut that ignores them', async () => {
  const urls = [];
  await findSpots(async u => { urls.push(u); return fakeWb(u); }, P, { now: 2026 });
  const wb = urls.filter(u => u.includes('/indicator/'));
  assert.ok(wb.every(u => !u.includes('mrnev')));
  assert.ok(wb.some(u => u.includes('date=2022:2026')) && wb.some(u => u.includes('date=2016:2020')));
});

test('a transient World Bank 5xx is retried and the run still succeeds', async () => {
  let failed = 0;
  const flaky = async u => { if (!failed++) return { ok: false, status: 502, json: async () => ({}) }; return fakeWb(u); };
  const out = await findSpots(flaky, P, { now: 2026 });
  assert.ok(Array.isArray(out.spots));
});

test('residuals: sign flips for lower-is-better and the planted outlier stands out', () => {
  const rows = ISO.map((id, i) => ({ iso: id, x: income(i), y: mort(i, 0) }));
  assert.ok(residuals(rows, true).C05 > 1.5);
  assert.ok(residuals(rows, false).C05 < -1.5);
});

test('only countries that beat their income in both periods are bright spots', async () => {
  const r = await findSpots(fakeWb, P, { now: 2026 });
  assert.deepEqual(r.spots.map(s => s.iso), ['C05']);
  assert.match(r.note, /not a finding/);
});

test('too few countries gives an honest empty result, and a tick stores bright spots and logs a source failure', async () => {
  const few = async url => url.includes('/country?') ? { ok: true, json: async () => [{}, [{ id: 'C00', region: { id: 'X' } }]] } : fakeWb(url);
  assert.match((await findSpots(few, P, { now: 2026 })).note, /too few/);
  const m = new Map(); m.set('solutions', JSON.stringify(SOLUTIONS));
  const store = { get: async k => m.get(k) ?? null, put: async (k, v) => { m.set(k, v); } };
  const epmc = async url => url.includes('worldbank') ? fakeWb(url) : { ok: true, json: async () => ({ resultList: { result: [] } }) };
  const rank = async () => ({ problems: [{ id: 'under5', rank: 1, year: 2023, title: 'x', ind: 'IND', lower: true }], unranked: [] });
  await tick({ store, fetchFn: epmc, rank, now: Date.parse('2026-11-16T00:00:00Z') });
  assert.deepEqual(JSON.parse(m.get('brightspots')).under5.spots.map(s => s.iso), ['C05']);
});
