// SPDX-License-Identifier: LicenseRef-Ultrastable-USL-1.0
// Copyright (c) 2026 Rowan Brad Quni-Gudzinas. Non-commercial use free; commercial use requires a license. See LICENSE.
import { test } from 'node:test';
import { implementability } from '../worker/src/implementability.js';

test('Reducing Newborn Deaths implementability', () => {
  const id = 'reducing-newborn-deaths';
  const impl = implementability(id);
  console.assert(impl.score === 6, `Expected score 6, got ${impl.score}`);
  console.assert(impl.band === 'implementable with effort', `Expected band 'implementable with effort', got ${impl.band}`);
});
