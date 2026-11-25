// SPDX-License-Identifier: LicenseRef-Ultrastable-USL-1.0
// Copyright (c) 2026 Rowan Brad Quni-Gudzinas. Non-commercial use free; commercial use requires a license. See LICENSE.
import { test } from 'node:test';
import { implementability } from '../worker/src/implementability.js';

test('Impact loop test for clean-cooking', () => {
  const id = 'clean-cooking';
  const impl = implementability(id);
  console.assert(impl.score === 5, `Expected score 5, got ${impl.score}`);
  console.assert(impl.band === 'implementable with effort', `Expected band 'implementable with effort', got ${impl.band}`);
});
