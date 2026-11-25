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

// PHONE-OVERFLOW-1: at 360 px every page scrolled sideways by 9-11 px (5 px on the live site) because the one-line phone nav (four links + More,
// flex-wrap:nowrap) could not shrink below its text width and pushed the header past the screen. The browser check is tools/mobile_layout.mjs
// (every page at 360 and 390 px, run by the CI mobile job); this test keeps the CSS that makes the row fit and the CI wiring that runs it.
import { css } from '../worker/src/kit/tokens.js';
import { readFileSync } from 'node:fs';
test('phone nav row can shrink to the screen, and the CI browser sweep checks every page at 360 px', () => {
  const s = css(), phone = s.slice(s.indexOf('@media(max-width:40rem)'));
  assert.match(phone, /\.site-h nav\{[^}]*min-width:0/, 'the nav may be narrower than its content');
  assert.match(phone, /\.nav>li\{[^}]*min-width:0[^}]*flex:0 1 auto/, 'nav items shrink instead of overflowing');
  assert.match(phone, /\.nav a,\.more summary\{[^}]*padding:[^;}]*clamp\([^}]*font-size:clamp\(/, 'padding and type scale with the viewport');
  const tool = readFileSync(new URL('../tools/mobile_layout.mjs', import.meta.url), 'utf8');
  assert.match(tool, /SWEEP_WIDTHS = \[360, 390\]/); assert.match(tool, /sitemapPaths\(c\)/); assert.match(tool, /web\.fetch\(/);
  assert.match(readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8'), /node --no-warnings tools\/mobile_layout\.mjs/);
});
