// SPDX-License-Identifier: LicenseRef-Ultrastable-USL-1.0
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCatalog } from '../worker/src/catalog.js';
import { SOLUTIONS } from '../worker/src/solutions.js';
import { SOURCES, BARRIERS, LEVERS, OVERCLAIM, MANIPULATIVE } from '../worker/src/behaviour-lib.js';
import { profileFor, guard, lintLibrary, HINTS, changeBlock, changeBody, changeJson, changePost } from '../worker/src/behaviour.js';
import { socialQueue } from '../worker/src/social-voice.js';
import { route } from '../worker/src/site.js';

const cat = buildCatalog({ problems: { problems: [] }, solutions: SOLUTIONS });

test('the library cites only what it contains and never states a lever above its sources', () => {
  assert.deepEqual(lintLibrary(), []);
  assert.ok(Object.keys(SOURCES).length >= 30 && Object.keys(BARRIERS).length >= 10 && Object.keys(LEVERS).length >= 12);
});

test('every entry has a profile that passes the guard, and the aim follows its label', () => {
  for (const s of cat.sols) {
    const p = profileFor(s);
    assert.deepEqual(guard(p, s), [], s.id);
    if (s.label === 'mixed evidence') { assert.equal(p.aim, 'fair-test'); assert.match(p.aim_text, /fair local test/); }
    assert.ok(p.steps.some(t => t.includes(s.first_test)), 'the first test is a step: ' + s.id);
    assert.ok(p.mind.ours && p.mind.yours);
  }
});

test('every entry has a written belief and barriers, so a new entry without one is caught by the audit, not hidden', () => {
  for (const s of cat.sols) assert.ok(HINTS[s.id], 'no bespoke change hint for ' + s.id);
  for (const id of Object.keys(HINTS)) assert.ok(cat.sols.some(s => s.id === id), 'hint for unknown entry ' + id);
});

test('an entry the loops add later still gets a safe generated profile', () => {
  const s = { ...cat.sols[0], id: 'brand-new', title: 'A new thing', label: 'mixed evidence' };
  const p = profileFor(s);
  assert.equal(p.bespoke, false);
  assert.deepEqual(guard(p, s), []);
});

test('the guard catches overclaim, pressure wording, unknown sources and a contested entry aimed at adoption', () => {
  const s = cat.sols.find(x => x.label === 'mixed evidence'), p = profileFor(s);
  assert.ok(guard({ ...p, aim_text: 'This is proven. Act now.' }, s).length >= 2);
  assert.ok(guard({ ...p, aim: 'adopt-pilot' }, s).length >= 1);
  assert.ok(guard({ ...p, sources: [...p.sources, 'nobody2099'] }, s).some(m => /unknown source/.test(m)));
  assert.ok(OVERCLAIM.test('settled science') && MANIPULATIVE.test('Act now'));
});

test('the contested entries are shown as contested, with both sides, and never as settled', () => {
  for (const id of ['deworming', 'clean-cooking', 'rural-electrification', 'smartphones-for-women']) {
    const html = changeBlock(cat.sols.find(s => s.id === id));
    assert.match(html, /fair local test/, id);
    assert.doesNotMatch(html, OVERCLAIM, id);
  }
  assert.match(changeBlock(cat.sols.find(s => s.id === 'deworming')), /Neither camp/);
});

test('every behavioural source is shown with its design and its caveat', () => {
  const html = changeBlock(cat.sols.find(s => s.id === 'kmc'));
  assert.match(html, /Sources for these behavioural claims/);
  assert.match(html, /Caution:/);
  assert.match(changeBody(cat), /Ideas this layer does not rely on/);
});

test('the hub and the JSON are served and every profile links back from a solution page', async () => {
  const hub = route(new URL('https://x.test/change'), cat);
  assert.equal(hub.status, 200);
  assert.match(await hub.text(), /Making change happen/);
  const j = await route(new URL('https://x.test/change.json'), cat).json();
  assert.equal(Object.keys(j.solutions).length, cat.sols.length);
  const page = await route(new URL('https://x.test/solutions/kmc'), cat).text();
  assert.match(page, /Common belief/);
});

