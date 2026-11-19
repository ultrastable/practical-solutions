// SPDX-License-Identifier: LicenseRef-Ultrastable-USL-1.0
// Copyright (c) 2026 Rowan Brad Quni-Gudzinas. Non-commercial use free; commercial use requires a license. See LICENSE.
// tenant-ps-llm: configuration of the core keyless model route (core/modelservice, MODELSERVICE-1). The code lives in the core; this tenant
// passes only its audience, repository and allow-list.
import { createModelService } from '../../vendor/ultrastable/core/modelservice/index.js';
import { WORKERS_AI_MODEL } from '../../ps/llm.js';
import { WORKERS_AI_ALLOW } from '../../worker/src/ensemble-config.js';

export const LLM_AUDIENCE = 'practical-solutions-llm';
export const LLM_REPOSITORY = 'ultrastable/practical-solutions';

export default createModelService({ audience: LLM_AUDIENCE, repository: LLM_REPOSITORY, allow: WORKERS_AI_ALLOW, defaultModel: WORKERS_AI_MODEL, path: '/ps/llm' });
