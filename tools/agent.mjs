// SPDX-License-Identifier: LicenseRef-Ultrastable-USL-1.0
// Copyright (c) 2026 Rowan Brad Quni-Gudzinas. Non-commercial use free; commercial use requires a license. See LICENSE.
// The free code agent (FREE-LLM-1, SELFCODE-1 for this tenant). Runs inside GitHub Actions on the run's own GITHUB_TOKEN:
//   pick an open `agent-task` issue by a trusted author -> ask the model route ladder (GitHub Models first, ps/llm.js) for edits
//   -> apply them inside the scope allowlist -> `npm test` -> branch, PR, merge (direct push when PRs are not allowed)
//   -> the workflow then deploys and live-checks; `settle` re-runs the tests on main and reverts an agent commit that broke them.
// Every step records its outcome on the issue; a failed attempt never changes main.
//   node tools/agent.mjs run [--issue N] [--dry]     node tools/agent.mjs settle
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { complete } from '../ps/llm.js';

export const LABEL = 'agent-task';
export const TRUSTED = ['OWNER', 'MEMBER', 'COLLABORATOR'];
export const PROBES = ['npm test'];  // the only commands an issue may name as its closing probe
// Where the agent may write. Rules, workflows, vendored core, deploy tooling and this file are protected: a change there needs a person.
export const SCOPE = ['worker/src/*', 'worker/src/**/*', 'ps/*', 'test/*', 'org/*', 'ux/*'];
export const DENY = ['vendor/*', '.github/*', 'AGENTS.md', 'CLAUDE.md', 'package.json', 'tenancy.json', 'tools/*', 'LICENSE', 'worker/migrations/*', 'ps/access.mjs'];
const glob = g => new RegExp('^' + g.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*\*/g, '\u0000').replace(/\*/g, '[^/]*').replace(/\u0000/g, '.*') + '$');
export const allowed = p => !isAbsolute(p) && !p.split('/').includes('..') && SCOPE.some(g => glob(g).test(p)) && !DENY.some(g => glob(g).test(p));

export function parseTask(body = '') {
  const line = k => { const m = new RegExp('^' + k + ':\\s*(.+)$', 'mi').exec(body); return m ? m[1].trim() : ''; };
  const paths = line('paths').split(/[,\s]+/).filter(Boolean);
  const probe = line('probe') || 'npm test';
  return { paths, probe: PROBES.includes(probe) ? probe : 'npm test' };
}

export function pickIssue(issues, { only } = {}) {
  const ok = issues.filter(i => !i.pull_request && (i.labels || []).some(l => (l.name || l) === LABEL) && TRUSTED.includes(i.author_association)
    && !(i.labels || []).some(l => ['agent-failed', 'agent-working'].includes(l.name || l)));
  if (only) return ok.find(i => i.number === Number(only)) || null;
  return ok.sort((a, b) => a.number - b.number)[0] || null;
}

const clip = (s, n) => (s.length > n ? s.slice(0, n) + '\n/* ...truncated... */' : s);
export function buildPrompt(issue, files) {
  const task = parseTask(issue.body);
  return `You are a careful JavaScript engineer changing a small Cloudflare Worker repository (ES modules, node:test). Implement the issue below.
Answer with ONE JSON object and nothing else: {"summary": "...", "edits": [ {"path": "...", "find": "exact unique text to replace", "replace": "new text"} , {"path": "new/file.js", "content": "entire new file"} ]}.
Rules: only write paths under worker/src, ps, test, org or ux. Every "find" must occur exactly once in the current file. Every source file starts with the two SPDX header lines. Add or update a test in test/ that runs under \`node --test\`. Do not invent facts or numbers: data comes from cited sources or live APIs, and a missing source is reported as missing.

ISSUE #${issue.number}: ${issue.title}
${issue.body}

CURRENT FILES:
${files.map(f => `--- ${f.path}\n${clip(f.text, 9000)}`).join('\n')}`;
}

export function parseEdits(text) {
  const m = /\{[\s\S]*\}/.exec(String(text).replace(/^```(?:json)?|```$/gm, ''));
  if (!m) throw new Error('no JSON in model answer');
  const j = JSON.parse(m[0]);
  if (!Array.isArray(j.edits) || !j.edits.length) throw new Error('no edits');
  return { summary: String(j.summary || ''), edits: j.edits };
}

// Applies edits under the scope allowlist. Throws without writing anything when any edit is out of scope or does not apply.
export function applyEdits(edits, root, fs = { read: p => readFileSync(p, 'utf8'), write: (p, t) => { mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, t); }, exists: existsSync }) {
  const next = new Map();
  for (const e of edits) {
    if (!e || typeof e.path !== 'string' || !allowed(e.path)) throw new Error(`path not allowed: ${e && e.path}`);
    const abs = resolve(root, e.path);
    if (relative(root, abs).startsWith('..')) throw new Error('path escapes the repository');
    if (typeof e.content === 'string') { next.set(abs, e.content); continue; }
    const cur = next.has(abs) ? next.get(abs) : fs.exists(abs) ? fs.read(abs) : null;
    if (cur == null) throw new Error(`no such file: ${e.path}`);
    const n = e.find ? cur.split(e.find).length - 1 : 0;
    if (n !== 1) throw new Error(`find text occurs ${n} times in ${e.path}`);
    next.set(abs, cur.replace(e.find, () => String(e.replace ?? '')));
  }
  for (const [abs, t] of next) fs.write(abs, t);
  return [...next.keys()].map(a => relative(root, a));
}

