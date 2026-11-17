// SPDX-License-Identifier: LicenseRef-Ultrastable-USL-1.0
// Copyright (c) 2026 Rowan Brad Quni-Gudzinas. Non-commercial use free; commercial use requires a license. See LICENSE.
import test from 'node:test';
import assert from 'node:assert/strict';
import { hdiTier, parseCountries, parseIndicator, parseHdr, build, findCountries, solutionsFor, levelOf } from '../worker/src/countries.js';
import { SOLUTIONS } from '../worker/src/solutions.js';
import { buildCatalog } from '../worker/src/catalog.js';

const wb = [{}, [{ id: 'GHA', iso2Code: 'GH', name: 'Ghana', region: { id: 'SSF', value: 'Sub-Saharan Africa ' }, incomeLevel: { id: 'LMC' } }, { id: 'DEU', iso2Code: 'DE', name: 'Germany', region: { id: 'ECS', value: 'Europe' }, incomeLevel: { id: 'HIC' } }, { id: 'WLD', name: 'World', region: { id: 'NA', value: 'Aggregates' }, incomeLevel: { id: 'NA' } }, { id: 'VEN', iso2Code: 'VE', name: 'Venezuela, RB', region: { id: 'LCN', value: 'Latin America' }, incomeLevel: { id: 'INX' } }]];
const ind = (iso, v, d = '2022') => ({ countryiso3code: iso, value: v, date: d });
const csv = 'iso3,country,hdicode,hdi_2022,hdi_2023\nGHA,Ghana,Medium,0.600,0.602\nDEU,Germany,Very High,0.95,0.959\nVEN,"Venezuela, RB",High,0.7,\n';
const data = () => build({ at: 'x', sources: {}, countries: parseCountries(wb),
  infra: { water: parseIndicator([{}, [ind('GHA', 88.46), ind('DEU', 100)]]), electricity: parseIndicator([{}, [ind('GHA', 88.8), ind('DEU', 100)]]), cooking: {}, internet: {}, sanitation: {} }, hdi: parseHdr(csv) });

test('HDI tiers follow UNDP thresholds and the latest year is used', () => {
  assert.deepEqual(['0.8', '0.799', '0.7', '0.55', '0.549'].map(v => hdiTier(+v)), ['very high', 'high', 'high', 'medium', 'low']);
  const h = parseHdr(csv); assert.equal(h.GHA.year, 2023); assert.equal(h.VEN.value, 0.7); assert.equal(h.DEU.tier, 'very high');
});

test('countries come with income group and aggregates are dropped; unclassified ones fall back to the HDI tier', () => {
  const d = data(); assert.equal(Object.keys(d.countries).length, 3);
  assert.equal(levelOf(d.countries.GHA).id, 'lower-middle'); assert.equal(d.countries.VEN.level, null);
  assert.deepEqual(levelOf(d.countries.VEN), { id: 'upper-middle', via: 'HDI tier' });
});

test('lookup by name, alias, code and fragment', () => {
  const d = data();
  for (const q of ['Ghana', 'ghana', 'GHA', 'gh', 'gha']) assert.equal(findCountries(d, q)[0].iso3, 'GHA', q);
  assert.equal(findCountries(d, 'germ')[0].iso3, 'DEU'); assert.equal(findCountries(d, 'venezuela')[0].iso3, 'VEN'); assert.deepEqual(findCountries(d, 'zzz'), []);
});

test('chlorination is relevant in Ghana (88% water) and not in Germany (100%); both say why with the figure and year', () => {
  const sols = buildCatalog({ problems: null, solutions: SOLUTIONS }).sols, d = data();
  const gh = solutionsFor(d.countries.GHA, sols), de = solutionsFor(d.countries.DEU, sols);
  assert.ok(gh.relevant.some(x => x.s.id === 'chlorine' && /88\.5%/.test(x.reasons.join())));
  assert.ok(de.less.some(x => x.s.id === 'chlorine'));
  assert.ok(gh.relevant.length > 0 && de.level.id === 'high' && gh.level.id === 'lower-middle');
});

