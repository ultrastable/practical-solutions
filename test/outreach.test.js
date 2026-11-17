import test from 'node:test';
import assert from 'node:assert/strict';
import { makeDb } from '../vendor/ultrastable/core/_shared/testdb.js';
import { fileURLToPath } from 'node:url';
import agencies from '../org/agencies.json' with { type: 'json' };
import targeting from '../org/targeting.json' with { type: 'json' };
import { SOLUTIONS } from '../worker/src/solutions.js';
import { FOOTER } from '../worker/src/publish.js';
import { match, roleAddresses, plan, compose, graphView } from '../ps/outreach.js';
import { outreachStep, queue, approveIntent, discover } from '../ps/outreach_step.js';

const A = agencies.agencies;
const kmc = SOLUTIONS.find(s => s.id === 'kmc');

test('a solution maps to agencies whose mandate overlaps, with the reason named', () => {
  const m = match(kmc, A, targeting);
  assert.ok(m.length > 0 && m.every(x => x.agency.sectors.includes('health') && x.reason.includes('health')));
  assert.ok(!m.some(x => x.agency.id === 'ke-moe'), 'an education ministry is not a target for a newborn solution');
  const edu = match(SOLUTIONS.find(s => s.id === 'tarl'), A, targeting);
  assert.ok(edu.length && edu.every(x => x.agency.sectors.includes('education')));
});

test('only role addresses on the agency\'s own domain are kept; personal and foreign addresses are dropped', () => {
  const text = 'Write to info@moh.gov.gh or press@moh.gov.gh. Dr Kofi: kofi.mensah@moh.gov.gh. Partner: info@example.org, <a>Contact.Us@sub.moh.gov.gh</a>';
  assert.deepEqual(roleAddresses(text, 'moh.gov.gh', targeting).sort(), ['contact.us@sub.moh.gov.gh', 'info@moh.gov.gh', 'press@moh.gov.gh']);
});

test('the message is specific and evidence-linked, states limits and an opt-out, and makes no claim beyond the entry', () => {
  const c = compose(kmc, A[0], 'its mandate covers health', 'https://t.example');
  assert.equal(c.evidence_url, 'https://t.example/solutions/kmc');
  for (const must of [kmc.claim, kmc.first_test, kmc.limits, 'New England Journal of Medicine', '"stop"']) assert.ok(c.body.includes(must), must);
});

test('unverified solutions and agencies in cold-email-restricted countries are never planned', () => {
  const noVerif = SOLUTIONS.filter(s => /^not yet checked/.test(s.verified || ''));
  const p = plan({ solutions: SOLUTIONS, agencies: [...A, { id: 'de-bmg', name: 'X', country: 'DE', sectors: ['health'], level: 'national', domain: 'x.de', contact_page: 'https://x.de/c' }], contacts: {}, targeting, origin: 'https://t.example' });
  assert.ok(p.length > 0);
  assert.ok(p.every(x => !noVerif.some(s => s.id === x.solution_id)));
  assert.ok(!p.some(x => x.agency_id === 'de-bmg'));
});

test('graph view exposes agency nodes and solution to agency edges', () => {
  const g = graphView({ solutions: SOLUTIONS, agencies: A, targeting });
  assert.ok(g.nodes.every(n => n.kind === 'agency' && n.id.startsWith('agency:')));
  assert.ok(g.edges.some(e => e.src === 'solution:kmc' && e.rel === 'implementable_by'));
});

async function fixture(env) {
  const dirs = ['../ps/migrations/', '../vendor/ultrastable/core/outreach/migrations/'].map(p => fileURLToPath(new URL(p, import.meta.url)));
  const db = makeDb(dirs);
  const pages = Object.fromEntries(A.map(a => [a.contact_page, `Contact ${a.name}: info@${a.domain}`]));
  const f = async url => ({ ok: url in pages, status: url in pages ? 200 : 404, text: async () => pages[url] });
  const step = outreachStep({ solutions: SOLUTIONS, fetch: f, env, footer: FOOTER, origin: 'https://t.example' });
  const ctx = { now: Date.parse('2026-11-17T12:00:00Z'), nowIso: '2026-11-17 12:00:00', notes: [] };
  return { db, step, ctx };
}

test('without operator identity the step only previews; nothing enters core', async () => {
  const env = {};
  const { db, step, ctx } = await fixture(env);
  for (let i = 0; i < 6; i++) await step.run(db, ctx);
  const q = await queue(db, env, ctx.now, FOOTER);
  assert.equal(q.configured, false); assert.equal(q.mode, 'dry_run');
  assert.ok(q.items.length > 0 && q.items.every(i => i.status === 'awaiting_operator_identity' || i.status === 'no_public_contact_address'));
  assert.equal((await db.prepare('SELECT COUNT(*) n FROM outreach_intents').first()).n, 0);
});

