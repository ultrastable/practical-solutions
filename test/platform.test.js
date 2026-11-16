import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { toRss, toJsonFeed, itemsFrom } from '../platform/feed.js';
import { createOutbox } from '../platform/outbox.js';

const mem = () => { const m = new Map(); return { get: async k => m.get(k) ?? null, put: async (k, v) => { m.set(k, v); } }; };
const cfg = { sender: { name: 'Example Service', postal: '1 Example St, Town', reply_to: 'hello@example.org' }, footer: 'Generated and checked automatically.' };
const intent = (id, to) => ({ id, to, subject: 's', body: 'b', evidence_url: 'https://example.org/e' });

test('platform code names no tenant and imports nothing from tenant code', () => {
  for (const f of readdirSync('platform').filter(n => n.endsWith('.js'))) {
    const src = readFileSync(`platform/${f}`, 'utf8');
    assert.ok(!/from ['"]\.\.\/(ps|worker)\//.test(src), f);
    assert.ok(!/practical|tenant-ps|\bps_/i.test(src), f);
  }
});

test('feed renders escaped RSS and JSON Feed from described changes', () => {
  const items = itemsFrom([{ at: '2026-11-16T00:00:00Z', kind: 'verification', id: 'kmc', status: 'verified' }, { at: '2026-11-16T00:00:00Z', kind: 'skip' }],
    c => c.kind === 'verification' ? { title: 'a <b> & c', link: 'https://x/y', summary: c.status } : null);
  assert.equal(items.length, 1);
  const rss = toRss({ title: 't', link: 'https://x', description: 'd', items });
  assert.match(rss, /a &lt;b&gt; &amp; c/);
  assert.equal(toJsonFeed({ title: 't', link: 'https://x', feedUrl: 'https://x/feed.json', description: 'd', items }).items[0].url, 'https://x/y');
});

test('outbox: nothing sends unapproved; dry run without transport; footer and identity always present', async () => {
  const ob = createOutbox({ store: mem(), ...cfg });
  await ob.submit(intent('1', 'A@Example.com'));
  assert.deepEqual(await ob.dispatch(), []);
  await assert.rejects(ob.approve('1', 'agent:loop'), /human/);
  await ob.approve('1', 'rowan');
  assert.deepEqual(await ob.dispatch(), [{ id: '1', result: 'dry_run' }]);
  const text = ob.render({ body: 'b', evidence_url: 'https://example.org/e' });
  assert.match(text, /Generated and checked automatically/); assert.match(text, /1 Example St/); assert.match(text, /hello@example.org/);
  assert.deepEqual(await ob.dispatch(), []);
});

test('outbox: suppression is immediate and absolute; caps hold; evidence and identity required', async () => {
  const sent = [];
  const ob = createOutbox({ store: mem(), ...cfg, limits: { perDay: 1, perRecipient: 2 } });
  await ob.submit(intent('1', 'a@x.org')); await ob.approve('1', 'rowan');
  await ob.suppress('A@x.org');
  assert.deepEqual(await ob.dispatch({ transport: async m => sent.push(m) }), []);
  assert.equal((await ob.submit(intent('2', 'a@x.org'))).status, 'blocked_suppressed');
  await ob.submit(intent('3', 'b@x.org')); await ob.submit(intent('4', 'c@x.org')); await ob.approve('3', 'rowan'); await ob.approve('4', 'rowan');
  const r = await ob.dispatch({ transport: async m => sent.push(m) });
  assert.deepEqual(r.map(x => x.result).sort(), ['sent', 'skipped']);
  assert.equal(sent.length, 1);
  await assert.rejects(ob.submit({ ...intent('5', 'd@x.org'), evidence_url: 'http://no' }), /evidence/);
  assert.throws(() => createOutbox({ store: mem(), sender: { name: 'n' }, footer: 'f' }), /sender/);
  assert.throws(() => createOutbox({ store: mem(), sender: cfg.sender }), /footer/);
});

import { describeChange, solutionPage, FOOTER } from '../worker/src/publish.js';
import { SOLUTIONS } from '../worker/src/solutions.js';
import tenant from '../worker/src/tenant.js';

test('tenant serves feeds, permalinks and an honest outbox status', async () => {
  const m = new Map();
  m.set('solutions', JSON.stringify(SOLUTIONS));
  m.set('changes', JSON.stringify([{ at: '2026-11-16T00:00:00Z', kind: 'verification', id: 'kmc', status: 'verified' }]));
  const env = { STATE: { get: async k => m.get(k) ?? null, put: async (k, v) => { m.set(k, v); } } };
  const get = p => tenant.fetch(new Request('https://t.example' + p), env);
  const rss = await (await get('/feed.xml')).text();
  assert.match(rss, /Evidence check: kmc is verified/); assert.match(rss, /https:\/\/t\.example\/solutions\/kmc/);
  assert.equal((await (await get('/feed.json')).json()).items.length, 1);
  const page = await (await get('/solutions/kmc')).text();
  assert.match(page, /kangaroo/i); assert.ok(page.includes(FOOTER.slice(0, 30)));
  assert.equal((await get('/solutions/nope')).status, 404);
  assert.equal((await (await get('/outbox.json')).json()).configured, false);
  assert.ok(describeChange({ kind: 'unknown_kind' }, 'https://x') === null);
});
