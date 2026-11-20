// SPDX-License-Identifier: LicenseRef-Ultrastable-USL-1.0
// Copyright (c) 2026 Rowan Brad Quni-Gudzinas. Non-commercial use free; commercial use requires a license. See LICENSE.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildCatalog } from '../worker/src/catalog.js';
import { SOLUTIONS } from '../worker/src/solutions.js';
import { route } from '../worker/src/site.js';
import { OPENAPI_PATHS } from '../worker/src/export.js';
import { scan, planIssues, issueTitle } from '../ps/gapscan.js';

const c = buildCatalog({ problems: null, solutions: SOLUTIONS });
const get = p => route(new URL('https://x' + p), c);
const s0 = c.sols[0], p0 = c.probs[0];

test('citation export: BibTeX, RIS and CSL-JSON keep the evidence label', async () => {
  const bib = await get(`/solutions/${s0.id}.bib`).text();
  assert.match(bib, /^@misc\{ps-solution-/); assert.ok(bib.includes('Evidence label'));
  const ris = await get(`/solutions/${s0.id}.ris`).text(); assert.match(ris, /^TY  - ELEC/); assert.match(ris, /ER  - /);
  const csl = await get(`/solutions/${s0.id}.csl.json`).json(); assert.equal(csl.type, 'webpage'); assert.ok(csl.URL.endsWith('/solutions/' + s0.id));
  assert.equal(get(`/solutions/nope.bib`).status, 404);
  assert.equal(get(`/problems/${p0.id}.bib`).status, 200);
});
test('embed card allows framing, keeps label and limit, and oEmbed points at it', async () => {
  const r = get(`/embed/solutions/${s0.id}`), html = await r.text();
  assert.equal(r.status, 200); assert.match(r.headers.get('content-security-policy'), /frame-ancestors \*/); assert.equal(r.headers.get('x-frame-options'), null);
  assert.ok(html.includes(s0.label) && html.includes('Main limit')); assert.ok(!/<script/i.test(html));
  const o = await get('/oembed?url=' + encodeURIComponent('https://x/solutions/' + s0.id)).json(); assert.equal(o.type, 'rich'); assert.ok(o.html.includes('/embed/solutions/' + s0.id));
  assert.equal(get('/oembed?url=https://x/nope').status, 404);
});
test('CSV downloads have one row per entry', async () => {
  const lines = (await get('/problems.csv').text()).trim().split('\n'); assert.equal(lines.length, c.probs.length + 1);
  assert.ok((await get('/catalogue.csv').text()).startsWith('id,title,domain'));
});
test('every path in the OpenAPI description is served by the real router', async () => {
  for (const path of Object.keys(OPENAPI_PATHS)) {
    const url = path.replace('{id}', path.startsWith('/problems') ? p0.id : s0.id).replace(/\?.*/, '') + (path === '/oembed' ? '?url=https://x/solutions/' + s0.id : '');
    assert.equal(get(url)?.status, 200, path);
  }
  assert.equal((await get('/openapi.json').json()).openapi, '3.1.0');
  assert.ok((await get('/api').text()).includes('"@type":"Dataset"'));
});
test('gap analysis: shipped capabilities pass their probe, gaps have none, issues are planned without duplicates', async () => {
  const reg = JSON.parse(readFileSync(new URL('../org/capabilities.json', import.meta.url), 'utf8'));
  const r = await scan(reg, async p => get(p));
  assert.ok(r.shipped >= 22 && r.gaps.length >= 3 && r.deferred.length >= 3);
  for (const g of [...r.gaps, ...r.deferred]) assert.equal(reg.capabilities.find(x => x.id === g.id).probe, null, g.id + ' has a probe that fails');
  const plan = planIssues(r.gaps, [issueTitle(r.gaps[0])], 2);
  assert.equal(plan.length, 2); assert.ok(!plan.some(i => i.id === r.gaps[0].id)); assert.ok(plan[0].labels.includes('idea'));
});
test('glossary, accessibility, data package and country compare render from data', async () => {
  assert.ok((await get('/glossary').text()).includes('DefinedTermSet'));
  const dp = await get('/datapackage.json').json(); assert.deepEqual(dp.resources.map(r => r.name), ['solutions', 'problems', 'catalogue']); assert.ok(dp.resources[1].schema.fields.some(f => f.name === 'gap_share'));
  const cc = buildCatalog({ problems: null, solutions: SOLUTIONS, context: { at: '2026-01-01', countries: { KEN: { iso3: 'KEN', name: 'Kenya', region: 'Sub-Saharan Africa', level: 'lower-middle', infra: {} }, UGA: { iso3: 'UGA', name: 'Uganda', region: 'Sub-Saharan Africa', level: 'low', infra: {} } }, levels: {} } });
  const html = await route(new URL('https://x/country/compare?c=KEN,UGA,ZZZ'), cc).text();
  assert.ok(html.includes('Kenya') && html.includes('Uganda') && html.includes('No data for: ZZZ') && html.includes('Solutions that fit all of them'));
});
