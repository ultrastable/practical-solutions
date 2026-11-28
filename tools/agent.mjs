// SPDX-License-Identifier: LicenseRef-Ultrastable-USL-1.0
// Copyright (c) 2026 Rowan Brad Quni-Gudzinas. Non-commercial use free; commercial use requires a license. See LICENSE.
// The free code agent (FREE-LLM-1, SELFCODE-1 for this tenant). Runs inside GitHub Actions on the run's own GITHUB_TOKEN:
//   pick an open `agent-task` issue by a trusted author -> ask the model route ladder (GitHub Models first, ps/llm.js) for edits
//   -> apply them inside the scope allowlist -> `npm test` -> branch, PR, merge (direct push when PRs are not allowed)
//   -> the workflow then deploys and live-checks; `settle` re-runs the tests on main and reverts an agent commit that broke them.
// Every step records its outcome on the issue; a failed attempt never changes main.
//   node tools/agent.mjs run [--issue N] [--dry]     node tools/agent.mjs settle
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { complete } from '../ps/llm.js';
import { crossReview } from '../ps/review.js';
import { SCOPE, DENY, allowed } from '../ps/scope.js';

export const LABEL = 'agent-task';
export const TRUSTED = ['OWNER', 'MEMBER', 'COLLABORATOR'];
// The system's own loops file issues as the built-in token's bot; the permission API reports no access for it, so it was never trusted and
// its `idea` issues sat open for days (issue 204). It is the system itself, so it is trusted by name.
export const SYSTEM_AUTHORS = ['github-actions[bot]'];
export const SLA_HOURS = 24;
// An issue the model has failed MAX_ATTEMPTS times is labelled `agent-exhausted` and closed as not planned (an Ultrastable system resolves its own issues; a failed one is a flagged disposition, not an open item): 66 identical failure comments on #223 taught nothing.
export const MAX_ATTEMPTS = 3;
export const EXHAUSTED = 'agent-exhausted';
export const COOLDOWN_DAYS = 7; // ps/impactloop.js cooldownKeys reads the same number
export const countFailures = comments => comments.filter(c => /^Attempt failed, main unchanged/.test(String(c.body || c))).length;
// A closing probe an issue may name: `npm test` or one read-only check script. Anything else is never executed.
export const RECONCILE_PROBE = /^(npm test|node (--no-warnings )?tools\/[a-z0-9_]+\.mjs --check)$/;
export const PROBES = ['npm test'];  // the only commands an issue may name as its closing probe
export { SCOPE, DENY, allowed };

export function parseTask(body = '') {
  const line = k => { const m = new RegExp('^' + k + ':\\s*(.+)$', 'mi').exec(body); return m ? m[1].trim() : ''; };
  const paths = line('paths').split(/[,\s]+/).filter(Boolean);
  const probe = line('probe') || 'npm test';
  return { paths, probe: PROBES.includes(probe) ? probe : 'npm test' };
}

// Trusted: the author association says so, or (with the built-in token the API reports a private org member as CONTRIBUTOR) the author has write access.
// A failed issue is retried, never dropped: an explicit --issue takes it at once, and a scheduled run with no fresh issue takes the oldest failed one.
export function pickIssue(issues, { only, writers = new Set() } = {}) {
  const has = (i, n) => (i.labels || []).some(l => (l.name || l) === n);
  const ok = issues.filter(i => !i.pull_request && has(i, LABEL) && (TRUSTED.includes(i.author_association) || writers.has(i.user && i.user.login) || SYSTEM_AUTHORS.includes(i.user && i.user.login)) && !has(i, 'agent-working') && !has(i, EXHAUSTED))
    .sort((a, b) => a.number - b.number);
  if (only) return ok.find(i => i.number === Number(only)) || null;
  return ok.find(i => !has(i, 'agent-failed')) || ok[0] || null;
}

