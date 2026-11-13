// SPDX-License-Identifier: LicenseRef-Ultrastable-USL-1.0
// Copyright (c) 2026 Rowan Brad Quni-Gudzinas. Non-commercial use free; commercial use requires a license. See LICENSE.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { runCycle } from '../ps/cycle.js';

const PROBLEM = { id: 'synthetic-demo', title: 'Synthetic world with planted truth', refresh_days: 30, top_k: 5, boot: 60, source: { type: 'synthetic', seed: 11 } };

test('two cycles on persisted state append two records, keep the database, and publish with a changelog', async () => {
  const d = mkdtempSync(path.join(tmpdir(), 'ps-cycle-'));
  const o = { db: path.join(d, 'state.sqlite'), ledger: path.join(d, 'cycles.jsonl'), out: path.join(d, 'briefs'), n: 3, problems: [PROBLEM], env: {} };
  const a = await runCycle({ ...o, run: '1' });
  const b = await runCycle({ ...o, run: '2' });
  const lines = readFileSync(o.ledger, 'utf8').trim().split('\n').map(JSON.parse);
  assert.equal(lines.length, 2);
  assert.equal(a.fresh_state, true);
  assert.equal(b.fresh_state, false, 'the second cycle continues from the committed state');
  assert.ok(b.essential.before.active_items !== undefined && 'out_of_bounds' in b && Array.isArray(b.corrective_actions));
  assert.ok(existsSync(path.join(o.out, 'index.json')));
  assert.match(b.caveat, /need a person or partner to check/);
});
