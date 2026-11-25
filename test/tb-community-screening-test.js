// SPDX-License-Identifier: LicenseRef-Ultrastable-USL-1.0
// Copyright (c) 2026 Rowan Brad Quni-Gudzinas. Non-commercial use free; commercial use requires a license. See LICENSE.
import { test } from 'node:test';
import { implementability } from '../worker/src/implementability.js';

test('tb-community-screening implementability', () => {
  const impl = implementability('tb-community-screening');
  console.log(impl);
  // No assertion as no change to the facts
});
