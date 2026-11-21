// SPDX-License-Identifier: LicenseRef-Ultrastable-USL-1.0
// Copyright (c) 2026 Rowan Brad Quni-Gudzinas. Non-commercial use free; commercial use requires a license. See LICENSE.
import test from 'node:test';
import assert from 'node:assert/strict';
import { postsFor } from '../ps/voice.js';
import { SOLUTIONS } from '../worker/src/solutions.js';
import { compose } from '../vendor/ultrastable/core/promote/index.js';

test('posts follow the hierarchy, sound human, end on a question, carry the disclosure and fit each channel', () => {
  const posts = postsFor(SOLUTIONS, 'https://o.example');
  const kinds = posts.map(p => p.id.split(':')[0]);
  assert.ok(kinds.indexOf('problem') > kinds.lastIndexOf('domain'));
  assert.ok(kinds.indexOf('solution') > kinds.lastIndexOf('problem'));
  assert.ok(posts.some(p => p.id === 'domain:water' && p.url === 'https://o.example/domains/water'));
  assert.equal(new Set(posts.map(p => p.id)).size, posts.length);
  const robot = /\b(leverag\w*|delve|unlock|game.?changer|in today's world|exciting news|we are pleased)\b/i;
  for (const p of posts) {
    assert.doesNotMatch(p.title + ' ' + p.summary, robot, p.id);
    assert.match(p.summary, /\?$/, p.id + ' should end on a question');
    for (const [ch, max] of [['bluesky', 300], ['mastodon', 500]]) {
      const t = compose(ch, p, {}, { promote: { automatedLabel: 'Posted by Ultrastable, source-checked' } });
      assert.ok(t.length <= max, `${ch} ${p.id} ${t.length}`);
      assert.ok(t.includes(p.url) && t.includes('Posted by Ultrastable'), `${ch} ${p.id}`);
      assert.match(t.split('\n')[0], /\?$/, `${ch} ${p.id} was cut off: ${t}`);
    }
  }
});

test('a new domain gets announced with no hand-written entry', () => {
  const posts = postsFor([], 'https://o.example', [{ id: 'seeds', title: 'Lost seed stock', domain: 'Farming', target_src: 'a target' }]);
  assert.equal(posts[0].id, 'domain:farming');
  assert.match(posts[0].title + posts[0].summary, /Farming/);
});
