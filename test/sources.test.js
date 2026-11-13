// SPDX-License-Identifier: LicenseRef-Ultrastable-USL-1.0
// Copyright (c) 2026 Rowan Brad Quni-Gudzinas. Non-commercial use free; commercial use requires a license. See LICENSE.
import test from 'node:test';
import assert from 'node:assert/strict';
import { worldBankSource } from '../ps/sources.js';
import { synthWorld } from '../ps/synth.js';
import { detect } from '../ps/detect.js';

// A fake of the World Bank API shape, built from the synthetic world, with an aggregate row and a unit missing one indicator.
function fakeApi(world, { fail } = {}) {
  const codes = { OUT: u => u.outcome, C1: u => u.context.income, C2: u => u.context.density, C3: u => u.context.age, P1: u => u.practices.p_outreach, P2: u => u.practices.p_training };
  return async url => {
    if (fail) return new Response('no', { status: 500 });
    const u = new URL(url);
    if (u.pathname.endsWith('/country')) {
      const rows = world.units.map(x => ({ id: x.id, region: { id: 'LCN' } })).concat([{ id: 'WLD', region: { id: 'NA' } }]);
      return Response.json([{ page: 1 }, rows]);
    }
    const code = u.pathname.split('/').pop();
    const f = codes[code];
    const rows = world.units.map((x, i) => ({ countryiso3code: x.id, country: { value: x.name }, date: '2022', value: code === 'C1' && i === 5 ? null : f(x) + (code === 'C1' ? 5 : 0) }));
    rows.push({ countryiso3code: 'WLD', country: { value: 'World' }, date: '2022', value: 1 });
    return Response.json([{ page: 1 }, rows]);
  };
}

test('worldBankSource builds a dataset: aggregates excluded, incomplete units dropped, transforms applied', async () => {
  const world = synthWorld({ n: 60, epoch: 0 });
  const src = worldBankSource({ fetch: fakeApi(world), outcome: { id: 'OUT', higherIsBetter: false }, context: ['C1', 'C2', 'C3'], practices: ['P1', 'P2'], transform: { C1: 'log' } });
  const ds = await src.get();
  assert.equal(ds.units.length, 59);
  assert.equal(ds.dropped, 1);
  assert.ok(!ds.units.some(u => u.id === 'WLD'));
  assert.equal(ds.higherIsBetter, false);
  assert.equal(ds.vintage, 2022);
  assert.doesNotThrow(() => detect(ds, { boot: 10 }));
});

test('an API failure is an error the loop can see, not an empty dataset', async () => {
  const world = synthWorld({ n: 30 });
  const src = worldBankSource({ fetch: fakeApi(world, { fail: true }), outcome: { id: 'OUT' }, context: ['C1', 'C2', 'C3'], practices: ['P1'] });
  await assert.rejects(src.get(), /HTTP 500/);
});
