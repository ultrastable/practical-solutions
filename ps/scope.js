// SPDX-License-Identifier: LicenseRef-Ultrastable-USL-1.0
// Copyright (c) 2026 Rowan Brad Quni-Gudzinas. Non-commercial use free; commercial use requires a license. See LICENSE.
// Where the code agent (and the model ensemble, which applies its changes through the same path) may write. Pure and dependency-free so /method can run the real rule.
// Rules, workflows, vendored core, deploy tooling and this file are protected: a change there needs a person.
export const SCOPE = ['worker/src/*', 'worker/src/**/*', 'ps/*', 'test/*', 'org/*', 'ux/*'];
export const DENY = ['vendor/*', '.github/*', 'AGENTS.md', 'CLAUDE.md', 'package.json', 'tenancy.json', 'tools/*', 'LICENSE', 'ps/scope.js', 'ps/ensemble.js', 'ps/review.js', 'ps/llm.js', 'worker/src/ensemble-config.js', 'worker/src/ensemble-ledger.gen.js', 'worker/src/method-claims.js', 'worker/migrations/*', 'ps/access.mjs'];
const glob = g => new RegExp('^' + g.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*\*/g, '\u0000').replace(/\*/g, '[^/]*').replace(/\u0000/g, '.*') + '$');
export const allowed = p => !(p.startsWith('/') || p.startsWith('\\') || /^[A-Za-z]:/.test(p)) && !p.split('/').includes('..') && SCOPE.some(g => glob(g).test(p)) && !DENY.some(g => glob(g).test(p));

