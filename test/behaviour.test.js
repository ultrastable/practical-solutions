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
