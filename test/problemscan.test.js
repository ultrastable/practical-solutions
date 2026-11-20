// SPDX-License-Identifier: LicenseRef-Ultrastable-USL-1.0
// Copyright (c) 2026 Rowan Brad Quni-Gudzinas. Non-commercial use free; commercial use requires a license. See LICENSE.
// PROBLEM-SCAN-1: the rule that reads indicator wording, the pace ranking, the scan over fake sources, and the pages built from its output.
import test from 'node:test';
import assert from 'node:assert/strict';
import { classify, measure, rank, scan, worldBank, whoCauses, unSdg, whoGho, slug } from '../ps/problemscan.js';
import { generated } from '../tools/problemscan.mjs';
import { indexPage, entryPage, indexJson, entryJson } from '../worker/src/catalogue-pages.js';
import { route } from '../worker/src/site.js';
import { buildCatalog } from '../worker/src/catalog.js';
import { SOLUTIONS } from '../worker/src/solutions.js';

test('wording decides direction: coverage should rise, harm should fall, the rest is not a problem', () => {
  assert.equal(classify('Immunization, DPT (% of children ages 12-23 months)').lower, false);
  assert.equal(classify('Mortality rate, under-5 (per 1,000 live births)').lower, true);
  assert.equal(classify('Prevalence of undernourishment (% of population)').lower, true);
  assert.equal(classify('GDP (current US$)'), null);
  assert.equal(classify('Archived, see TOBACCO_INDICATOR'), null);
});
test('pace: growing burden ranks first, a coverage is judged by the share left out', () => {
  const worse = measure([{ year: 2022, value: 12 }, { year: 2012, value: 10 }], { lower: true });
  const better = measure([{ year: 2022, value: 5 }, { year: 2012, value: 10 }], { lower: true });
  assert.equal(worse.status, 'getting worse'); assert.equal(better.status, 'improving');
  const cov = measure([{ year: 2022, value: 90 }, { year: 2012, value: 80 }], { lower: false, percent: true });
  assert.equal(cov.status, 'improving'); assert.ok(cov.pace < 0);
  assert.equal(measure([{ year: 2022, value: 1 }], { lower: true }).pace, null);
  const r = rank([{ id: 'a', title: 'a', m: better }, { id: 'b', title: 'b', m: worse }, { id: 'c', title: 'c', m: null }]);
  assert.deepEqual(r.map(x => [x.id, x.rank]), [['b', 1], ['a', 2], ['c', null]]);
});

