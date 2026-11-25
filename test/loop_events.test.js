// SPDX-License-Identifier: LicenseRef-Ultrastable-USL-1.0
// Copyright (c) 2026 Rowan Brad Quni-Gudzinas. Non-commercial use free; commercial use requires a license. See LICENSE.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loopEvents, mergeChanges } from '../worker/src/loop-events.js';
import { describeChange } from '../worker/src/publish.js';

test('loop runs from generated modules are changes with the module timestamps', () => {
  const ev = loopEvents({ SCAN: { at: '2026-11-25T12:50:00Z', recent: [1, 2] }, CONNECTIONS: { at: '2026-11-25T09:00:00Z', stats: { semantic_links: 5, nodes: 9 } },
    SYNTHESES_PUBLISHED: { verified_at: '2026-11-25T13:00:00Z', published: [{}] }, ENSEMBLE_LEDGER: {}, PIPELINE: { history: [{ at: '2026-11-24T18:00:00Z', moved: 2, source: 'run' }, { at: '2026-11-24T10:00:00Z', moved: 0, source: 'run' }] } });
  assert.deepEqual(ev.map(e => e.kind).sort(), ['connections_run', 'pipeline_move', 'problem_scan', 'synthesis_checked']);
});
test('merge sorts newest first and drops duplicates', () => {
  const kv = [{ at: '2026-11-23T17:00:00Z', kind: 'candidate_added', problem: 'air' }];
  const m = mergeChanges([...kv, ...kv], [{ at: '2026-11-25T13:00:00Z', kind: 'synthesis_checked', id: 'x' }]);
  assert.equal(m.length, 2); assert.equal(m[0].kind, 'synthesis_checked');
});
test('every loop-run kind has feed wording', () => {
  for (const e of loopEvents()) assert.ok(describeChange(e, 'https://x'), e.kind);
});
