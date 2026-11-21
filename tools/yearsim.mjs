// SPDX-License-Identifier: LicenseRef-Ultrastable-USL-1.0
// YEARSIM-1 (tenant side): a 365-day fake-clock run of the Practical Solutions loop (bin/ps.mjs simulate) plus a check that every scheduled workflow
// would fire through a simulated year and honours the halt. Writes ops/yearsim.json, which the Ultrastable year simulation reads.
// Labels: the criticality run is REAL code on a SYNTHETIC world with no model, so C9 (a real model role ran) cannot pass here and is reported as expected;
// the cadence check reads the workflow files only (it does not observe GitHub firing them).
import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { pathToFileURL } from "node:url";

// Fires per 365 days for a five-field cron, enough for the shapes used here: minute hour dom month dow.
export function firesPerYear(cron) {
  const [, h, dom, mon, dow] = cron.trim().split(/\s+/);
  const n = (f, max) => f === "*" ? max : f.startsWith("*/") ? Math.floor(max / Number(f.slice(2))) + (max % Number(f.slice(2)) ? 1 : 0) : f.split(",").length;
  const perDay = n(h, 24);
  const days = dow !== "*" ? 52 * n(dow, 7) : dom !== "*" ? 12 * n(dom, 31) : 365;
  return perDay * days * (mon === "*" ? 1 : n(mon, 12) / 12);
}

export function cadence(dir = ".github/workflows") {
  const out = [];
  for (const f of readdirSync(dir).filter(x => x.endsWith(".yml"))) {
    const t = readFileSync(`${dir}/${f}`, "utf8");
    const crons = [...t.matchAll(/cron:\s*['"]([^'"]+)['"]/g)].map(m => m[1]);
    if (!crons.length) continue;
    out.push({ workflow: f, fires_per_year: Math.round(crons.reduce((a, c) => a + firesPerYear(c), 0)), halt: /vars\.HALT/.test(t), timeout: /timeout-minutes/.test(t), concurrency: /concurrency/.test(t) });
  }
  return out;
}

export function run() {
  // the simulate command exits 1 when the loop is not yet critical; that is a result, not a crash
  const raw = spawnSync("node", ["--no-warnings", "bin/ps.mjs", "simulate", "--days", "365"], { encoding: "utf8", maxBuffer: 1 << 26 }).stdout;
  const notes = /trust: skipped, ([^;]+)/.exec(raw);
  const rep = JSON.parse(raw.slice(raw.indexOf("\n{") + 1));
  const expected = { C9: "the simulated world has no model; a real model role is observed only in the live loops (modelprobe)" };
  const checks = rep.tests.map(c => ({ id: c.id, name: c.name, status: c.status, value: c.value, ...(c.status === "fail" && expected[c.id] ? { expected_fail: expected[c.id] } : {}) }));
  const cad = cadence();
  const bad = cad.filter(c => !c.halt || !c.timeout || !c.concurrency || c.fires_per_year < 1);
  const fails = checks.filter(c => c.status === "fail" && !c.expected_fail).map(c => c.id);
  return { at: new Date().toISOString(), days: 365, labels: { criticality: "REAL code, SYNTHETIC world, no model", cadence: "read from workflow files; GitHub firing is not observed" },
    checks, cadence: cad, cadence_defects: bad.map(b => b.workflow), unexpected_fails: fails, notes: notes ? ["trust step skipped in the simulation: " + notes[1].slice(0, 120)] : [], ok: !fails.length && !bad.length };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const r = run(); mkdirSync("ops", { recursive: true }); writeFileSync("ops/yearsim.json", JSON.stringify(r, null, 1) + "\n");
  console.log(JSON.stringify({ ok: r.ok, unexpected_fails: r.unexpected_fails, cadence_defects: r.cadence_defects })); process.exitCode = r.ok ? 0 : 1;
}
