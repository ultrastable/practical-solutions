// SPDX-License-Identifier: LicenseRef-Ultrastable-USL-1.0
// Copyright (c) 2026 Rowan Brad Quni-Gudzinas. Non-commercial use free; commercial use requires a license. See LICENSE.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildAdjust, costMultiplier, ADJUST_SERIES, groupMedian } from '../worker/src/adjust.js';
import { originOf, adjustedContext } from '../worker/src/bca.js';
import { refresh } from '../tools/refresh_context.mjs';

const adjust = buildAdjust({ price_level: { LIC: [{ year: 2023, value: 0.3 }], HIC: [{ year: 2023, value: 0.9 }] }, gni_pc: { LMC: [{ year: 2023, value: 2500 }] } });

test('each per-group figure carries its World Bank citation; a group with no figure gets none', () => {
  assert.equal(adjust.low.price_level.value, 0.3);
  assert.equal(adjust.low.price_level.cite, ADJUST_SERIES.price_level.cite);
  assert.equal(adjust['lower-middle'].gni_pc.value, 2500);
  assert.equal(adjust['upper-middle'], undefined);
});

test('cost scales by the ratio of price levels; missing figures leave the cost as measured', () => {
  const m = costMultiplier(adjust, 'low', 'high');
  assert.ok(Math.abs(m.value - 3) < 1e-9);
  assert.match(m.why, /PA\.NUS\.PPPC\.RF/);
  assert.equal(costMultiplier(adjust, 'low', 'upper-middle'), null);
  assert.equal(costMultiplier(adjust, 'low', 'low'), null);
});

test('benefit-cost contexts take the multiplier from the model origin', () => {
  assert.equal(originOf('chlorine'), 'low');
  assert.ok(Math.abs(adjustedContext('chlorine', { id: 'high', label: 'High' }, adjust).cost_multiplier - 3) < 1e-9);
  assert.equal(adjustedContext('chlorine', { id: 'upper-middle' }, adjust).cost_multiplier, undefined);
  assert.equal(originOf('nope'), null);
});

test('the refresh fetches both cited series per group and keeps old figures when one fails', async () => {
  const wb = (g, v) => [{}, [{ countryiso3code: g, country: { id: g }, date: '2023', value: v }]];
  const f = async url => {
    if (url.includes('PA.NUS.PPPC.RF')) return { ok: true, json: async () => [{}, [{ countryiso3code: 'AAA', date: '2023', value: 0.3 }, { countryiso3code: 'BBB', date: '2022', value: 0.32 }]] };
    if (url.includes('NY.GNP.PCAP.CD')) return { ok: false, status: 502 };
    return { ok: false, status: 500 };
  };
  const out = await refresh({ fetch: f, prev: { countries: { AAA: { iso3: 'AAA', level: 'low' }, BBB: { iso3: 'BBB', level: 'low' } }, levels: {}, adjust: { 'lower-middle': { gni_pc: { value: 2400, year: 2022, cite: 'x' } } } } });
  assert.ok(Math.abs(out.adjust.low.price_level.value - 0.31) < 1e-9, 'median of the two low-income members');
  assert.equal(out.adjust['lower-middle'].gni_pc.value, 2400);
  assert.match(out.sources['adjust.gni_pc'], /failed/);
});

test('a group price level is the median of its member countries', () => {
  const m = groupMedian({ A: { v: 0.2, year: 2022 }, B: { v: 0.5, year: 2023 }, C: { v: 0.3, year: 2023 }, D: { v: 0.9, year: 2023 } }, [{ iso3: 'A', level: 'low' }, { iso3: 'B', level: 'low' }, { iso3: 'C', level: 'low' }, { iso3: 'D', level: 'high' }, { iso3: 'E', level: 'high' }]);
  assert.deepEqual(m.LIC, [{ value: 0.3, year: 2023, n: 3 }]);
  assert.deepEqual(m.HIC, [{ value: 0.9, year: 2023, n: 1 }]);
  assert.equal(m.UMC, undefined);
});
