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
