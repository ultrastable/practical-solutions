// SPDX-License-Identifier: LicenseRef-Ultrastable-USL-1.0
// Copyright (c) 2026 Rowan Brad Quni-Gudzinas. Non-commercial use free; commercial use requires a license. See LICENSE.
// PROGRESS-1: a returning reader sees what is new, counted from the loop's recorded changes and the cut releases only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCatalog } from '../worker/src/catalog.js';
import { route } from '../worker/src/site.js';
import { changeCounts } from '../worker/src/pages.js';
import { SOLUTIONS } from '../worker/src/solutions.js';
import { RELEASES } from '../worker/src/releases.gen.js';

const at = h => new Date(Date.now() - h * 3600e3).toISOString();
const changes = [{ at: at(2), kind: 'entry_verified', id: 'recent-one' }, { at: at(100), kind: 'lead_found', id: 'this-week' }, { at: at(600), kind: 'ranking', id: 'this-month' }, { at: at(2000), kind: 'ranking', id: 'long-ago' }];
const c = buildCatalog({ problems: null, solutions: SOLUTIONS, changes });
const page = async p => (await route(new URL('https://t.example' + p), c)).text();

test('change counts per period come from the recorded changes', () => {
  assert.deepEqual(changeCounts(c), { day: 1, week: 2, month: 3 });
  assert.deepEqual(changeCounts(buildCatalog({ problems: null, solutions: SOLUTIONS })), { day: 0, week: 0, month: 0 });
});

test('/changes filters by period with plain links, and says so when a period is empty', async () => {
  const all = await page('/changes'), day = await page('/changes?since=day'), week = await page('/changes?since=week');
  assert.match(all, /long-ago/);
  assert.match(all, /last 24 hours \(1\)/);
  assert.match(day, /recent-one/);
  assert.doesNotMatch(day, /this-week/);
  assert.match(week, /this-week/);
  assert.doesNotMatch(week, /this-month/);
  assert.match(await page('/changes?since=never'), /long-ago/, 'an unknown period shows everything');
  const none = await (await route(new URL('https://t.example/changes?since=day'), buildCatalog({ problems: null, solutions: SOLUTIONS, changes: [changes[3]] }))).text();
  assert.match(none, /The loop recorded no change in the last 24 hours\./);
});

test('the home page states the newest release and the change counts, and links the feeds and the fleet progress page', async () => {
  const home = await page('/'), r = RELEASES.releases[0];
  assert.match(home, /id="new"/);
  assert.ok(home.includes(`/releases#r-${r.version}`));
  assert.match(home, /recorded 1 change\(s\) in the last 24 hours, 2 in the last 7 days and 3 in the last 30 days/);
  assert.match(home, /\/releases\.atom/);
  assert.match(home, /https:\/\/ultrastable\.io\/progress/);
});
