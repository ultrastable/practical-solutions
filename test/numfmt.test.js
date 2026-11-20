// SPDX-License-Identifier: LicenseRef-Ultrastable-USL-1.0
// Copyright (c) 2026 Rowan Brad Quni-Gudzinas. Non-commercial use free; commercial use requires a license. See LICENSE.
// NUMFMT-1: numbers are rounded to what can be believed, and no page, feed or card publishes false precision. Direction rule audited on known titles.
import test from 'node:test';
import assert from 'node:assert/strict';
import { figure, pct, count, sig, rate, machine, unitOf, falsePrecision } from '../worker/src/numfmt.js';
import { classify, measure } from '../ps/problemscan.js';
import { SCAN } from '../worker/src/problem-scan.gen.js';
import { route } from '../worker/src/site.js';
import { buildCatalog } from '../worker/src/catalog.js';
import { SOLUTIONS } from '../worker/src/solutions.js';

test('percentages are whole numbers, one decimal below 10', () => { assert.equal(pct(82.0999908447266), '82%'); assert.equal(pct(27.9879394), '28%'); assert.equal(pct(4.26), '4.3%'); assert.equal(pct(0.04), '0.0%'); });
test('counts use two or three significant figures and a unit word', () => {
  assert.equal(count(1000000), '1.0 million'); assert.equal(count(1300000), '1.3 million'); assert.equal(count(12345678), '12 million'); assert.equal(count(123456789), '123 million'); assert.equal(count(82000), '82 thousand'); assert.equal(count(2.5e9), '2.5 billion'); assert.equal(count(1234), '1,200'); assert.equal(count(37.2412), '37.2');
});
test('values carry the unit their title names, rounded', () => {
  assert.equal(figure(82.0999908447266, 'Trained teachers in secondary education, female (% of female teachers)'), '82%');
  assert.equal(figure(37.2418, 'Mortality rate, under-5 (per 1,000 live births)'), '37.2 per 1,000 live births');
  assert.equal(figure(1000000, 'Estimated number of pregnant women needing antiretrovirals'), '1.0 million');
  assert.equal(figure(1234, 'Exclusive breastfeeding under six months (in thousands)'), '1.2 million');
  assert.equal(unitOf('Estimated road traffic death rate (per 100 000 population)').label, 'per 100,000 population');
  assert.equal(figure(null, 'x'), '');
});
test('a rate of change is readable and honest about direction', () => { assert.equal(rate(Math.log(0.95)), 'down 5.0% a year'); assert.equal(rate(Math.log(1.2)), 'up 20% a year'); assert.match(rate(0.0001), /^flat/); });
test('machine values drop float noise', () => { assert.equal(machine(82.0999908447266), 82.1); assert.equal(machine(0.123456789), 0.123457); });

test('direction rule: needs are burdens, coverage should rise, parity is not a direction', () => {
  const dir = t => { const c = classify(t); return c ? c.lower : 'none'; };
  assert.equal(dir('Estimated number of pregnant women living with HIV needing antiretrovirals for preventing mother-to-child transmission'), true);
  assert.equal(dir('Estimated number of children needing antiretroviral therapy based on WHO methods'), true);
  assert.equal(dir('Reported number of children receiving antiretroviral therapy'), false);
  assert.equal(dir('Tuberculosis treatment coverage (%)'), false);
  assert.equal(dir('Mortality rate, under-5 (per 1,000 live births)'), true);
  assert.equal(dir('Number of new HIV infections'), true);
  assert.equal(dir('Unmet need for contraception (% of married women ages 15-49)'), true);
  assert.equal(dir('School enrollment, primary (gross), gender parity index (GPI)'), 'none');
  assert.equal(dir('Number of parties to international multilateral environmental agreements on hazardous waste'), 'none');
  const fell = measure([{ year: 2025, value: 1.0e6 }, { year: 2015, value: 1.3e6 }], { lower: true });
  assert.equal(fell.status, 'improving', 'a falling burden is improving, not getting worse');
});
test('every published entry carries a direction that agrees with its own two figures', () => {
  for (const e of SCAN.entries) { if (!e.m || e.m.base == null || e.m.pace == null) continue; const fell = e.m.value < e.m.base; if (e.lower === true && fell) assert.notEqual(e.m.status, 'getting worse', e.id); if (e.lower === true && !fell && e.m.value > e.m.base) assert.notEqual(e.m.status, 'improving', e.id); }
});
test('no page the site serves shows false precision (raw floats, unseparated long integers)', async () => {
  const c = buildCatalog({ problems: null, solutions: SOLUTIONS }), u = p => new URL('https://x.test' + p);
  const paths = ['/', '/catalogue', '/catalogue?domain=health', '/problems', '/solutions', '/domains', '/impact', '/method', '/unknowns', '/country', '/compare', '/releases', '/about', '/api', ...SCAN.entries.slice(0, 80).map(e => '/catalogue/' + e.id), ...c.probs.slice(0, 20).map(p => '/problems/' + p.id), ...c.sols.slice(0, 40).map(s => '/solutions/' + s.id)];
  const bad = [];
  for (const p of paths) { const r = route(u(p), c); if (!r || !/html/.test(r.headers.get('content-type') || '')) continue; const f = falsePrecision(await r.text()); if (f) bad.push({ p, ...f }); }
  assert.ok(bad.length === 0, JSON.stringify(bad.slice(0, 5)));
});
