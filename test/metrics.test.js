import test from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../ps/db.js';
import { createPs } from '../ps/org.js';
import { buildConfig } from '../ps/config.js';
import { synthWorld } from '../ps/synth.js';
import { detect } from '../ps/detect.js';

test('core grades a bright-spot prediction through the registered ps_residual_z metric (UPSTREAM-1)', async () => {
  const db = openDb(':memory:');
  const ds = synthWorld({ seed: 11, n: 80, epoch: 0 });
  const spot = detect(ds, { z: 1.5 }).spots[0];
  await db.prepare(`INSERT INTO ps_problems (id,title,config) VALUES ('p','P','{}')`).run();
  await db.prepare(`INSERT INTO ps_datasets (problem_id, epoch, hash, fetched_at, payload) VALUES ('p',0,'h','2026-11-01 00:00:00',?)`).bind(JSON.stringify(ds)).run();
  await db.prepare(`INSERT INTO ps_predictions (id,brief_id,problem_id,unit,klass,metric,op,target,probability,due_at) VALUES ('pred:b','b','p',?,'verified','ps_residual_z','>=',0,0.5,'2026-10-31 00:00:00')`).bind(spot.unit || spot.id).run();
  await db.prepare(`INSERT INTO predictions (id,item_id,metric,op,target,due_at) VALUES ('core:pred:b','x','ps_residual_z','>=',-99,'2026-10-31 00:00:00')`).run();
  const ps = createPs({ db, env: {}, config: buildConfig(), now: () => Date.parse('2026-11-02T00:00:00Z') });
  await ps.tick();
  const r = await db.prepare(`SELECT verdict, observed FROM predictions WHERE id='core:pred:b'`).first();
  assert.equal(r.verdict, 'hit');
  assert.ok(Number.isFinite(r.observed));
});

import { narrate, WORKERS_AI_MODEL } from '../ps/narrate.js';
test('the model role runs on an account-bound Workers AI binding with no key, and the call names its model', async () => {
  const ai = { run: async (m, body) => ({ response: `hypothesis via ${m} ${body.messages.length}` }) };
  const r = await narrate({ ai, brief: { name: 'X', problem: 'p', z: 2 } });
  assert.equal(r.ok, true);
  assert.equal(r.model, WORKERS_AI_MODEL);
  assert.equal((await narrate({ brief: {} })).called, false);
});