test('with identity but no transport, gated messages are auto-approved by delegation and only dry-run', async () => {
  const env = { OPERATOR_NAME: 'Op', OPERATOR_POSTAL: '1 Example St', OPERATOR_REPLY_TO: 'hello@example.org' };
  const { db, step, ctx } = await fixture(env);
  for (let i = 0; i < 6; i++) await step.run(db, ctx);
  const q = await queue(db, env, ctx.now, FOOTER);
  assert.ok(q.items.some(i => i.status === 'dry_run'));
  assert.equal((await db.prepare("SELECT approved_by FROM outreach_intents WHERE status='dry_run'").first()).approved_by, targeting.approver);
  assert.equal((await db.prepare("SELECT COUNT(*) n FROM outreach_log WHERE result='sent'").first()).n, 0);
});

test('a failing contact page is recorded, not thrown', async () => {
  const { db } = await fixture({});
  const r = await discover(db, { fetch: async () => { throw new Error('boom'); }, nowIso: 'x' });
  assert.ok(r.every(x => x.ok === false));
});

import { health } from '../ps/outreach.js';
import { recordEvent, metrics } from '../ps/outreach_step.js';

test('autonomous mode: with identity and a transport, gated messages send; caps hold; a complaint pauses everything and suppresses', async () => {
  const sent = [];
  const env = { OPERATOR_NAME: 'Op', OPERATOR_POSTAL: '1 Example St', OPERATOR_REPLY_TO: 'hello@example.org', EMAIL: { send: async m => { sent.push(m); } } };
  const { db, step, ctx } = await fixture(env);
  for (let i = 0; i < 6; i++) await step.run(db, ctx);
  assert.ok(sent.length > 0 && sent.length <= targeting.gates.per_day, 'daily cap');
  assert.equal(new Set(sent.map(m => m.to)).size, sent.length, 'one message per recipient');
  assert.ok(sent.every(m => m.text.includes('generated and fact-checked automatically') && m.text.includes('stop')));
  const id = (await db.prepare("SELECT id FROM outreach_intents WHERE status='sent'").first()).id;
  await recordEvent(db, 'complaint', id, 'spam', ctx.nowIso);
  assert.equal((await metrics(db)).paused, true);
  const before = sent.length; ctx.now += 864e5 * 2;
  for (let i = 0; i < 3; i++) await step.run(db, ctx);
  assert.equal(sent.length, before, 'paused: nothing more sent');
});

test('health gate pauses on a bounce rate above the limit once the sample is large enough', () => {
  const ev = [...Array(20).fill({ kind: 'sent' }), { kind: 'bounce' }, { kind: 'bounce' }];
  assert.equal(health(ev, targeting).paused, true);
  assert.equal(health(ev.slice(0, 21), targeting).paused, false);
});

import { handleInbound } from '../ps/outreach_step.js';
import tenant from '../worker/src/tenant.js';
test('inbound mail is stored and acted on: opt-out suppresses, bounce counts, reply is recorded', async () => {
  const env = { OPERATOR_NAME: 'Op', OPERATOR_POSTAL: '1 Example St' };
  const { db, step, ctx } = await fixture(env);
  for (let i = 0; i < 4; i++) await step.run(db, ctx);
  const to = (await db.prepare('SELECT to_addr FROM outreach_intents LIMIT 1').first()).to_addr;
  assert.equal(await handleInbound(db, { from: `Desk <${to}>`, subject: 'Re: evidence', text: 'Please stop contacting us' }, ctx.nowIso), 'optout');
  assert.ok(await db.prepare('SELECT 1 x FROM outreach_suppressed WHERE addr=?').bind(to).first());
  assert.equal(await handleInbound(db, { from: 'mailer-daemon@x.org', subject: 'Undelivered Mail Returned', text: '' }, ctx.nowIso), 'bounce');
  assert.equal(await handleInbound(db, { from: 'someone@x.org', subject: 'Interesting', text: 'We would like to pilot this' }, ctx.nowIso), 'reply');
  assert.equal((await db.prepare("SELECT COUNT(*) n FROM ps_outreach_inbox").first()).n, 3);
});

test('the tenant schedule also runs the backend tick through the CORE service binding', async () => {
  const calls = [];
  const env = { STATE: { get: async () => null, put: async () => {} }, CORE: { fetch: async (u, init) => { calls.push([u, init.method, init.headers['x-ps-internal']]); return new Response('{}'); } } };
  const waits = [];
  await tenant.scheduled({}, env, { waitUntil: p => waits.push(p) });
  await Promise.allSettled(waits);
  assert.deepEqual(calls, [['https://core.internal/internal/tick', 'POST', '1']]);
});
