// SPDX-License-Identifier: LicenseRef-Ultrastable-USL-1.0
// Copyright (c) 2026 Rowan Brad Quni-Gudzinas. Non-commercial use free; commercial use requires a license. See LICENSE.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = p => fileURLToPath(new URL(`../${p}`, import.meta.url));
test('every recorded decision names evidence that exists in the repository', () => {
  const ds = JSON.parse(readFileSync(root('org/decisions.json'), 'utf8'));
  assert.ok(ds.length >= 2);
  for (const d of ds) for (const p of d.evidence_paths) assert.ok(existsSync(root(p)), `${d.id}: ${p} is missing`);
});
