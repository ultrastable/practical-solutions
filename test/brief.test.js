import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { makeBrief, renderBrief } from '../ps/brief.js';
import { CHARTER } from '../ps/charter.js';

test('a brief leads with the solution and its adoption path; the place is only evidence', () => {
  const problems = JSON.parse(readFileSync(new URL('../org/problems.json', import.meta.url), 'utf8'));
  const p = problems.find(x => x.id === 'child-survival');
  const ds = { units: [], contextKeys: ['gdp'], higherIsBetter: false, source: 't' };
  const spot = { id: 'XX', name: 'Placeville', z: 2.1, stability: 0.9, observed: 10, expected: 30, peers: ['A', 'B'], practices: [{ key: 'SH.IMM.IDPT', effect: 1.2 }] };
  const md = renderBrief(makeBrief({ id: p.id, title: p.title, config: JSON.stringify(p) }, ds, spot, 'h'), null, null);
  const lines = md.split('\n');
  assert.match(lines[0], /^# Solution brief: Routine childhood immunization/);
  for (const k of ['**Problem.**', '**Candidate solution.**', '**What implementing it takes.**', '**Who could implement it.**', '**Cheapest first test.**', '**Evidence.**', '**What this cannot show.**']) assert.ok(md.includes(k), k);
  assert.ok(md.indexOf('**Candidate solution.**') < md.indexOf('**Evidence.**'), 'solution before evidence');
  assert.equal(CHARTER.unit, 'solution');
});

test('failure modes register with valid contracts and the detectors run on the live schema', async () => {
  const { openDb } = await import('../ps/db.js');
  const { registerFailureMode, runDetectors } = await import('../vendor/ultrastable/core/kernel/failure.js');
  const { FAILURE_MODES } = await import('../ps/failure_modes.js');
  const db = openDb(':memory:');
  for (const f of FAILURE_MODES) await registerFailureMode(db, f, Date.parse('2026-12-01T00:00:00Z'));
  await runDetectors(db, { now: Date.parse('2026-12-01T01:00:00Z') });
  const hits = db.raw.prepare(`SELECT fm_id, value, fired, evidence FROM kernel_failure_mode_hits`).all();
  assert.equal(hits.length, FAILURE_MODES.length);
  assert.ok(hits.every(h => !String(h.evidence || '').startsWith('detector error')), JSON.stringify(hits.filter(h => h.evidence)));
});
