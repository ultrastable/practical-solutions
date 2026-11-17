// SPDX-License-Identifier: LicenseRef-Ultrastable-USL-1.0
// Copyright (c) 2026 Rowan Brad Quni-Gudzinas. Non-commercial use free; commercial use requires a license. See LICENSE.
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseGroupSeries, rankLevels } from '../worker/src/levels.js';

const P = [{ id: 'water', title: 'Water', domain: 'Water', unit: '%', lower: false, target: 100, target_src: 'SDG 6.1' }, { id: 'u5', title: 'Under five', domain: 'Child health', unit: 'per 1,000', lower: true, target: 25, target_src: 'SDG 3.2' }, { id: 'none', title: 'No data', domain: 'X', unit: '', lower: true, target: 1 }];
const row = (g, iso2, v, d) => ({ countryiso3code: g, country: { id: iso2 }, value: v, date: d });

test('group aggregates parse by code or by 2-letter id, newest first', () => {
  const s = parseGroupSeries([{}, [row('LIC', 'XM', 40, '2020'), row('LIC', 'XM', 45, '2022'), { countryiso3code: '', country: { id: 'XD' }, value: 99, date: '2022' }, row('', 'ZZ', 1, '2022')]]);
  assert.deepEqual(s.LIC.map(r => r.year), [2022, 2020]); assert.equal(s.HIC[0].value, 99);
});

test('each income group gets its own ranking; the same gap ranks differently per group', () => {
  const series = { water: { LIC: [{ year: 2022, value: 40 }], HIC: [{ year: 2022, value: 98 }] }, u5: { LIC: [{ year: 2022, value: 60 }], HIC: [{ year: 2022, value: 5 }] }, none: null };
  const r = rankLevels(P, series);
  assert.deepEqual(r.low.ranked.map(x => x.id), ['water', 'u5']);   // gaps .60 and .58
  assert.equal(r.high.ranked[0].id, 'water'); assert.equal(r.high.ranked.find(x => x.id === 'u5').shortfall, 0);
  assert.ok(r.low.unranked.some(x => x.id === 'none') && r['lower-middle'].ranked.length === 0);
});
