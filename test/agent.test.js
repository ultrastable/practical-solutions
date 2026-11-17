// SPDX-License-Identifier: LicenseRef-Ultrastable-USL-1.0
// Copyright (c) 2026 Rowan Brad Quni-Gudzinas. Non-commercial use free; commercial use requires a license. See LICENSE.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { allowed, parseTask, pickIssue, parseEdits, applyEdits, buildPrompt } from '../tools/agent.mjs';

test('the agent may write product code and tests, never rules, workflows, vendor or its own tool', () => {
  for (const p of ['worker/src/pages.js', 'ps/llm.js', 'test/x.test.js', 'org/problems.json']) assert.ok(allowed(p), p);
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
