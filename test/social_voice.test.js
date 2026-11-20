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
