// SPDX-License-Identifier: LicenseRef-Ultrastable-USL-1.0
// Copyright (c) 2026 Rowan Brad Quni-Gudzinas. Non-commercial use free; commercial use requires a license. See LICENSE.
// ISSUE-LOOP-1: a bright-spot issue never waits open; it carries its prediction's disposition and later its verdict.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { planIssues, titleFor, AWAITING } from '../ps/issues.js';

const brief = { file: 'child-survival-SLB.md', id: 'child-survival:SLB:x' };
const pred = { id: 'pred:child-survival:SLB:x', brief_id: brief.id, metric: 'ps_residual_z', op: '>=', target: 1, due_at: '2026-12-13 19:57:12', verdict: null, observed: null, scored_at: null };
const scored = { ...pred, verdict: 'hit', observed: 2.1, scored_at: '2026-12-14 03:17:00' };
const issue = (state, labels = ['bright-spot']) => ({ number: 1, title: titleFor(brief.file), state, labels: labels.map(name => ({ name })) });

test('a new brief is filed and closed in the same pass with its disposition', () => {
  const [a, ...rest] = planIssues([brief], [pred], []);
  assert.equal(a.op, 'create');
  assert.match(a.comment, /pred:child-survival:SLB:x/);
  assert.match(a.comment, /2026-12-13/);
  assert.deepEqual(a.add, [AWAITING]);
  assert.equal(rest.length, 0);
});

test('an open issue awaiting its verdict is closed, not left as a wait', () => {
  const [a] = planIssues([brief], [pred], [issue('OPEN')]);
  assert.equal(a.op, 'close');
  assert.match(a.comment, /Disposition/);
});

test('a scored prediction is commented once and labelled with its verdict', () => {
  const [a] = planIssues([brief], [scored], [issue('CLOSED', ['bright-spot', AWAITING])]);
  assert.equal(a.op, 'settle');
  assert.match(a.comment, /\*\*hit\*\*/);
  assert.deepEqual(a.add, ['verdict-hit']);
  assert.equal(a.close, false);
  assert.deepEqual(planIssues([brief], [scored], [issue('CLOSED', ['bright-spot', 'verdict-hit'])]), [], 'idempotent: settled issues need nothing');
});

test('a closed issue still waiting on its prediction needs nothing (idempotent)', () => {
  assert.deepEqual(planIssues([brief], [pred], [issue('CLOSED', ['bright-spot', AWAITING])]), []);
});

test('a brief with no prediction still gets a recorded disposition', () => {
  const [a] = planIssues([brief], [], [issue('OPEN')]);
  assert.match(a.comment, /no prediction is registered/);
});

test('the committed ledger: every published brief has a prediction to point its issue at', () => {
  const briefs = JSON.parse(readFileSync(new URL('../ledger/briefs/index.json', import.meta.url), 'utf8'));
  const db = new DatabaseSync(new URL('../ledger/ps.sqlite', import.meta.url).pathname, { readOnly: true });
  const ids = new Set(db.prepare('SELECT brief_id FROM ps_predictions').all().map(r => r.brief_id));
  for (const b of briefs) assert.ok(ids.has(b.id), `${b.id} has no prediction`);
  const plan = planIssues(briefs, db.prepare('SELECT * FROM ps_predictions').all(), briefs.map((b, i) => ({ number: i + 1, title: titleFor(b.file), state: 'OPEN', labels: [] })));
  assert.equal(plan.length, briefs.length);
  assert.ok(plan.every(a => a.op === 'close' || a.op === 'settle'));
});