const sh = (cmd, args, o = {}) => execFileSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...o });
const gh = (...a) => sh('gh', a);
const note = (n, text) => { try { gh('issue', 'comment', String(n), '--body', text + '\n\n_Free code agent run, GitHub Models route._'); } catch (e) { console.error('comment failed', e.message); } };

export async function run({ issueNo, dry = false, root = process.cwd(), env = process.env } = {}) {
  const issues = JSON.parse(gh('api', `repos/${env.GITHUB_REPOSITORY}/issues?state=open&labels=${LABEL}&per_page=50`));
  const issue = pickIssue(issues, { only: issueNo });
  if (!issue) { console.log(JSON.stringify({ picked: null })); return { picked: null }; }
  const { paths } = parseTask(issue.body);
  const files = paths.filter(allowed).filter(p => existsSync(resolve(root, p))).map(p => ({ path: p, text: readFileSync(resolve(root, p), 'utf8') }));
  const prompt = buildPrompt(issue, files);
  const res = await complete({ secrets: { GITHUB_MODELS_TOKEN: env.GITHUB_TOKEN, ANTHROPIC_API_KEY: env.ANTHROPIC_API_KEY }, prompt, maxTokens: 6000 });
  const fail = (why) => { console.log(JSON.stringify({ issue: issue.number, ok: false, why })); if (!dry) { try { gh('issue', 'edit', String(issue.number), '--add-label', 'agent-failed'); } catch (e) { console.error(e.message); } note(issue.number, `Attempt failed, main unchanged: ${why}. Remove the \`agent-failed\` label to retry.`); } return { issue: issue.number, ok: false, why }; };
  if (!res.ok) return fail(`no model route answered (${(res.tried || []).join('; ') || 'none configured'})`);
  let plan, changed;
  try { plan = parseEdits(res.text); changed = applyEdits(plan.edits, root); } catch (e) { return fail(String(e.message)); }
  try { sh('npm', ['test'], { cwd: root, maxBuffer: 1 << 26 }); } catch (e) { sh('git', ['checkout', '--', '.'], { cwd: root }); sh('git', ['clean', '-fdq', 'worker', 'ps', 'test', 'org', 'ux'], { cwd: root }); return fail('tests failed after the change: ' + String(e.stdout || e.message).split('\n').filter(l => /not ok|fail|Error/i.test(l)).slice(0, 4).join(' | ')); }
  if (dry) { console.log(JSON.stringify({ issue: issue.number, ok: true, dry: true, changed })); return { issue: issue.number, ok: true, changed }; }
  const branch = `agent/${issue.number}-${issue.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 30).replace(/-$/, '')}`;
  sh('git', ['config', 'user.name', 'practical-solutions-agent']); sh('git', ['config', 'user.email', 'agent@users.noreply.github.com']);
  sh('git', ['checkout', '-b', branch]); sh('git', ['add', ...changed]);
  sh('git', ['commit', '-m', `Agent: ${issue.title} (#${issue.number})\n\nItem: #${issue.number}\nAuthor: free code agent (${res.model}); the reviewer is the test suite and the live check after deploy.`]);
  let how = 'merged via pull request';
  try {
    sh('git', ['push', '-u', 'origin', branch]);
    const url = gh('pr', 'create', '--base', 'main', '--head', branch, '--title', `Agent: ${issue.title}`, '--body', `Item: #${issue.number}\nAuthor: free code agent (${res.model})\nReviewer: \`npm test\` before the push, the live check after deploy.\nEvidence: ${plan.summary}`).trim();
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

// Re-runs the tests on main; if an agent commit broke them, reverts it and reopens its issue.
export function settle({ root = process.cwd(), force = false } = {}) {
  if (!force) try { sh('npm', ['test'], { cwd: root, maxBuffer: 1 << 26 }); console.log(JSON.stringify({ settled: 'kept' })); return 'kept'; } catch { /* fall through to the revert */ }
  const sub = sh('git', ['log', '-1', '--format=%s']).trim(), m = /^Agent: .*\(#(\d+)\)/.exec(sub);
  if (!m) { console.log(JSON.stringify({ settled: 'failing', why: 'head is not an agent commit' })); process.exitCode = 1; return 'failing'; }
  sh('git', ['revert', '--no-edit', 'HEAD']); sh('git', ['push', 'origin', 'HEAD:main']);
  gh('issue', 'reopen', m[1]); gh('issue', 'edit', m[1], '--add-label', 'agent-failed'); note(m[1], 'The tests failed on main after this change, so it was reverted.');
  console.log(JSON.stringify({ settled: 'reverted', issue: Number(m[1]) })); return 'reverted';
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [cmd, ...rest] = process.argv.slice(2), i = rest.indexOf('--issue');
  if (cmd === 'run') await run({ issueNo: i >= 0 ? rest[i + 1] : undefined, dry: rest.includes('--dry') });
  else if (cmd === 'settle') settle({ force: rest.includes('--force') });
  else { console.error('usage: agent.mjs run [--issue N] [--dry] | settle'); process.exit(2); }
}
