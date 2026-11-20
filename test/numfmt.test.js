// SPDX-License-Identifier: LicenseRef-Ultrastable-USL-1.0
// Copyright (c) 2026 Rowan Brad Quni-Gudzinas. Non-commercial use free; commercial use requires a license. See LICENSE.
// NUMFMT-1: numbers are rounded to what can be believed, and no page, feed or card publishes false precision. Direction rule audited on known titles.
import test from 'node:test';
import assert from 'node:assert/strict';
import { figure, pct, count, sig, rate, machine, unitOf, falsePrecision } from '../worker/src/numfmt.js';
import { classify, measure } from '../ps/problemscan.js';
import { SCAN } from '../worker/src/problem-scan.gen.js';
import { route, sitemap } from '../worker/src/site.js';
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
  assert.equal(dir('Reported number of children receiving antiretroviral therapy'), null, 'a service count has no trusted direction');
  assert.equal(dir('Tuberculosis treatment coverage (%)'), false);
  assert.equal(dir('Mortality rate, under-5 (per 1,000 live births)'), true);
  assert.equal(dir('Number of new HIV infections'), true);
  assert.equal(dir('Unmet need for contraception (% of married women ages 15-49)'), true);
  assert.equal(dir('School enrollment, primary (gross), gender parity index (GPI)'), 'none');
  assert.equal(dir('Number of parties to international multilateral environmental agreements on hazardous waste'), 'none');
  const fell = measure([{ year: 2025, value: 1.0e6 }, { year: 2015, value: 1.3e6 }], { lower: true });
  assert.equal(fell.status, 'improving', 'a falling burden is improving, not getting worse');
});
const KNOWN = [ // [title, better]: true = lower is better, false = higher is better, null = not clear from the wording
  ['Electricity production from oil, gas and coal sources (% of total)', true], ['Estimated number of children needing antiretroviral therapy based on WHO methods', true], ['Trained teachers in upper secondary education (% of total teachers)', false],
  ['Mortality rate, under-5 (per 1,000 live births)', true], ['Prevalence of undernourishment (% of population)', true], ['Estimated malaria incidence (per 1000 population at risk)', true], ['Number of new HIV infections', true],
  ['Tuberculosis incidence (per 100,000 people)', true], ['Suicide mortality rate (per 100,000 population)', true], ['Prevalence of anemia among women of reproductive age (% of women ages 15-49)', true], ['Out-of-school children of primary school age', true],
  ['Repeaters, primary, total (% of total enrollment)', true], ['Pupils below minimum reading proficiency at end of primary (%)', true], ['Lifetime risk of maternal death (%)', true], ['Unmet need for contraception (% of married women ages 15-49)', true],
  ['Electricity production from coal sources (% of total)', true], ['Electricity production from oil, gas and coal sources (% of total)', true], ['Estimated number of pregnant women living with HIV needing antiretrovirals for preventing mother-to-child transmission', true],
  ['Carbon dioxide (CO2) emissions (total) excluding LULUCF (Mt CO2e)', true], ['Internally displaced people (IDP) by country or territory of asylum / origin', true], ['Overweight prevalence among children under 5 years of age (%)', true],
  ['Immunization, DPT (% of children ages 12-23 months)', false], ['Access to electricity (% of population)', false], ['Individuals using the Internet (% of population)', false], ['Life expectancy at birth, total (years)', false], ['Primary completion rate, total (% of relevant age group)', false],
  ['Births attended by skilled health staff (% of total)', false], ['Tuberculosis treatment success rate (% of new cases)', false], ['Antiretroviral therapy coverage (% of people living with HIV)', false], ['Contraceptive prevalence, any method (% of married women ages 15-49)', false],
  ['Trained teachers in secondary education (% of total teachers)', false], ['Proportion of seats held by women in national parliaments (%)', false], ['Lifetime risk of maternal death (1 in: rate varies by country)', false], ['New cases tested for RR-/MDR-TB (%)', false], ['Terrestrial protected areas (% of total land area)', false],
  ['Reported number of children receiving antiretroviral therapy', null], ['Electricity production from nuclear sources (% of total)', null], ['Contraceptive use and fertility: something unrelated (%)', undefined],
];
test('direction audit: known better-is-lower and better-is-higher indicators are read correctly; unclear ones are not guessed', () => {
  for (const [t, better] of KNOWN) { const c = classify(t); if (better === undefined) continue; assert.ok(c, t); assert.equal(c.lower, better, t); }
});
test('a zero baseline is new, never growth; a zero level is not divided by', () => {
  const covid = measure([{ year: 2021, value: 2.7 }, { year: 2010, value: 0 }], { lower: true, percent: true });
  assert.equal(covid.status, 'new'); assert.equal(covid.pace, null);
  const gone = measure([{ year: 2022, value: 0 }, { year: 2012, value: 5 }], { lower: true });
  assert.equal(gone.status, 'improving');
  assert.equal(measure([{ year: 2022, value: 0 }, { year: 2012, value: 0 }], { lower: true }).pace, null);
  const unclear = measure([{ year: 2025, value: 81 }, { year: 2015, value: 27 }], { lower: null, percent: true });
  assert.equal(unclear.status, 'changing'); assert.equal(unclear.dir, 'up');
  assert.equal(measure([{ year: 2025, value: 81 }, { year: 2015, value: 27 }], { lower: false, percent: true }).status, 'improving');
});
test('every published entry agrees with the rules now and with its own two figures', () => {
  for (const e of SCAN.entries) {
    if (e.rule !== 'taxonomy') { const c = classify(e.title); assert.ok(c, e.id + ' is no longer read as a problem'); assert.equal(e.lower, c.lower, e.id + ' direction is stale'); }
    const m = e.m; if (!m) continue;
    if (e.lower == null && m.status !== 'no trend yet' && m.status !== 'new') assert.ok(['changing', 'little change'].includes(m.status), e.id + ' guessed a direction: ' + m.status);
    if (m.status === 'new') assert.ok(!(m.base > 0), e.id);
    if (m.base == null || !(m.base > 0) || e.lower == null) continue;
    const up = m.value > m.base, down = m.value < m.base;
    if (m.status === 'getting worse') assert.ok(e.lower ? up : down, e.id + ' says worse but moved the other way');
    if (m.status === 'improving') assert.ok(e.lower ? down : up, e.id + ' says improving but moved the other way');
  }
});
test('no page in the sitemap shows false precision (raw floats, unseparated long integers)', async () => {
  const c = buildCatalog({ problems: null, solutions: SOLUTIONS }), u = p => new URL('https://x.test' + p);
  const paths = [...sitemap(c, 'https://x.test').matchAll(/<loc>https:\/\/x\.test([^<]*)<\/loc>/g)].map(m => m[1].replace(/&amp;/g, '&')), extra = ['/catalogue?domain=health', '/catalogue?trend=changing', '/catalogue?page=2'];
  assert.ok(paths.length > 800, 'every sitemap page is checked: ' + paths.length);
  paths.push(...extra);
  const bad = [];
  for (const p of paths) { const r = route(u(p), c); if (!r || !/html/.test(r.headers.get('content-type') || '')) continue; const f = falsePrecision(await r.text()); if (f) bad.push({ p, ...f }); }
  assert.ok(bad.length === 0, JSON.stringify(bad.slice(0, 5)));
});
