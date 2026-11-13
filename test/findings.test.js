// SPDX-License-Identifier: LicenseRef-Ultrastable-USL-1.0
// Copyright (c) 2026 Rowan Brad Quni-Gudzinas. Non-commercial use free; commercial use requires a license. See LICENSE.
// The recorded reading of the real data must match the committed ledger: the briefs it names exist, and verdicts agree.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';

test('ledger/findings.json agrees with ledger/ps.sqlite', () => {
  const f = JSON.parse(readFileSync(new URL('../ledger/findings.json', import.meta.url), 'utf8'));
  const db = new DatabaseSync(new URL('../ledger/ps.sqlite', import.meta.url).pathname, { readOnly: true });
  const rows = db.prepare(`SELECT unit, status FROM ps_briefs WHERE problem_id=?`).all(f.problem);
  assert.ok(rows.length >= f.reading.bright_spots_detected, 'the ledger only grows; a reading may be older than it, never ahead of it');
  for (const s of f.reading.survived_independent_check) assert.equal(rows.find(r => r.unit === s.unit)?.status, 'published');
  if (f.reading.hit_rate != null) assert.ok(f.reading.predictions_resolved > 0, 'a hit rate needs resolved predictions');
  const resolved = db.prepare(`SELECT COUNT(*) n FROM ps_predictions WHERE verdict IS NOT NULL`).get().n;
  assert.ok(resolved >= f.reading.predictions_resolved);
});
