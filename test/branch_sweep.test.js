import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { plan, run } from "../tools/branch_sweep.mjs";

test("merged branches are deleted, ahead branches get a PR, green PRs merge, main is never touched", () => {
  const a = plan([
    { name: "main", ahead: 0, prs: [] },
    { name: "done", ahead: 0, prs: [] },
    { name: "new", ahead: 2, prs: [] },
    { name: "green", ahead: 1, prs: [{ number: 7, state: "OPEN", mergeStateStatus: "CLEAN" }] },
    { name: "red", ahead: 1, prs: [{ number: 8, state: "OPEN", mergeStateStatus: "BLOCKED" }] },
  ]);
  assert.deepEqual(a.map((x) => `${x.do}:${x.branch}`), ["delete:done", "open-pr:new", "merge:green", "wait:red"]);
});

test("run drives the io and survives a failing action", () => {
  const calls = [];
  const io = {
    branches: () => ["main", "done", "green"],
    ahead: (n) => (n === "done" ? 0 : 1),
    prs: (n) => (n === "green" ? [{ number: 3, state: "OPEN", mergeStateStatus: "CLEAN" }] : []),
    del: () => { throw new Error("boom"); }, openPr: (n) => calls.push(["pr", n]), merge: (n) => calls.push(["merge", n]),
  };
  const logs = [];
  run("o/r", io, (l) => logs.push(l));
  assert.deepEqual(calls, [["merge", 3]]);
  assert.match(logs[0], /FAILED delete done/);
});

test("the workflow runs the sweep on a schedule and after CI, with the platform token only", () => {
  const w = readFileSync(new URL("../.github/workflows/branch-sweep.yml", import.meta.url), "utf8");
  assert.match(w, /branch_sweep\.mjs/);
  assert.match(w, /schedule:/);
  assert.match(w, /workflow_run/);
  assert.match(w, /github\.token/);
});

test("a merge dispatches the deploy once; a sweep with no merge does not; a failing dispatch is logged, not thrown (SWEEP-DEPLOY-1)", () => {
  const mk = (rows, deploy) => ({ branches: () => rows.map((r) => r.name), ahead: (n) => rows.find((r) => r.name === n).ahead, prs: (n) => rows.find((r) => r.name === n).prs, openPr() {}, merge() {}, del() {}, deploy });
  const green = [{ name: "a", ahead: 1, prs: [{ number: 1, state: "OPEN", mergeStateStatus: "CLEAN" }] }, { name: "b", ahead: 2, prs: [{ number: 2, state: "OPEN", mergeStateStatus: "CLEAN" }] }];
  let n = 0; const logs = [];
  run("o/r", mk(green, () => { n++; }), (l) => logs.push(l));
  assert.equal(n, 1); assert.ok(logs.some((l) => l.startsWith("deploy dispatched after 2")));
  n = 0; run("o/r", mk([{ name: "c", ahead: 1, prs: [{ number: 3, state: "OPEN", mergeStateStatus: "BLOCKED" }] }], () => { n++; }), () => {});
  assert.equal(n, 0);
  const l2 = []; run("o/r", mk(green, () => { throw new Error("boom"); }), (l) => l2.push(l));
  assert.ok(l2.some((l) => l.startsWith("FAILED deploy dispatch: boom")));
  assert.match(readFileSync(new URL("../.github/workflows/branch-sweep.yml", import.meta.url), "utf8"), /actions: write/);
});

test("SWEEP-COVERED-1: a dirty branch whose files main already changed is superseded, never reopened", () => {
  const a = plan([
    { name: "stale", ahead: 2, covered: true, sha: "abc", prs: [{ number: 9, state: "OPEN", mergeStateStatus: "DIRTY" }] },
    { name: "reopened", ahead: 2, covered: true, sha: "def", prs: [{ number: 5, state: "CLOSED" }] },
    { name: "fresh", ahead: 1, covered: false, prs: [] },
  ]);
  assert.deepEqual(a.map((x) => `${x.do}:${x.branch}`), ["supersede:stale", "supersede:reopened", "open-pr:fresh"]);
});