const clip = (s, n) => (s.length > n ? s.slice(0, n) + '\n/* ...truncated... */' : s);
export function buildPrompt(issue, files, tests = []) {
  const task = parseTask(issue.body);
  return `You are a careful JavaScript engineer changing a small Cloudflare Worker repository (ES modules, node:test). Implement the issue below.
Answer in plain blocks, no JSON and no escaping. First a line \`SUMMARY: <one line>\`. Then one block per edit:
<<<EDIT path/to/file.js
<<<FIND
exact unique text to replace
<<<REPLACE
new text
>>>END
or, for a new or rewritten file:
<<<FILE path/to/new.js
entire file
>>>END
Rules: only write paths under worker/src, ps, test, org or ux. Change an existing file ONLY with EDIT/FIND/REPLACE blocks, never by rewriting it whole (long answers are cut off and break the file); <<<FILE is for new files. Use only node built-ins and relative imports: no npm package is installed (no node-fetch, use global fetch). Only edit or import files listed in CURRENT FILES or in EXISTING TESTS; do not invent file names. Every "find" must occur exactly once in the current file. Every source file starts with the two SPDX header lines. Add or update a test in test/ that runs under \`node --test\`. Do not invent facts or numbers: data comes from cited sources or live APIs, and a missing source is reported as missing.

ISSUE #${issue.number}: ${issue.title}
${issue.body}

EXISTING TESTS: ${tests.join(', ') || 'none listed'}

CURRENT FILES:
${files.map(f => `--- ${f.path}\n${clip(f.text, Math.floor(30000 / Math.max(1, files.length)))}`).join('\n')}`;
}

export function parseEdits(text) {
  const t = String(text);
  const edits = [];
  for (const m of t.matchAll(/<<<EDIT ([^\n]+)\n<<<FIND\n([\s\S]*?)\n<<<REPLACE\n([\s\S]*?)\n?>>>END/g)) edits.push({ path: m[1].trim(), find: m[2], replace: m[3] });
  for (const m of t.matchAll(/<<<FILE ([^\n]+)\n([\s\S]*?)>>>END/g)) edits.push({ path: m[1].trim(), content: m[2] });
  const opened = (t.match(/^<<<(?:EDIT|FILE) /gm) || []).length;
  if (opened > edits.length) throw new Error(`answer cut off: ${opened} edit blocks opened, ${edits.length} closed with >>>END`);
  if (edits.length) return { summary: (/SUMMARY:\s*(.+)/.exec(t) || [, ''])[1].trim(), edits };
  const m = /\{[\s\S]*\}/.exec(t.replace(/^```(?:json)?|```$/gm, ''));
  if (!m) throw new Error('no edit blocks or JSON in model answer');
  const j = JSON.parse(m[0]);
  if (!Array.isArray(j.edits) || !j.edits.length) throw new Error('no edits');
  return { summary: String(j.summary || ''), edits: j.edits };
}

export const MAX_REWRITE = 2000;
// Applies edits under the scope allowlist. Throws without writing anything when any edit is out of scope or does not apply.
export function applyEdits(edits, root, fs = { read: p => readFileSync(p, 'utf8'), write: (p, t) => { mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, t); }, exists: existsSync }) {
  const next = new Map();
  for (const e of edits) {
    if (!e || typeof e.path !== 'string' || !allowed(e.path)) throw new Error(`path not allowed: ${e && e.path}`);
    const abs = resolve(root, e.path);
    if (relative(root, abs).startsWith('..')) throw new Error('path escapes the repository');
    if (typeof e.content === 'string') {
      if (!next.has(abs) && fs.exists(abs) && fs.read(abs).length > MAX_REWRITE) throw new Error(`whole-file rewrite of ${e.path} refused (over ${MAX_REWRITE} chars): use FIND/REPLACE edits`);
      next.set(abs, e.content); continue;
    }
    const cur = next.has(abs) ? next.get(abs) : fs.exists(abs) ? fs.read(abs) : null;
    if (cur == null) throw new Error(`no such file: ${e.path}`);
    const n = e.find ? cur.split(e.find).length - 1 : 0;
    if (n !== 1) throw new Error(`find text occurs ${n} times in ${e.path}`);
    next.set(abs, cur.replace(e.find, () => String(e.replace ?? '')));
  }
  for (const [abs, t] of next) fs.write(abs, t);
  return [...next.keys()].map(a => relative(root, a).split('\\').join('/')); // repository paths use '/', on every platform
}