const json = body => ({ ok: true, status: 200, json: async () => body });
const fake = async url => {
  if (url.includes('/indicator?')) return json([{ pages: 1 }, [{ id: 'SH.DYN.MORT', name: 'Mortality rate, under-5 (per 1,000 live births)', topics: [{ value: 'Health' }], sourceNote: 'n' }, { id: 'NY.GDP.MKTP.CD', name: 'GDP (current US$)', topics: [{ value: 'Economy' }] }, { id: 'SE.PRM.CMPT.ZS', name: 'Primary completion rate (% of relevant age group)', topics: [{ value: 'Education' }] }]]);
  if (url.includes('/country/WLD/indicator/SH.DYN.MORT')) return json([{}, [{ date: '2022', value: 37 }, { date: '2012', value: 50 }]]);
  if (url.includes('/country/WLD/indicator/SE.PRM.CMPT.ZS')) return json([{}, [{ date: '2022', value: null }]]);
  if (url.includes('GHECAUSES')) return json({ value: [{ Code: 'GHECAUSES_GHE000', Title: 'All Causes' }, { Code: 'GHECAUSES_GHE020', Title: 'Tuberculosis' }] });
  if (url.includes('Indicator/List')) return json([{ code: '1.1.1', goal: '1', target: '1.1', description: 'Proportion of the population living below the international poverty line', series: [{ code: 'SI_POV_DAY1' }] }]);
  if (url.includes('Series/Data')) return json({ data: [{ value: '9', timePeriodStart: 2022, dimensions: { Sex: '_T' } }, { value: '12', timePeriodStart: 2012, dimensions: { Sex: '_T' } }, { value: '99', timePeriodStart: 2022, dimensions: { Sex: 'F' } }] });
  throw new Error('unexpected ' + url);
};
const NOW = () => '2026-11-20T00:00:00.000Z';
test('a scan publishes measured problems and taxonomy entries, skips non-problems, and carries provenance', async () => {
  const r = await scan({ sources: [unSdg(), whoCauses(), worldBank()], fetch: fake, now: NOW });
  const ids = r.entries.filter(e => e.published).map(e => e.id).sort();
  assert.deepEqual(ids, ['ghe-ghe020', 'sdg-1-1-1', 'wb-sh-dyn-mort']);
  assert.ok(!r.entries.some(e => e.code === 'NY.GDP.MKTP.CD'));
  const wb = r.entries.find(e => e.id === 'wb-sh-dyn-mort'); assert.equal(wb.m.status, 'improving'); assert.match(wb.read_url, /api\.worldbank\.org/); assert.equal(wb.first_seen, '2026-11-20');
  assert.equal(r.entries.find(e => e.id === 'sdg-1-1-1').m.value, 9, 'only the all-groups total is read');
  assert.equal(r.entries.find(e => e.id === 'ghe-ghe020').m, null, 'a taxonomy entry is published without a figure');
  const pending = r.entries.find(e => e.id === 'wb-se-prm-cmpt-zs'); assert.equal(pending.published, null, 'a measured-empty indicator waits');
  assert.equal(r.sources.wb.listed, 3);
});
test('a scan is incremental and a failed source keeps its earlier entries', async () => {
  const a = await scan({ sources: [worldBank()], fetch: fake, now: NOW });
  const b = await scan({ sources: [worldBank()], prev: a, fetch: async () => { throw new Error('down'); }, now: NOW });
  assert.ok(b.sources.wb.error); assert.deepEqual(b.entries.filter(e => e.published).map(e => e.id), ['wb-sh-dyn-mort']);
  assert.ok(b.log.some(l => l.event === 'source list failed'));
  const c = await scan({ sources: [worldBank()], prev: a, fetch: fake, now: () => '2026-11-21T00:00:00.000Z' });
  assert.equal(c.entries.find(e => e.id === 'wb-sh-dyn-mort').measured_at, a.entries.find(e => e.id === 'wb-sh-dyn-mort').measured_at, 'not re-read inside the window');
});

const scanned = await scan({ sources: [unSdg(), whoCauses(), worldBank()], fetch: fake, now: NOW });
const page = (path, o, title, description, body) => `<main>${title}${body}</main>`;
const c0 = buildCatalog({ problems: null, solutions: SOLUTIONS });
test('pages: the index lists entries and labels the empty ones solution sought; every entry names its source', () => {
  const html = indexPage(c0, new URL('https://x.test/catalogue'), 'https://x.test', page, { ...scanned, entries: scanned.entries.filter(e => e.published) });
  assert.match(html, /solution sought/); assert.match(html, /Tuberculosis/);
  const e = scanned.entries.find(x => x.id === 'wb-sh-dyn-mort');
  const p = entryPage(e, c0, 'https://x.test', page);
  assert.match(p, /World Bank World Development Indicators|wb/); assert.match(p, /data\.worldbank\.org\/indicator\/SH\.DYN\.MORT/);
  assert.equal(entryJson(e, 'https://x.test').trend, 'improving');
  assert.ok(indexJson(c0, 'https://x.test', { ...scanned, entries: scanned.entries.filter(x => x.published) }).count === 3);
});
test('the live routes exist, 404 an unknown entry, and the generated module is current', () => {
  const u = p => new URL('https://x.test' + p);
  assert.equal(route(u('/catalogue'), c0).status, 200); assert.equal(route(u('/catalogue.json'), c0).status, 200);
  assert.equal(route(u('/catalogue/nope'), c0).status, 404); assert.equal(route(u('/catalogue/nope.json'), c0).status, 404);
  assert.match(generated(scanned), /export const SCAN = /);
  assert.equal(slug('SH.DYN.MORT'), 'sh-dyn-mort');
});
