// SPDX-License-Identifier: LicenseRef-Ultrastable-USL-1.0
// BRANCH-SWEEP-1: every feature branch is merged to main automatically and deleted once merged. No secret is read: the platform token is used by `gh`.
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const PROTECTED = new Set(["main"]);

// Pure planner. branches: [{name, ahead, prs:[{number, state, mergeStateStatus}]}]. Returns ordered actions.
export function plan(branches) {
  const actions = [];
  for (const b of branches) {
    if (PROTECTED.has(b.name)) continue;
    const open = (b.prs || []).find((p) => p.state === "OPEN");
    if (b.ahead === 0) { actions.push({ do: "delete", branch: b.name, why: "fully merged into main" }); continue; }
    if (!open) { actions.push({ do: "open-pr", branch: b.name, why: `${b.ahead} commit(s) ahead of main, no open PR` }); continue; }
    if (open.mergeStateStatus === "CLEAN") actions.push({ do: "merge", branch: b.name, pr: open.number, why: "checks green" });
    else actions.push({ do: "wait", branch: b.name, pr: open.number, why: `merge state ${open.mergeStateStatus}` });
  }
  return actions;
}

export function ghRunner(repo) {
  const gh = (...a) => execFileSync("gh", a, { encoding: "utf8" });
  const json = (...a) => JSON.parse(gh(...a));
  return {
    branches() {
      return gh("api", `repos/${repo}/branches?per_page=100`, "--paginate", "--jq", ".[].name").split(/\s+/).filter(Boolean);
    },
    ahead: (n) => json("api", `repos/${repo}/compare/main...${encodeURIComponent(n)}`).ahead_by,
    prs: (n) => json("pr", "list", "--repo", repo, "--head", n, "--state", "all", "--json", "number,state,mergeStateStatus"),
    openPr: (n) => gh("pr", "create", "--repo", repo, "--head", n, "--base", "main", "--title", `auto: merge ${n}`, "--body", "BRANCH-SWEEP-1: opened automatically for a branch ahead of main."),
    merge: (num) => gh("pr", "merge", String(num), "--repo", repo, "--squash", "--delete-branch"),
    del: (n) => gh("api", "-X", "DELETE", `repos/${repo}/git/refs/heads/${n}`),
  };
}

export function run(repo, io = ghRunner(repo), log = console.log) {
  const rows = io.branches().filter((n) => !PROTECTED.has(n)).map((name) => ({ name, ahead: io.ahead(name), prs: io.prs(name) }));
  const actions = plan(rows);
  for (const a of actions) {
    try {
      if (a.do === "delete") io.del(a.branch);
      else if (a.do === "open-pr") io.openPr(a.branch);
      else if (a.do === "merge") io.merge(a.pr);
      log(`${a.do} ${a.branch}${a.pr ? ` #${a.pr}` : ""}: ${a.why}`);
    } catch (e) { log(`FAILED ${a.do} ${a.branch}: ${String(e.message).split("\n")[0]}`); }
  }
  return actions;
}

if (import.meta.url === pathToFileURL(process.argv[1] || "").href) run(process.argv[2] || process.env.GITHUB_REPOSITORY);