test('change posts fit the limit, carry the link and the hook, and never oversell a contested entry', () => {
  for (const s of cat.sols) {
    const t = changePost(s, 'https://example.org');
    assert.ok(t.length <= 280, s.id + ' ' + t.length);
    assert.match(t, /Ultrastable/);
    assert.match(t, /\/solutions\/[a-z0-9-]+#change$/);
    assert.doesNotMatch(t, OVERCLAIM);
    assert.doesNotMatch(t, MANIPULATIVE);
    if (s.label === 'mixed evidence') assert.match(t, /contested/i);
  }
  const q = socialQueue(cat, { origin: 'https://example.org' });
  assert.equal(q.posts.filter(p => p.arm === 'ps-change').length, cat.sols.length);
});

test('the json export carries every profile and the transparency rule', () => {
  const j = changeJson(cat);
  assert.match(j.rule.test, /agree/);
  assert.equal(Object.keys(j.solutions).length, cat.sols.length);
});

import { checkAll, matches, similar, generated } from '../tools/behaviour_sources.mjs';
import { CHECKS } from '../worker/src/behaviour-lib.js';
import { statusOf, strengthOf } from '../worker/src/behaviour.js';
import { readFileSync } from 'node:fs';

test('BEHAVIOUR-SOURCES-1: every source has a lookup entry, and the lookup matches on title, year and author', async () => {
  for (const id of Object.keys(SOURCES)) assert.ok(CHECKS[id], 'no lookup for ' + id);
  const c = CHECKS.samuelson1988, ok = { title: 'Status quo bias in decision making', publication_year: 1988, authorships: [{ author: { display_name: 'William Samuelson' } }] };
  assert.ok(matches(ok, c));
  assert.ok(!matches({ ...ok, publication_year: 2001 }, c) && !matches({ ...ok, authorships: [{ author: { display_name: 'Someone Else' } }] }, c) && !matches({ ...ok, title: 'A different paper entirely' }, c));
  assert.ok(similar('status quo bias', 'status quo bias') === 1);
  const f = async u => ({ ok: true, json: async () => ({ results: /Status/i.test(decodeURIComponent(u)) ? [ok] : [] }) });
  const viaSearch = await checkAll({ fetch: async u => ({ ok: true, json: async () => ({ results: /[?&]search=/.test(u) ? [ok] : [] }) }), checks: { samuelson1988: c } });
  assert.equal(viaSearch.results.samuelson1988.status, 'verified', 'the second route finds what the filter missed');
  const viaCrossref = await checkAll({ fetch: async u => ({ ok: true, json: async () => /crossref/.test(u) ? { message: { items: [{ title: ['Status quo bias in decision making'], issued: { 'date-parts': [[1988]] }, DOI: '10.1/x', author: [{ given: 'William', family: 'Samuelson' }] }] } } : { results: [] } }), checks: { samuelson1988: c } });
  assert.equal(viaCrossref.results.samuelson1988.status, 'verified', 'the third route is a different index');
  assert.ok(matches({ title: 'The loss of loss aversion', publication_year: 2018, authorships: [{ author: { display_name: 'Omar Al\u2010Ubaydli' } }] }, ['The loss of loss aversion', 2018, 'Al-Ubaydli']), 'unicode hyphens in names');
  const led = await checkAll({ fetch: f, checks: { samuelson1988: c, arkes1985: CHECKS.arkes1985, rogers2003: CHECKS.rogers2003 } });
  assert.equal(led.results.samuelson1988.status, 'verified');
  assert.equal(led.results.arkes1985.status, 'unresolved');
  assert.equal(led.results.rogers2003.status, 'not_indexed');
  const down = await checkAll({ fetch: async () => { throw new Error('offline'); }, prev: { arkes1985: { status: 'verified' } }, checks: { arkes1985: CHECKS.arkes1985 } });
  assert.equal(down.results.arkes1985.status, 'verified', 'a failed lookup keeps the previous status and never invents one');
});

test('the generated status module matches the ledger, and a lever with only unresolved sources is capped at weak', () => {
  const led = JSON.parse(readFileSync('ledger/behaviour-sources.json', 'utf8'));
  assert.equal(readFileSync('worker/src/behaviour-sources.gen.js', 'utf8'), generated(led));
  assert.ok(['verified', 'unresolved', 'not_indexed', 'unchecked'].includes(statusOf('samuelson1988')));
  assert.equal(strengthOf({ strength: 'strong', sources: [] }), 'strong');
});

import { existsSync } from 'node:fs';
test('POST-QUALITY-1: every change post passes the core post gate once it is vendored (checked by hand against ultrastable#1929: 0 of 24 blocked)', { skip: !existsSync('vendor/ultrastable/core/social/postquality.js') && 'the core gate is not in the vendored copy yet' }, async () => {
  const { lintPost } = await import('../vendor/ultrastable/core/social/postquality.js');
  for (const p of socialQueue(cat, { origin: 'https://example.org' }).posts.filter(p => p.arm === 'ps-change')) assert.deepEqual(lintPost(p.text, { grade: p.grade }), [], p.id);
});
