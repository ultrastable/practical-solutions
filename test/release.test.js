// SPDX-License-Identifier: LicenseRef-Ultrastable-USL-1.0
// Copyright (c) 2026 Rowan Brad Quni-Gudzinas. Non-commercial use free; commercial use requires a license. See LICENSE.
// RELEASE-1 and PROBLEM-INTAKE-1: releases are cut by rule, a quiet or late cadence heals itself, and a new problem is picked by measurement.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { inventory, decide, cut, generated, notes, problemDue, pickProblem, insertProblem, CONFIG, LEDGER, GEN, BANK } from '../tools/release.mjs';
import { PROBLEMS, shortfall } from '../worker/src/problems.js';
import { route } from '../worker/src/site.js';
import { freshness, RELEASE_GRACE_DAYS } from '../worker/src/freshness.js';

const inv0 = inventory({ problems: [{ id: 'p1', title: 'P one' }], solutions: [{ id: 's1', title: 'S one' }], syntheses: [], redteam: { bySubject: { s1: { findings: [{ challenge: 'c1' }] } } } });
const empty = { schema: 'ps-releases/1', known: {}, releases: [] };
const first = cut(empty, inv0, decide(empty, inv0, '2026-11-20T00:00:00Z'), '2026-11-20T00:00:00Z');

test('the first run releases the whole catalogue', () => {
  assert.equal(first.releases.length, 1); assert.equal(first.releases[0].version, '2026.11.20'); assert.equal(first.releases[0].first, true);
  assert.deepEqual(first.releases[0].totals, { problems: 1, solutions: 1, syntheses: 0, insights: 1 });
  assert.match(notes(first.releases[0]), /New problems \(1\):\n- P one/);
});
test('new entries wait for the minimum interval, then release with only what is new', () => {
  const inv = { ...inv0, solutions: { ...inv0.solutions, s2: 'S two' } };
  assert.equal(decide(first, inv, '2026-11-23T00:00:00Z').state, 'waiting');
  const d = decide(first, inv, '2026-11-27T00:00:00Z'); assert.equal(d.cut, true);
  const next = cut(first, inv, d, '2026-11-27T00:00:00Z').releases[1];
  assert.deepEqual(next.added.solutions, [{ id: 's2', title: 'S two' }]); assert.equal(next.added.problems.length, 0); assert.equal(next.totals.solutions, 2);
});
test('nothing new after a week dispatches the loops that make entries; three weeks is late', () => {
  assert.deepEqual(decide(first, inv0, '2026-11-22T00:00:00Z').heal, []);
  const quiet = decide(first, inv0, '2026-11-28T00:00:00Z'); assert.equal(quiet.state, 'nothing_new'); assert.deepEqual(quiet.heal, CONFIG.heal);
  const late = decide(first, inv0, '2026-12-20T00:00:00Z'); assert.equal(late.state, 'late'); assert.deepEqual(late.heal, CONFIG.heal);
});
test('a problem is taken in by the largest measured shortfall, never one already listed or unmeasured', () => {
  const bank = JSON.parse(readFileSync(BANK, 'utf8'));
  assert.equal(problemDue(first, bank, '2026-12-01T00:00:00Z'), false); assert.equal(problemDue(first, bank, '2026-12-19T00:00:00Z'), true);
  const m = [{ id: 'a', shortfall: 0.4 }, { id: 'b', shortfall: 0.7 }, { id: 'c', shortfall: null }, { id: 'd', shortfall: 0.9 }];
  assert.equal(pickProblem(bank, ['d'], m).id, 'b'); assert.equal(pickProblem(bank, [], [{ id: 'c', shortfall: null }]), null);
  for (const c of bank.candidates) {
    assert.ok(!PROBLEMS.some(p => p.id === c.id) || PROBLEMS.some(p => p.ind === c.ind), 'a bank id may match the catalogue only after its own intake: ' + c.id);
    assert.ok(c.target_src && c.unit && typeof c.lower === 'boolean' && (c.target != null || (c.target_from && c.factor)), 'candidate is complete: ' + c.id);
    assert.ok(shortfall(c, 50, 60).shortfall != null);
  }
});
test('an inserted problem is valid source the catalogue loads', async () => {
  const src = insertProblem(readFileSync('worker/src/problems.js', 'utf8'), { id: 'x-test', title: "Tester's problem", domain: 'Food', ind: 'X.Y', unit: '%', lower: true, target: 3, target_src: 'test' });
  const m = await import('data:text/javascript,' + encodeURIComponent(src));
  assert.equal(m.PROBLEMS.length, PROBLEMS.length + 1); assert.equal(m.PROBLEMS.at(-1).title, "Tester's problem");
});
test('the generated module matches the ledger, and the site serves it', async () => {
  const ledger = JSON.parse(readFileSync(LEDGER, 'utf8'));
  assert.equal(readFileSync(GEN, 'utf8'), generated(ledger), 'run node tools/release.mjs');
  const j = await route(new URL('https://x/releases.json'), {}).json(); assert.equal(j.count, ledger.releases.length); assert.equal(j.releases[0].version, ledger.releases.at(-1).version);
  const html = await route(new URL('https://x/releases'), {}).text(); assert.match(html, new RegExp(j.releases[0].version.replace(/\./g, '\\.')));
  assert.match(await route(new URL('https://x/releases.atom'), {}).text(), /<feed xmlns="http:\/\/www.w3.org\/2005\/Atom">/);
});
test('a release loop that stopped is a measured failure', () => {
  const rel = { max_gap_days: 21, releases: [{ date: '2026-11-20' }] }, t = Date.parse('2026-11-20'), fresh = { at: new Date(t + 40 * 864e5).toISOString() };
  assert.equal(freshness(t + 864e5, { at: new Date(t).toISOString() }, rel).ok, true);
  assert.deepEqual(freshness(t + (21 + RELEASE_GRACE_DAYS + 1) * 864e5, { at: new Date(t + (21 + RELEASE_GRACE_DAYS + 1) * 864e5).toISOString() }, rel).stale, ['releases']);
  assert.deepEqual(freshness(Date.parse(fresh.at), fresh, { releases: [] }).stale, ['releases']);
});
test('both routes that start a release exist', () => {
  assert.match(readFileSync('.github/workflows/release.yml', 'utf8'), /cron: '41 6 \* \* 1'/);
  assert.match(readFileSync('.github/workflows/cycle.yml', 'utf8'), /gh workflow run release\.yml/);
});
