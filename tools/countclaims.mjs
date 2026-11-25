#!/usr/bin/env node
// SPDX-License-Identifier: LicenseRef-Ultrastable-USL-1.0
// Copyright (c) 2026 Rowan Brad Quni-Gudzinas. Non-commercial use free; commercial use requires a license. See LICENSE.
// COUNT-CLAIMS-1 live probe: fetch the home page, /catalogue.json and /problems.json from the live site, compare every displayed count, and open or close one issue (label count-claims) accordingly.
import { execFileSync } from 'node:child_process';
import { check } from '../ps/countclaims.js';
const O = process.env.PS_ORIGIN || 'https://ultrastable.org', get = async p => { const r = await fetch(O + p, { headers: { 'user-agent': 'ps-countclaims/1' }, signal: AbortSignal.timeout(20000) }); if (!r.ok) throw new Error(`${p} ${r.status}`); return r; };
const gh = (...a) => execFileSync('gh', a, { encoding: 'utf8' });
const html = await (await get('/')).text(), catalogue = await (await get('/catalogue.json')).json(), pj = await (await get('/index.json')).json();
const faults = check(html, { catalogue, problems: pj.problems || [] });
console.log(JSON.stringify({ faults }, null, 1));
if (process.argv.includes('--dry')) process.exit(faults.length ? 1 : 0);
const open = JSON.parse(gh('issue', 'list', '--state', 'open', '--label', 'count-claims', '--json', 'number')).map(i => i.number);
if (faults.length && !open.length) gh('issue', 'create', '--title', 'Claims: a displayed problem count disagrees with its page', '--label', 'count-claims', '--label', 'idea', '--body', `${faults.map(f => `- ${f.label}: ${f.why}`).join('\n')}\n\nFiled by COUNT-CLAIMS-1 (\`ps/countclaims.js\`). Done: \`node tools/countclaims.mjs\` exits 0.`);
if (!faults.length) for (const n of open) gh('issue', 'close', String(n), '--comment', 'Counts agree again (COUNT-CLAIMS-1 probe passed).');
process.exit(faults.length ? 1 : 0);