test('refresh writes a snapshot from the three sources, names a failing source and keeps its previous values', async () => {
  const { refresh } = await import('../tools/refresh_context.mjs');
  const ok = b => ({ ok: true, json: async () => b, text: async () => b });
  const rows = Array.from({ length: 120 }, (_, i) => `ZZ${String.fromCharCode(65 + (i % 26))}`.slice(0, 3));
  const hdrCsv = 'iso3,country,hdicode,hdi_2023\n' + [...new Set(['GHA', 'DEU', ...Array.from({ length: 130 }, (_, i) => String.fromCharCode(65 + (i % 26)) + String.fromCharCode(65 + (Math.floor(i / 26) % 26)) + 'Q')])].map(i => `${i},x,High,0.75`).join('\n');
  const f = async u => {
    if (u.includes('/country?')) return ok(wb);
    if (u.includes('SH.H2O.BASW')) return { ok: false, status: 503 };
    if (u.includes('/indicator/EG.ELC')) return ok([{}, [ind('GHA', 88.8)]]);
    if (u.includes('LIC;LMC')) return ok([{}, [{ countryiso3code: 'LIC', country: { id: 'XM' }, value: 50, date: '2022' }]]);
    if (u.includes('hdr.undp.org')) return ok(hdrCsv);
    return ok([{}, []]);
  };
  const prev = { countries: { GHA: { iso3: 'GHA', infra: { water: { v: 80, year: 2020 } } } }, levels: {}, sources: {} };
  const d = await refresh({ fetch: f, prev, now: () => 'T' });
  assert.equal(d.at, 'T'); assert.equal(d.countries.GHA.level, 'lower-middle'); assert.equal(d.countries.GHA.infra.electricity.v, 88.8);
  assert.match(d.sources['infra.water'], /^failed/); assert.equal(d.countries.GHA.infra.water.v, 80);   // kept, and named as failed
  assert.match(d.sources.hdi, /^ok/); assert.equal(d.countries.GHA.hdi.tier, 'high'); assert.ok(d.levels.low.ranked.length > 0);
});

test('country, level and lookup pages render with data, pass the accessibility audit and answer in JSON', async () => {
  const { route } = await import('../worker/src/site.js'), kit = await import('../worker/src/kit/index.js');
  const d = data();
  const ranked = [{ rank: 1, id: 'water', title: 'Unsafe drinking water', unit: '%', value: 40, year: 2022, target: 100, shortfall: 0.6 }];
  const context = { ...d, levels: { low: { ranked, unranked: [] }, 'lower-middle': { ranked, unranked: [{ id: 'x', title: 'Y' }] }, 'upper-middle': { ranked: [], unranked: [] }, high: { ranked: [], unranked: [] } } };
  const c = buildCatalog({ context, problems: null, solutions: SOLUTIONS });
  const get = p => route(new URL('https://x' + p), c);
  for (const p of ['/country?q=ghana', '/country?q=zzz', '/country/GHA', '/country/DEU', '/country/VEN', '/levels/lower-middle', '/levels/high']) { const r = get(p); assert.equal(r.status, 200, p); const t = await r.text(); assert.deepEqual(kit.auditHtml(t), [], p); }
  assert.match(await get('/country?q=ghana').text(), /href="\/country\/GHA"/);
  const gh = await get('/country/GHA').text(); assert.match(gh, /Lower-middle income/); assert.match(gh, /medium/); assert.match(gh, /88\.5% \(2022\)/); assert.match(gh, /Unsafe drinking water/);
  const j = await get('/country/GHA.json').json(); assert.equal(j.income_group, 'lower-middle'); assert.ok(j.relevant.some(r => r.id === 'chlorine'));
  assert.equal(get('/country/QQQ').status, 404); assert.equal(get('/levels/nope').status, 404);
  assert.equal((await get('/levels/low.json').json()).ranking.ranked[0].id, 'water');
  assert.ok((await get('/sitemap.xml').text()).includes('/country/GHA'));
});
