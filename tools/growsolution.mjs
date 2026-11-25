#!/usr/bin/env node
// SPDX-License-Identifier: LicenseRef-Ultrastable-USL-1.0
// Copyright (c) 2026 Rowan Brad Quni-Gudzinas. Non-commercial use free; commercial use requires a license. See LICENSE.
// IMPACT-LOOP-1 catalogue growth, deterministic. One run adds at most ONE solution for ONE problem: the problem with no practical solution first, else the one with the fewest.
// Real sources come from ps/implevidence.js; a model drafts one JSON entry; ps/grow.js checks every figure against the abstracts; this tool inserts it, runs the tests and ships it
// (pull request, direct push as the fallback). A failed attempt is recorded in ledger/grow.json with the reason and the problem is retried after a cool-down, not hammered.
// Usage: node tools/growsolution.mjs [--dry] [--problem ID]
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { buildCatalog } from '../worker/src/catalog.js';
import { SOLUTIONS } from '../worker/src/solutions.js';
import { gather } from '../ps/implevidence.js';
import { complete } from '../ps/llm.js';
import { buildPrompt, check, renderEntry, renderImpl, insertBefore, MORE_ANCHOR, IMPL_ANCHOR } from '../ps/grow.js';
const root = new URL('..', import.meta.url).pathname, env = process.env, args = process.argv.slice(2), dry = args.includes('--dry');
const QUERY = { internet: 'internet access', tb: 'tuberculosis', neonatal: 'neonatal mortality' };   // where the longest word is not specific enough
const LEDGER = root + 'ledger/grow.json', COOL_H = 20;
const sh = (c, a, o = {}) => execFileSync(c, a, { cwd: root, encoding: 'utf8', maxBuffer: 1 << 26, ...o });
const led = existsSync(LEDGER) ? JSON.parse(readFileSync(LEDGER, 'utf8')) : { schema: 'ps-grow/1', problems: {}, added: [] };
const save = () => { led.at = new Date().toISOString(); writeFileSync(LEDGER, JSON.stringify(led, null, 1) + '\n'); };

const cat = buildCatalog({ problems: null, solutions: SOLUTIONS });
const count = p => (cat.byProblem[p.id] || []).filter(s => s.impl && s.impl.practical).length;
const forced = args.includes('--problem') ? args[args.indexOf('--problem') + 1] : null;
const due = p => !(led.problems[p.id] && Date.now() - Date.parse(led.problems[p.id].at) < COOL_H * 36e5);
const target = forced ? cat.probs.find(p => p.id === forced) : [...cat.probs].filter(due).sort((a, b) => count(a) - count(b) || (cat.byProblem[a.id] || []).length - (cat.byProblem[b.id] || []).length)[0];
if (!target) { console.log(JSON.stringify({ grow: 'no problem is due' })); process.exit(0); }
const fail = why => { led.problems[target.id] = { at: new Date().toISOString(), why: why.slice(0, 600) }; if (!dry) save(); console.log(JSON.stringify({ grow: 'failed', problem: target.id, why })); process.exit(0); };

const ev = await gather({ solutions: [{ id: target.id, title: target.search || QUERY[target.id] || [...target.title.replace(/[^A-Za-z ]/g, " ").split(" ")].sort((a, b) => b.length - a.length)[0] }], prev: { items: {} }, max: 1, refresh_days: 0 });
const hits = (ev.items[target.id] || { hits: [] }).hits;
if (!hits.length) fail('no usable source (' + JSON.stringify(ev.log.slice(-1)) + ', query ' + JSON.stringify((ev.items[target.id] || {}).query) + ')');
const ask = await complete({ secrets: { GITHUB_MODELS_TOKEN: env.GITHUB_TOKEN, PS_LLM_URL: env.PS_LLM_URL, ACTIONS_ID_TOKEN_REQUEST_URL: env.ACTIONS_ID_TOKEN_REQUEST_URL, ACTIONS_ID_TOKEN_REQUEST_TOKEN: env.ACTIONS_ID_TOKEN_REQUEST_TOKEN, ANTHROPIC_API_KEY: env.ANTHROPIC_API_KEY }, prompt: buildPrompt(target, hits), maxTokens: 2500 });
if (!ask.ok) fail('no model route answered: ' + (ask.tried || []).join('; '));
const r = check(ask.text, { problem: target, hits, ids: cat.sols.map(s => s.id) });
if (!r.ok) fail('draft refused: ' + r.why);

const moreP = root + 'worker/src/more-solutions.js', implP = root + 'worker/src/implementability.js';
const more = insertBefore(readFileSync(moreP, 'utf8'), MORE_ANCHOR, renderEntry(r.entry)), impl = insertBefore(readFileSync(implP, 'utf8'), IMPL_ANCHOR, renderImpl(r.entry.id, r.impl));
if (!more || !impl) fail('insertion anchor not found exactly once');
if (dry) { console.log(JSON.stringify({ grow: 'dry', problem: target.id, id: r.entry.id, capped: r.capped, entry: renderEntry(r.entry).slice(0, 900) })); process.exit(0); }
writeFileSync(moreP, more); writeFileSync(implP, impl);
try { sh('node', ['--no-warnings', 'tools/content_dates.mjs']); sh('node', ['--no-warnings', 'tools/connections.mjs', '--links-only']); sh('npm', ['test']); } catch (e) { sh('git', ['checkout', '--', 'worker']); fail('tests failed: ' + String(e.stdout || e.message).split('\n').filter(l => /^\s*(not ok|error:|message:|expected:|actual:|failureType:) ?/i.test(l) && !/^\s*ok /.test(l)).map(l => l.trim()).slice(0, 8).join(' | ')); }
led.added.push({ id: r.entry.id, problem: target.id, at: new Date().toISOString(), model: ask.model, sources: hits.map(h => h.url) }); delete led.problems[target.id]; save();
const branch = `grow/${r.entry.id}`, title = `Grow catalogue: ${r.entry.title} (problem ${target.id})`;
sh('git', ['config', 'user.name', 'practical-solutions-agent']); sh('git', ['config', 'user.email', 'agent@users.noreply.github.com']);
sh('git', ['checkout', '-b', branch]); sh('git', ['add', 'worker', 'ledger/grow.json']);
sh('git', ['commit', '-m', `${title}\n\nItem: IMPACT-LOOP-1\nAuthor: impact loop (${ask.model}); every figure checked against the abstracts of ${hits.length} source(s) with a DOI that resolved; entry starts "not yet checked against the source".\nReviewer: npm test, then the loop's own citation check.`]);
let how = 'merged via pull request';
try { sh('git', ['push', '-u', 'origin', branch]); const url = sh('gh', ['pr', 'create', '--base', 'main', '--head', branch, '--title', title, '--body', `Item: IMPACT-LOOP-1\nAuthor: impact loop (${ask.model})\nReviewer: npm test; figures checked against source abstracts.`]).trim(); sh('gh', ['pr', 'merge', url, '--squash', '--delete-branch']); }
catch { how = 'merged by direct push'; sh('git', ['fetch', 'origin', 'main']); sh('git', ['rebase', 'origin/main']); sh('git', ['push', 'origin', 'HEAD:main']); }
console.log(JSON.stringify({ grow: 'added', id: r.entry.id, problem: target.id, how }));
