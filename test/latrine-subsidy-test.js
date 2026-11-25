// SPDX-License-Identifier: LicenseRef-Ultrastable-USL-1.0
// Copyright (c) 2026 Rowan Brad Quni-Gudzinas. Non-commercial use free; commercial use requires a license. See LICENSE.
import { test } from 'node:test';
import { implementability } from '../worker/src/implementability.js';

test('latrine-subsidy implementability', () => {
  const result = implementability('latrine-subsidy');
  console.assert(result.score === 6, `Expected score 6, got ${result.score}`);
  console.assert(result.band === 'implementable with effort', `Expected band 'implementable with effort', got ${result.band}`);
  console.assert(result.limits === 'No evidence of a cheaper delivery model, programme-scale adoption, or a channel beyond rural sanitation programmes and community-led total sanitation campaigns', `Expected limits 'No evidence of a cheaper delivery model, programme-scale adoption, or a channel beyond rural sanitation programmes and community-led total sanitation campaigns', got ${result.limits}`);
});
