// SPDX-License-Identifier: LicenseRef-Ultrastable-USL-1.0
// Copyright (c) 2026 Rowan Brad Quni-Gudzinas. Non-commercial use free; commercial use requires a license. See LICENSE.
// The red-team route: a daily pass that challenges entries through GitHub Models. The model rotates through the ensemble pool's GitHub Models members by day,
// so no single vendor's blind spots decide which challenges are raised. Kept in its own module so /method states it from the same data the Action runs.
import { ENSEMBLE } from './ensemble-config.js';
export const RED_POOL = ENSEMBLE.pool.filter(m => m.route === 'github-models');
export const configFor = (day = 0) => { const m = RED_POOL[((day % RED_POOL.length) + RED_POOL.length) % RED_POOL.length]; return { ignorance: { model_alias: 'red', author_family: ENSEMBLE.author_family, token_env: 'GITHUB_TOKEN', models: { red: { endpoint: 'github_models', model: m.model, family: m.vendor } } } }; };
export const CONFIG = configFor(0);
