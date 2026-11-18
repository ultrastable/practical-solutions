// SPDX-License-Identifier: LicenseRef-Ultrastable-USL-1.0
// Copyright (c) 2026 Rowan Brad Quni-Gudzinas. Non-commercial use free; commercial use requires a license. See LICENSE.
import test from 'node:test'; import assert from 'node:assert/strict';
import { anchor, lastAnchor } from '../tools/audit_anchor.mjs';
const fx = (head, ok = true, proofHash) => async (p) => ({ ok: true, json: async () => p.includes('/audit/summary') ? { tenant: 't', head } : p.includes('/audit/verify') ? { ok, days: 1, hot_events: 2 } : { hash: proofHash } });
test('first run anchors the head', async () => { const r = await anchor({ fetchImpl: fx({ seq: 3, hash: 'h3' }) }); assert.equal(r.problems.length, 0); assert.equal(r.entry.seq, 3); });
test('unchanged head is not re-appended', async () => { const t = JSON.stringify({ seq: 3, hash: 'h3' }) + '\n'; assert.equal((await anchor({ fetchImpl: fx({ seq: 3, hash: 'h3' }), ledgerText: t })).unchanged, true); });
test('rewritten history is caught', async () => { const t = JSON.stringify({ seq: 3, hash: 'h3' }) + '\n'; assert.match((await anchor({ fetchImpl: fx({ seq: 5, hash: 'h5' }, true, 'EVIL'), ledgerText: t })).problems[0], /changed/); });
test('same seq different hash is caught', async () => { const t = JSON.stringify({ seq: 3, hash: 'h3' }) + '\n'; assert.equal((await anchor({ fetchImpl: fx({ seq: 3, hash: 'x' }), ledgerText: t })).problems.length, 1); });
test('failed verify is a problem', async () => { assert.equal((await anchor({ fetchImpl: fx({ seq: 1, hash: 'a' }, false) })).problems.length, 1); });
test('lastAnchor reads the final line', () => { assert.equal(lastAnchor('{"seq":1}\n{"seq":2}\n').seq, 2); });
