#!/usr/bin/env node
// SPDX-License-Identifier: LicenseRef-Ultrastable-USL-1.0
// Copyright (c) 2026 Rowan Brad Quni-Gudzinas. Non-commercial use free; commercial use requires a license. See LICENSE.
// FEATURE-GAP-1: weekly gap analysis. Probes the site's own router, writes ledger/gaps.json and, with --file, files the top gaps as `idea` issues
// (the free code agent takes them). Needs no secret beyond the run's GITHUB_TOKEN.
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { scan, planIssues } from '../ps/gapscan.js';
import { buildCatalog } from '../worker/src/catalog.js';
import { SOLUTIONS } from '../worker/src/solutions.js';
import { route } from '../worker/src/site.js';

const registry = JSON.parse(readFileSync(new URL('../org/capabilities.json', import.meta.url), 'utf8'));
const c = buildCatalog({ problems: null, solutions: SOLUTIONS });
const r = await scan(registry, async p => route(new URL('https://x' + p), c));
const ledger = { at: new Date().toISOString(), total: r.total, shipped: r.shipped, coverage: Number(r.coverage.toFixed(3)), gaps: r.gaps.map(g => ({ id: g.id, priority: g.priority, feature: g.feature, reference: g.reference })) };
writeFileSync(new URL('../ledger/gaps.json', import.meta.url), JSON.stringify(ledger, null, 2) + '\n');
console.log(JSON.stringify(ledger, null, 2));
if (process.argv.includes('--file')) {
  const titles = JSON.parse(execFileSync('gh', ['issue', 'list', '--state', 'all', '--limit', '300', '--json', 'title', '--label', 'gap'], { encoding: 'utf8' })).map(i => i.title);
  for (const i of planIssues(r.gaps, titles, 2)) {
    execFileSync('gh', ['issue', 'create', '--title', i.title, '--body', i.body, ...i.labels.flatMap(l => ['--label', l])], { stdio: 'inherit' });
  }
}