// Catches what the model most often breaks before npm test: a file that does not parse, or an import of a package that is not installed.
export function validateChanged(changed, root, read = p => readFileSync(resolve(root, p), 'utf8'), check = (p, text) => { const t = resolve(tmpdir(), `agent-check-${process.pid}.mjs`); writeFileSync(t, text); try { execFileSync(process.execPath, ['--check', t], { stdio: 'pipe' }); } finally { try { unlinkSync(t); } catch { /* gone */ } } }) {
  for (const p of changed.filter(f => /\.m?js$/.test(f))) {
    const text = read(p);
    for (const m of text.matchAll(/(?:from|import)\s*\(?\s*['"]([^'"]+)['"]/g)) if (!/^(\.|\/|node:)/.test(m[1])) throw new Error(`${p} imports package '${m[1]}', which is not installed (node built-ins and relative imports only)`);
    try { check(p, text); } catch (e) { throw new Error(`${p} does not parse: ${String(e.stderr || e.message).split('\n').find(l => /Error/.test(l)) || 'syntax error'}`); }
  }
}

export const sh = (cmd, args, o = {}) => execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...o });
// a GitHub-side 5xx or GraphQL hiccup is retried (3 tries) before it can stop a run: on 2026-11-25 one such error in reconcile skipped the whole agent run
export const gh = (...a) => { let last; for (let t = 0; t < 3; t++) { try { return sh('gh', a); } catch (e) { last = e; if (!/50\d|Something went wrong|timeout|ECONNRESET/i.test(String(e.stderr || e.message))) throw e; Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 2000 * (t + 1)); } } throw last; };
export const note = (n, text) => { try { gh('issue', 'comment', String(n), '--body', text + '\n\n_Free code agent run (GitHub Models, then Workers AI through the tenant model Worker)._'); } catch (e) { console.error('comment failed', e.message); } };

