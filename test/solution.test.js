// SPDX-License-Identifier: LicenseRef-Ultrastable-USL-1.0
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeBrief, renderBrief } from '../ps/brief.js';
import { FAILURE_MODES } from '../ps/failure_modes.js';

const cfg = JSON.parse(readFileSync(new URL('../org/problems.json', import.meta.url))).find(p => p.id === 'child-survival');

test('a brief leads with an implementable solution; the place is only evidence', () => {
  const spot = { id: 'XX', name: 'Place', z: 2.5, stability: 0.9, observed: 10, expected: 20, peers: ['A'], practices: [{ key: 'SH.IMM.IDPT', effect: 1.2 }] };
  const ds = { higherIsBetter: false, contextKeys: ['gdp'], units: [1, 2, 3] };
  const md = renderBrief(makeBrief({ id: 'child-survival', title: cfg.title, config: cfg }, ds, spot, 'h'));
  assert.match(md.split('\n')[0], /^# Solution brief: Routine childhood immunization/);
  assert.match(md, /Cheapest first test/);
  assert.match(md, /Evidence case \(a place, not the solution\)/);
});

test('every failure mode names a root cause and a closing probe', () => {
  assert.equal(FAILURE_MODES.length, 5);
  for (const fm of FAILURE_MODES) { assert.match(fm.name, /root cause/); assert.ok(fm.contract.closing_probe); }
});
