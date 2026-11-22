// SPDX-License-Identifier: LicenseRef-Ultrastable-USL-1.0
// Copyright (c) 2026 Rowan Brad Quni-Gudzinas. Non-commercial use free; commercial use requires a license. See LICENSE.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCatalog } from '../worker/src/catalog.js';
import { socialQueue, domainPost, META } from '../worker/src/social-voice.js';

const O = 'https://ultrastable.org', cat = buildCatalog({});
test('queue is hierarchy-ordered, unique, within limits and links only to the origin', () => {
  const q = socialQueue(cat, { origin: O, now: Date.UTC(2026, 10, 20) }).posts;
  assert.equal(new Set(q.map(p => p.id)).size, q.length);
  assert.equal(q[0].arm, 'meta-story');
  const arms = q.slice(1).map(p => p.arm), first = a => arms.indexOf(a);
  assert.ok(first('ps-domain') < first('ps-problem') && first('ps-problem') < first('ps-solution'));
  for (const p of q) { assert.ok(p.text.length <= 300, p.id + ' ' + p.text.length); assert.ok(p.text.includes(O + '/'), p.id); assert.ok(!/automated post|as an ai|delve|leverage/i.test(p.text), p.id); }
});
test('a recently changed solution jumps the queue', () => {
  const s = cat.sols[cat.sols.length - 1], q = socialQueue(cat, { origin: O, recent: new Set(['ps:solution:' + s.id]) }).posts;
  assert.equal(q[1].id, 'ps:solution:' + s.id); assert.equal(q[1].kind, 'event');
});
test('posts state only catalogue numbers', () => {
  const d = cat.domains[0]; const t = domainPost(d, O);
  assert.ok(t.includes(String(d.problems.length)) && t.includes(String(d.solutions.length)));
  assert.ok(META.every(m => m('').length < 280));
});

test('THOUGHT-1: every queued post names Ultrastable, so the domain reads as an example of what the system can do', async () => {
  const { socialQueue, HOOK } = await import('../worker/src/social-voice.js');
  const cat = { domains: [{ slug: 'water', name: 'Water', problems: [1], solutions: [1, 2] }], probs: [{ id: 'p1', title: 'Unsafe water', ranked: true, value: 2.1, unit: 'billion people', year: 2024, target: 0 }], sols: [{ id: 's1', title: 'Chlorine dispensers', claim: 'Dispensers at the water point raise chlorination.', label: 'evidence-backed' }] };
  const q = socialQueue(cat, { origin: 'https://ultrastable.org', now: Date.parse('2026-11-21T00:00:00Z') });
  for (const p of q.posts) { assert.match(p.text, /Ultrastable/, p.id); assert.ok(p.text.length <= 280, p.id + ' ' + p.text.length); }
  assert.ok(q.posts.some(p => p.text.includes(HOOK)));
});

test('POST-QUALITY-1: no post trails off, has one link, and wording matches the evidence grade', async () => {
  const { solutionPost, solutionLong } = await import('../worker/src/social-voice.js');
  const base = { id: 'deworming', title: 'School-based deworming (evidence is contested)', claim: 'An influential trial found that treating schoolchildren for worms raised school attendance, but a later Cochrane review found little effect on growth, school performance or survival for mass treatment.', evidence: [] };
  const t = solutionPost({ ...base, label: 'mixed evidence' }, O);
  assert.doesNotMatch(t, /…|\.\.\.|something that works/i);
  assert.equal((t.match(/https?:\/\//g) || []).length, 1);
  assert.match(t, /contested/i); assert.ok(t.length <= 280);
  assert.match(solutionLong({ ...base, label: 'mixed evidence' }, O), /Cochrane review found little effect/);
  for (const p of socialQueue(cat, { origin: O }).posts) { assert.doesNotMatch(p.text, /…|\.\.\./, p.id); assert.equal((p.text.match(/https?:\/\//g) || []).length, 1, p.id); assert.match(p.text, /[.!?:]\n?https?:\/\/\S+$/, p.id); }
});
