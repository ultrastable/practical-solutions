import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { makeDb } from '../vendor/ultrastable/core/_shared/testdb.js';
import { submit, approve, dispatch } from '../vendor/ultrastable/core/outreach/index.js';
import { FOOTER } from '../worker/src/publish.js';
import { SOLUTIONS } from '../worker/src/solutions.js';
import tenant from '../worker/src/tenant.js';

test('tenant serves feeds and permalinks through the vendored core feed', async () => {
  const m = new Map();
  m.set('solutions', JSON.stringify(SOLUTIONS));
  m.set('changes', JSON.stringify([{ at: '2026-11-16T00:00:00Z', kind: 'verification', id: 'kmc', status: 'verified' }, { at: '2026-11-16T00:00:00Z', kind: 'brightspot_added', problem: 'under5', id: 'XYZ', title: 'Country X' }]));
  const env = { STATE: { get: async k => m.get(k) ?? null, put: async (k, v) => { m.set(k, v); } } };
  const get = p => tenant.fetch(new Request('https://t.example' + p), env);
  const rss = await (await get('/feed.xml')).text();
  assert.match(rss, /Evidence check: kmc is verified/); assert.match(rss, /New bright spot for under5: Country X/);
  assert.equal((await (await get('/feed.json')).json()).items.length, 2);
  const page = await (await get('/solutions/kmc')).text();
  assert.match(page, /kangaroo/i); assert.ok(page.includes(FOOTER.slice(0, 30)));
  assert.equal((await get('/solutions/nope')).status, 404);
});

test('the vendored core outreach, configured with this tenant\'s footer, stays a dry run until approved and carries the disclosure', async () => {
  const dir = fileURLToPath(new URL('../vendor/ultrastable/core/outreach/migrations/', import.meta.url));
  const ctx = { db: makeDb([dir]), now: () => Date.parse('2026-11-16T12:00:00Z'), config: { sender: { name: 'Operator', postal: '1 Example St', reply_to: 'hello@example.org' }, footer: FOOTER } };
  await submit(ctx, { tenant: 'ps', id: '1', to: 'a@example.org', subject: 's', body: 'b', evidence_url: 'https://example.org/e' });
  assert.deepEqual(await dispatch(ctx), []);
  await approve(ctx, '1', 'a person');
  assert.deepEqual(await dispatch(ctx), [{ id: '1', result: 'dry_run' }]);
  const { text } = await ctx.db.prepare('SELECT text FROM outreach_log').first();
  assert.ok(text.includes('generated and fact-checked automatically'));
});
