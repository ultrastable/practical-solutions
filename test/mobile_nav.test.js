// SPDX-License-Identifier: LicenseRef-Ultrastable-USL-1.0
// Copyright (c) 2026 Rowan Brad Quni-Gudzinas. Non-commercial use free; commercial use requires a license. See LICENSE.
// MOBILE-LAYOUT-1: the header keeps four primary items and puts the rest under a script-free "More" disclosure; every page is still reachable.
import test from 'node:test';
import assert from 'node:assert/strict';
import { SHELL } from '../worker/src/pages.js';
import { siteHeader, familyBar } from '../worker/src/kit/index.js';

test('header: primary items in the bar, the rest under More, nothing dropped', () => {
  const h = siteHeader({ brand: SHELL.brand, nav: SHELL.nav, current: '/graph' });
  const [bar, more] = h.split('<li class="more">');
  assert.equal([...bar.matchAll(/<li><a /g)].length, SHELL.nav.filter(n => n.primary).length);
  assert.ok(SHELL.nav.filter(n => n.primary).length <= 4);
  for (const n of SHELL.nav) assert.ok(h.includes(`href="${n.href}"`), n.href);
  assert.match(more, /<details data-current>/, 'the open section is marked when it sits under More');
  assert.ok(!/<script/i.test(h));
});

test('family bar: short text first, the rest tablet and up', () => {
  const f = familyBar(SHELL.family);
  assert.match(f, /<span>Ultrastable for good<span class="fam-x">: public-benefit/);
});
