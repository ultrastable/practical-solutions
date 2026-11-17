// SPDX-License-Identifier: LicenseRef-Ultrastable-USL-1.0
// Copyright (c) 2026 Rowan Brad Quni-Gudzinas. Non-commercial use free; commercial use requires a license. See LICENSE.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCatalog } from '../worker/src/catalog.js';
import { SOLUTIONS } from '../worker/src/solutions.js';
import { route } from '../worker/src/site.js';
import { ignoranceTick, ignView, subjectsFrom } from '../worker/src/unknowns.js';

const mem = () => { const m = new Map(); return { get: async k => m.get(k) ?? null, put: async (k, v) => void m.set(k, v), delete: async k => void m.delete(k) }; };
const base = () => buildCatalog({ problems: null, solutions: SOLUTIONS });
const get = (c, p) => route(new URL('https://x' + p), c);

test('before the first run every entry says it has not been examined, and /unknowns says the first run has not happened', async () => {
  const c = base(); c.ign = null;
  assert.match(await get(c, '/solutions/kmc').text(), /has not yet been examined for what it does not know/);
  assert.match(await get(c, '/unknowns').text(), /first run has not happened yet/);
  assert.equal((await get(c, '/unknowns.json').json()).generated, false);
});

test('the tick maps the catalogue, red-teams the stalest entries, and the result shows on entries, /unknowns, /unknowns.json and /method', async () => {
  const store = mem(), c = base(), t = { v: Date.UTC(2026, 10, 17) };
  assert.ok(subjectsFrom(c).length > 10);
  const r = await ignoranceTick({ store, cat: c, now: () => t.v, budget: 3 });
  assert.equal(r.metrics.targets.length, 3); assert.ok(r.metrics.open > 20); assert.equal(r.metrics.audit.balanced, true);
  const c2 = base(); c2.ign = await ignView(store, () => t.v);
  const id = r.metrics.targets.find(x => c2.sols.some(s => s.id === x)) || c2.sols[0].id;
  const html = await get(c2, '/solutions/' + id).text();
  if (r.metrics.targets.includes(id)) assert.match(html, /Red team, inversion and pre-mortem/);
  assert.match(html, /What we do not know, and the red team/);
  assert.match(html, /What would change our mind/);
  const page = await get(c2, '/unknowns').text();
  for (const x of ['What we do not know', 'Known unknowns', 'New questions the loop generated', 'We do not know" is an acceptable answer', 'The books balance']) assert.ok(page.includes(x), x);
  const j = await get(c2, '/unknowns.json').json();
  assert.equal(j.generated, true); assert.equal(j.instrument.questions.length, 15); assert.ok(j.frontier.length > 0); assert.ok(j.entries[id]);
  assert.match(await get(c2, '/method').text(), /5b\. What we do not know/);
  assert.match(await get(c2, '/sitemap.xml').text(), /\/unknowns/);
});

test('every run is bounded, advances to entries not yet challenged, and findings never alter an entry claim', async () => {
  const store = mem(), c = base(), t = { v: Date.UTC(2026, 10, 17) }, claims = c.sols.map(s => s.claim);
  const a = await ignoranceTick({ store, cat: c, now: () => t.v, budget: 2 }); t.v += 864e5;
  const b = await ignoranceTick({ store, cat: c, now: () => t.v, budget: 2 });
  assert.ok(!b.metrics.targets.some(x => a.metrics.targets.includes(x)));
  assert.deepEqual(c.sols.map(s => s.claim), claims);
});