export async function run({ issueNo, dry = false, root = process.cwd(), env = process.env } = {}) {
  const issues = JSON.parse(gh('api', `repos/${env.GITHUB_REPOSITORY}/issues?state=open&labels=${LABEL}&per_page=50`));
  const writers = new Set();
  for (const login of new Set(issues.map(i => i.user && i.user.login).filter(Boolean))) {
    try { if (['admin', 'maintain', 'write'].includes(JSON.parse(gh('api', `repos/${env.GITHUB_REPOSITORY}/collaborators/${login}/permission`)).permission)) writers.add(login); } catch { /* no read access to permissions: association alone decides */ }
  }
  for (const i of issues) {
    if ((i.labels || []).some(l => (l.name || l) === EXHAUSTED) || !(i.labels || []).some(l => (l.name || l) === 'agent-failed')) continue;
    let n = 0; try { n = countFailures(JSON.parse(gh('api', `repos/${env.GITHUB_REPOSITORY}/issues/${i.number}/comments?per_page=100`))); } catch { continue; }
    if (n >= MAX_ATTEMPTS && !dry) { try { gh('issue', 'edit', String(i.number), '--add-label', EXHAUSTED); i.labels.push({ name: EXHAUSTED }); note(i.number, `Exhausted: ${n} failed attempts (limit ${MAX_ATTEMPTS}). Disposition: flagged, the free model route cannot do this task. Closed as not planned so the queue is resolved, not left to age; the impact loop will not file the same item again for ${COOLDOWN_DAYS} days.`); gh('issue', 'close', String(i.number), '--reason', 'not planned'); } catch (e) { console.error(e.message); } }
  }
  const issue = pickIssue(issues, { only: issueNo, writers });
  if (!issue) { console.log(JSON.stringify({ picked: null })); return { picked: null }; }
  const { paths } = parseTask(issue.body);
  const files = paths.filter(allowed).filter(p => existsSync(resolve(root, p))).map(p => ({ path: p, text: readFileSync(resolve(root, p), 'utf8') }));
  const tests = existsSync(resolve(root, 'test')) ? readdirSync(resolve(root, 'test')).filter(f => f.endsWith('.test.js')).map(f => `test/${f}`) : [];
  const prompt = buildPrompt(issue, files, tests);
  const res = await complete({ secrets: { GITHUB_MODELS_TOKEN: env.GITHUB_TOKEN, PS_LLM_URL: env.PS_LLM_URL, ACTIONS_ID_TOKEN_REQUEST_URL: env.ACTIONS_ID_TOKEN_REQUEST_URL, ACTIONS_ID_TOKEN_REQUEST_TOKEN: env.ACTIONS_ID_TOKEN_REQUEST_TOKEN, ANTHROPIC_API_KEY: env.ANTHROPIC_API_KEY }, prompt, maxTokens: 8000 });
  const fail = (why) => { console.log(JSON.stringify({ issue: issue.number, ok: false, why })); if (!dry) { try { gh('issue', 'edit', String(issue.number), '--add-label', 'agent-failed'); } catch (e) { console.error(e.message); } note(issue.number, `Attempt failed, main unchanged: ${why}. The scheduled run retries it when no fresh issue waits.`); } return { issue: issue.number, ok: false, why }; };
  if (!res.ok) return fail(`no model route answered (${(res.tried || []).join('; ') || 'none configured'})`);
  let plan, changed;
  try { plan = parseEdits(res.text); changed = applyEdits(plan.edits, root); validateChanged(changed, root); } catch (e) { sh('git', ['checkout', '--', '.'], { cwd: root }); sh('git', ['clean', '-fdq', 'worker', 'ps', 'test', 'org', 'ux'], { cwd: root }); return fail(String(e.message)); }
  try { sh('npm', ['test'], { cwd: root, maxBuffer: 1 << 26 }); } catch (e) { sh('git', ['checkout', '--', '.'], { cwd: root }); sh('git', ['clean', '-fdq', 'worker', 'ps', 'test', 'org', 'ux'], { cwd: root }); return fail('tests failed after the change: ' + String(e.stdout || e.message).split('\n').filter(l => /not ok|Error|expected|actual/i.test(l)).slice(0, 6).join(' | ')); }
  if (dry) { console.log(JSON.stringify({ issue: issue.number, ok: true, dry: true, changed })); return { issue: issue.number, ok: true, changed }; }
  // a second vendor reads the diff before it merges (ps/review.js); a blocked change is reverted in the working tree and the issue is retried later
  const review = await crossReview({ title: issue.title, diff: sh('git', ['diff'], { cwd: root, maxBuffer: 1 << 26 }), authorModel: res.model, secrets: { GITHUB_TOKEN: env.GITHUB_TOKEN, PS_LLM_URL: env.PS_LLM_URL, ACTIONS_ID_TOKEN_REQUEST_URL: env.ACTIONS_ID_TOKEN_REQUEST_URL, ACTIONS_ID_TOKEN_REQUEST_TOKEN: env.ACTIONS_ID_TOKEN_REQUEST_TOKEN } });
  const reviewLine = `${review.votes.map(v => `${v.vendor} ${v.verdict}`).join(', ') || 'no reviewer answered'} (${review.why})`;
  if (!review.merge) { sh('git', ['checkout', '--', '.'], { cwd: root }); sh('git', ['clean', '-fdq', 'worker', 'ps', 'test', 'org', 'ux'], { cwd: root }); return fail(`cross-model review blocked the change: ${review.votes.filter(v => v.verdict === 'reject').map(v => `${v.vendor}: ${v.reason}`).join('; ')}`); }
  const branch = `agent/${issue.number}-${issue.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 30).replace(/-$/, '')}`;
  sh('git', ['config', 'user.name', 'practical-solutions-agent']); sh('git', ['config', 'user.email', 'agent@users.noreply.github.com']);
  sh('git', ['checkout', '-b', branch]); sh('git', ['add', ...changed]);
  sh('git', ['commit', '-m', `Agent: ${issue.title} (#${issue.number})\n\nItem: #${issue.number}\nAuthor: free code agent (${res.model}); the reviewer is the test suite and the live check after deploy.`]);
  let how = 'merged via pull request';
  try {
    sh('git', ['push', '-u', 'origin', branch]);
    const url = gh('pr', 'create', '--base', 'main', '--head', branch, '--title', `Agent: ${issue.title}`, '--body', `Item: #${issue.number}\nAuthor: free code agent (${res.model})\nReviewer: \`npm test\` before the push, cross-vendor review (${reviewLine}), the live check after deploy.\nEvidence: ${plan.summary}`).trim();
    gh('pr', 'merge', url, '--squash', '--delete-branch');
  } catch (e) {
    how = 'merged by direct push (pull requests are not allowed for this token)';
    sh('git', ['fetch', 'origin', 'main']); sh('git', ['rebase', 'origin/main']); sh('git', ['push', 'origin', 'HEAD:main']);
    try { sh('git', ['push', 'origin', '--delete', branch]); } catch { /* the branch may not exist on the remote */ }
  }
  note(issue.number, `Changed ${changed.join(', ')}; tests passed; ${how}. ${plan.summary} The deploy workflow now deploys it and runs the live check; a failure reverts it.`);
  gh('issue', 'close', String(issue.number), '--reason', 'completed');
  console.log(JSON.stringify({ issue: issue.number, ok: true, changed, how }));
  return { issue: issue.number, ok: true, changed, how };
}

