// SPDX-License-Identifier: LicenseRef-Ultrastable-USL-1.0
import test from "node:test";
import assert from "node:assert/strict";
import { firesPerYear, cadence } from "../tools/yearsim.mjs";

test("cron fire counts", () => {
  assert.equal(firesPerYear("17 7 * * *"), 365);
  assert.equal(firesPerYear("23 5 * * 1"), 52);
  assert.equal(firesPerYear("23 4 * * 2,5"), 104);
  assert.equal(firesPerYear("41 */2 * * *") , 12 * 365);
});
test("every scheduled workflow fires in a year, honours the halt, has a timeout and a concurrency group", () => {
  const c = cadence();
  assert.ok(c.length >= 15);
  for (const w of c) assert.ok(w.fires_per_year >= 1 && w.halt && w.timeout && w.concurrency, w.workflow);
});
