// SPDX-License-Identifier: LicenseRef-Ultrastable-USL-1.0
// Copyright (c) 2026 Rowan Brad Quni-Gudzinas. Non-commercial use free; commercial use requires a license. See LICENSE.
// I18N-1 loop: the translator fills the most shared text first, rejects bad model output, prunes dead text, and marks a language live at half coverage.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { run, load, coverage } from '../tools/translate.mjs';
import { segKey } from '../vendor/ultrastable/core/i18n/index.js';

const seg = (text, n) => [segKey(text), { key: segKey(text), text, pages: n }];
const [A, B, C, D] = ['Skip to main content', 'Water supply in 2024', 'A rare title', 'New words here'].map(segKey);
const pages = new Map([seg('Skip to main content', 100), seg('Water supply in 2024', 50), seg('A rare title', 1)]);
const echo = async ({ user }) => user.split('\n').map(l => { const [n, t] = l.split('\t'); return `${n}\tES ${t}`; }).join('\n');

test('shared text is translated first, a language goes live at half coverage, and the manifest names its shards', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'i18n-'));
  const rep = await run({ langs: ['es'], calls: 1, batch: 2, generate: echo, pages, dir, now: '2026-11-20T00:00:00Z' });
  assert.equal(rep.es.after, 2); assert.ok(rep.es.live); assert.ok(rep.es.coverage > 0.9);
  const d = load('es', dir); assert.equal(d[A], 'ES Skip to main content'); assert.equal(d[C], undefined);
  const man = JSON.parse(readFileSync(path.join(dir, 'manifest.json'), 'utf8')); assert.equal(man.langs.es.shards.length, 8); assert.equal(man.langs.es.live, true);
});

test('bad model output is rejected and counted; dead text is pruned', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'i18n-'));
  await run({ langs: ['es'], calls: 1, batch: 3, generate: echo, pages, dir });
  const bad = async ({ user }) => user.split('\n').map(l => `${l.split('\t')[0]}\tI cannot translate that`).join('\n');
  const p2 = new Map([...pages].filter(([k]) => k !== B)); p2.set(...seg('New words here', 3));
  const rep = await run({ langs: ['es'], calls: 1, batch: 3, generate: bad, pages: p2, dir });
  assert.equal(rep.es.rejected.refusal, 1); const d = load('es', dir); assert.equal(d[B], undefined); assert.equal(d[D], undefined); assert.equal(d[A], 'ES Skip to main content');
});

test('coverage is weighted by the pages a segment appears on', () => {
  assert.equal(coverage(pages, { [A]: 'x' }), 100 / 151);
});
