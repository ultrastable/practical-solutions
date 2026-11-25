#!/usr/bin/env node
// SPDX-License-Identifier: LicenseRef-Ultrastable-USL-1.0
// Copyright (c) 2026 Rowan Brad Quni-Gudzinas. Non-commercial use free; commercial use requires a license. See LICENSE.
// IMPACT-LOOP-1: refresh ledger/impl-evidence.json for the solutions that are not yet ready to implement. No model, no secret.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { buildCatalog } from '../worker/src/catalog.js';
import { SOLUTIONS } from '../worker/src/solutions.js';
import { gather } from '../ps/implevidence.js';
const FILE = new URL('../ledger/impl-evidence.json', import.meta.url);
const cat = buildCatalog({ problems: null, solutions: SOLUTIONS });
const want = cat.sols.filter(s => s.impl && s.impl.score < 7).sort((a, b) => a.impl.score - b.impl.score);
const out = await gather({ solutions: want, prev: existsSync(FILE) ? JSON.parse(readFileSync(FILE, 'utf8')) : { items: {} } });
writeFileSync(FILE, JSON.stringify(out, null, 1) + '\n');
console.log(JSON.stringify({ solutions: Object.keys(out.items).length, with_sources: Object.values(out.items).filter(x => x.hits.length).length, log: out.log.slice(-6) }));
