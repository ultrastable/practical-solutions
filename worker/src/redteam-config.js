// SPDX-License-Identifier: LicenseRef-Ultrastable-USL-1.0
// Copyright (c) 2026 Rowan Brad Quni-Gudzinas. Non-commercial use free; commercial use requires a license. See LICENSE.
// The one place a model is used: the red-team route. Kept in its own module so /method states it from the same data the Action runs.
export const CONFIG = { ignorance: { model_alias: 'red', author_family: 'anthropic', token_env: 'GITHUB_TOKEN', models: { red: { endpoint: 'github_models', model: 'openai/gpt-4.1-mini', family: 'openai' } } } };
