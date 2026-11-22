import test from 'node:test';
import assert from 'node:assert/strict';
import tenant from '../worker/src/tenant.js';
import { SOLUTIONS } from '../worker/src/solutions.js';
import { SYNTHESES } from '../worker/src/syntheses-data.js';
import { DATES } from '../worker/src/content-dates.gen.js';

test('every solution and synthesis has a date (run node tools/content_dates.mjs when this fails)', () => {
  const missing = [...SOLUTIONS.map(s => 'solution:' + s.id), ...SYNTHESES.map(s => 'synthesis:' + s.id)].filter(id => !DATES[id]);
  assert.deepEqual(missing, []);
});

test('/content.json is a JSON Feed with a domain, kind and depth on every entry, newest first', async () => {
  const env = { STATE: { get: async () => null, put: async () => {} } };
  const r = await tenant.fetch(new Request('https://t.example/content.json'), env), f = await r.json();
  assert.equal(f.version, 'https://jsonfeed.org/version/1.1');
  assert.equal(f.items.length, SOLUTIONS.length + SYNTHESES.length);
  assert.ok(f.items.every(i => i._domain && i._kind && typeof i._depth === 'number' && i.date_published && i.url.startsWith('https://t.example/')));
  assert.ok(f.items.every((i, n, a) => !n || a[n - 1].date_published >= i.date_published));
});