// SLA-ISSUE-1 (Rowan 2026-11-25: "why is an issue open for 3 days?"). Every pass, before the agent works: (1) an open issue from a trusted author that carries `idea`
// but not `agent-task` gets the label (a label or issue created by the built-in token starts no workflow, so intake by event never fired for system-filed issues);
// (2) an open issue whose `Closing probe:` line names an allowed check that already passes on main is closed with that evidence; (3) anything still open past
// SLA_HOURS is reported, and the workflow fails on it so ciwatch files it. Returns { closed, labelled, overdue }.
export function closingProbe(body = '') { const m = /^Closing probe:\s*(.+?)(?:\s+exits? 0.*)?\.?\s*$/mi.exec(body); return m ? m[1].trim().replace(/[.`]+$/, '').replace(/^`/, '') : ''; }
export function overdueIssues(issues, now = Date.now(), hours = SLA_HOURS) { return issues.filter(i => !i.pull_request && (now - Date.parse(i.created_at)) / 36e5 > hours).map(i => i.number); }
export function reconcile({ root = process.cwd(), env = process.env, now = Date.now(), dry = false } = {}) {
  const issues = JSON.parse(gh('api', `repos/${env.GITHUB_REPOSITORY}/issues?state=open&per_page=100`)).filter(i => !i.pull_request);
  const out = { closed: [], labelled: [], overdue: [] };
  for (const i of issues) {
    const has = n => (i.labels || []).some(l => (l.name || l) === n);
    const login = i.user && i.user.login;
    if (has('idea') && !has(LABEL) && (TRUSTED.includes(i.author_association) || SYSTEM_AUTHORS.includes(login))) { if (!dry) { try { gh('api', '-X', 'POST', `repos/${env.GITHUB_REPOSITORY}/issues/${i.number}/labels`, '-f', `labels[]=${LABEL}`); } catch (e) { console.error('label failed (REST, retried next pass):', i.number, String(e.message).slice(0, 160)); continue; } } out.labelled.push(i.number); }
    const probe = closingProbe(i.body);
    if (probe && RECONCILE_PROBE.test(probe) && (has('idea') || has(LABEL)) && (TRUSTED.includes(i.author_association) || SYSTEM_AUTHORS.includes(login))) {
      let ok = false, tail = '';
      try { tail = sh('sh', ['-c', probe], { cwd: root, maxBuffer: 1 << 26 }).trim().split('\n').slice(-3).join(' | '); ok = true; } catch (e) { tail = String(e.stdout || e.message).trim().split('\n').slice(-2).join(' | '); }
      if (ok && !dry) { note(i.number, `SLA-ISSUE-1: the closing probe \`${probe}\` passes on main now (${tail.slice(0, 300)}). Closing as completed.`); gh('issue', 'close', String(i.number), '--reason', 'completed'); out.closed.push(i.number); }
    }
  }
  const left = issues.filter(i => !out.closed.includes(i.number));
  out.overdue = overdueIssues(left, now);
  console.log(JSON.stringify({ reconcile: out }));
  return out;
}

// Re-runs the tests on main; if an agent commit broke them, reverts it and reopens its issue.
export function settle({ root = process.cwd(), force = false } = {}) {
  if (!force) try { sh('npm', ['test'], { cwd: root, maxBuffer: 1 << 26 }); console.log(JSON.stringify({ settled: 'kept' })); return 'kept'; } catch { /* fall through to the revert */ }
  const sub = sh('git', ['log', '-1', '--format=%s']).trim(), m = /^Agent: .*\(#(\d+)\)/.exec(sub);
  if (!m) { console.log(JSON.stringify({ settled: force ? 'not-agent' : 'failing', why: 'head is not an agent commit; the failing deploy or test run reports it' })); if (!force) process.exitCode = 1; return force ? 'not-agent' : 'failing'; }
  sh('git', ['revert', '--no-edit', 'HEAD']); sh('git', ['push', 'origin', 'HEAD:main']);
  gh('issue', 'reopen', m[1]); gh('issue', 'edit', m[1], '--add-label', 'agent-failed'); note(m[1], 'The tests failed on main after this change, so it was reverted.');
  console.log(JSON.stringify({ settled: 'reverted', issue: Number(m[1]) })); return 'reverted';
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [cmd, ...rest] = process.argv.slice(2), i = rest.indexOf('--issue');
  if (cmd === 'run') await run({ issueNo: i >= 0 ? rest[i + 1] : undefined, dry: rest.includes('--dry') });
  else if (cmd === 'reconcile') { const r = reconcile({ dry: rest.includes('--dry') }); if (r.overdue.length && !rest.includes('--no-fail')) { console.error(`agent: issue(s) ${r.overdue.join(', ')} open past ${SLA_HOURS} h (SLA-ISSUE-1)`); process.exitCode = 1; } }
  else if (cmd === 'settle') settle({ force: rest.includes('--force') });
  else { console.error('usage: agent.mjs run [--issue N] [--dry] | settle'); process.exit(2); }
}
