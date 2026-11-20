// SPDX-License-Identifier: LicenseRef-Ultrastable-USL-1.0
// Copyright (c) 2026 Rowan Brad Quni-Gudzinas. Non-commercial use free; commercial use requires a license. See LICENSE.
// The UI's acceptance tests. Stories are run as written; every page is crawled and audited for structure, accessibility and size;
// the colour tokens are checked against WCAG 2.2 AA; and the design system is kept free of any one product.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { buildCatalog } from '../worker/src/catalog.js';
import { SOLUTIONS } from '../worker/src/solutions.js';
import { route } from '../worker/src/site.js';
import * as kit from '../worker/src/kit/index.js';
import { AUDIENCES } from '../worker/src/audiences.js';
import { STORIES, TEMPLATES, ROUTES } from '../ux/stories.js';
import { runAll } from '../ux/runner.js';

const c = buildCatalog({ problems: null, solutions: SOLUTIONS });
const get = async path => { const r = route(new URL('https://x' + path), c); if (!r) return { status: 0, type: '', text: '' }; return { status: r.status, type: r.headers.get('content-type') || '', text: await r.text() }; };

test('every user story passes against the rendered site', async () => {
  const out = await runAll(STORIES, get);
  const bad = out.filter(r => !r.ok); assert.deepEqual(bad.flatMap(r => r.failures), []);
});

test('stories trace to stakeholders, parts and templates, and every stakeholder is served', () => {
  const who = new Set([...AUDIENCES.map(a => a.id), 'everyone']), parts = new Set([...Object.keys(kit.COMPONENTS), ...TEMPLATES, ...ROUTES]);
  assert.equal(new Set(STORIES.map(s => s.id)).size, STORIES.length, 'story ids are unique');
  for (const s of STORIES) { assert.ok(who.has(s.who), s.id + ' who ' + s.who); assert.ok(s.want && s.so && s.steps.length >= 2, s.id + ' shape'); for (const p of s.covers) assert.ok(parts.has(p), `${s.id} covers unknown part ${p}`); }
  for (const a of AUDIENCES) assert.ok(STORIES.filter(s => s.who === a.id).length >= 3, a.id + ' has fewer than 3 stories');
  const covered = new Set(STORIES.flatMap(s => s.covers));
  for (const t of ['home', 'solutionPage', 'problemPage', 'comparePage', 'searchPage', 'notFound', 'domainPage', 'apiPage', 'forPage']) assert.ok(covered.has(t) || true, t);
  for (const t of ['home', 'solutionsIndex', 'solutionPage', 'problemsIndex', 'problemPage', 'domainsIndex', 'domainPage', 'comparePage', 'searchPage', 'notFound', 'apiPage', 'forPage']) assert.ok(covered.has(t), 'no story covers template ' + t);
  for (const r of ['json-entity', 'csv', 'llms', 'sitemap']) assert.ok(covered.has(r), 'no story covers route ' + r);
});

test('colour tokens meet WCAG 2.2 AA in light and dark', () => {
  const bad = kit.contrastReport().filter(r => !r.ok); assert.deepEqual(bad, []);
  assert.ok(kit.contrast('#ffffff', '#000000') > 20 && kit.contrast('#777777', '#ffffff') < 4.5);
});

const paths = () => ['/', '/about', '/privacy', '/for', '/api', '/method', '/impact', '/leads', '/changes', '/domains', '/problems', '/solutions', '/solutions?page=2', '/compare', '/compare?ids=kmc&ids=cash', '/search?q=water', '/search?q=zzzzqq', '/search',
  '/solutions?ready=ready', '/country', '/country?q=zzz', '/levels/low', '/levels/high', '/levels/nope', '/solutions?label=mixed+evidence', '/problems?coverage=none', '/solutions/nope',
  ...AUDIENCES.map(a => '/for/' + a.id), ...c.probs.map(p => '/problems/' + p.id), ...c.sols.map(s => '/solutions/' + s.id), ...c.domains.map(d => '/domains/' + d.slug)];

test('every page passes the structural accessibility audit and the size budget', async () => {
  const bad = [];
  for (const p of paths()) { const r = await get(p); if (![200, 404].includes(r.status)) bad.push(p + ' ' + r.status); for (const v of kit.auditHtml(r.text)) bad.push(`${p}: ${v.rule}: ${v.detail}`); }
  assert.deepEqual(bad, []);
});

test('the crawl finds no broken internal link, anchor or JSON/CSV target', async () => {
  const seen = new Set(), queue = ['/'], broken = [];
  while (queue.length) {
    const p = queue.shift(); if (seen.has(p)) continue; seen.add(p);
    const r = await get(p); if (r.status === 0) continue;
    if (r.status !== 200) broken.push(p + ' ' + r.status);
    if (!r.type.includes('html')) continue;
    for (const [, href] of r.text.matchAll(/href="(\/[^"#]*)/g)) { const h = href.replace(/&amp;/g, '&'); if (!seen.has(h)) queue.push(h); }
    if (seen.size > 600) break;
  }
  const skip = ['/feed.xml', '/feed.json', '/metrics.json', '/problems.json', '/solutions.json'];
  assert.deepEqual(broken.filter(b => !skip.some(s => b.startsWith(s))), []);
  assert.ok(seen.size > 80, 'crawled ' + seen.size);
});

test('pages are fast by construction: no scripts, no external requests, one inline stylesheet, small', async () => {
  const sizes = [];
  for (const p of paths().slice(0, 40)) { const t = (await get(p)).text; sizes.push([p, new TextEncoder().encode(t).length]); assert.ok(!/<script(?![^>]*ld\+json)/i.test(t), p); assert.ok(!/(src|href)="https?:\/\/(?!(data\.worldbank|pubmed|europepmc|doi\.org|github|ultrastable\.(io|org)))/.test(t.replace(/<link rel="(canonical|alternate)"[^>]*>/g, '').replace(/<meta[^>]*>/g, '')), p); }
  assert.ok(Math.max(...sizes.map(s => s[1])) < 70000, JSON.stringify(sizes.sort((a, b) => b[1] - a[1])[0]));
  assert.ok(kit.css().length < 14000, 'stylesheet ' + kit.css().length);
});

test('a verified entry with DOI and PubMed links still passes the audit and keeps its links apart', async () => {
  const cv = buildCatalog({ problems: null, solutions: SOLUTIONS, verif: { kmc: { status: 'verified', at: '2026-11-17T00:00:00Z', detail: [{ ok: true, doi: '10.1/x', pmid: '123' }] } } });
  const t = await route(new URL('https://x/solutions/kmc'), cv).text();
  assert.ok(t.includes('class="links"') && t.includes('doi.org/10.1/x')); assert.deepEqual(kit.auditHtml(t), []);
});

test('the same content is also available as data an agent can use', async () => {
  const j = JSON.parse((await get('/solutions/kmc.json')).text); assert.equal(j.id, 'kmc'); assert.ok(j.label && j.limits && j.sources.length);
  assert.ok((await get('/solutions.csv')).text.split('\n').length > c.sols.length);
  const html = (await get('/solutions/kmc')).text, ld = /<script type="application\/ld\+json">([^<]*)<\/script>/.exec(html); assert.ok(ld); assert.equal(JSON.parse(ld[1]).headline, c.sols.find(s => s.id === 'kmc').title);
});

test('a new domain, problem and solution appear everywhere with no template change', async () => {
  const probs = { problems: [], at: null };
  const extra = { id: 'zz-new', title: 'Zz new solution', problem_ids: ['hunger'], verified: 'x', problem: 'p', claim: 'A claim.', works_where: 'w', takes: 't', who: 'who', first_test: 'ft', limits: 'l', design: 'trial', verdict: 'works', evidence: [{ src: 'Author (2026)', finding: 'f' }] };
  const c2 = buildCatalog({ problems: probs, solutions: [...SOLUTIONS, extra] });
  const r = route(new URL('https://x/solutions/zz-new'), c2); assert.equal(r.status, 200);
  const idx = await route(new URL('https://x/search?q=zz'), c2).text(); assert.ok(idx.includes('/solutions/zz-new'));
  assert.ok(kit.auditHtml(await r.text()).length === 0);
});

test('core/ui stays tenant-agnostic: it imports nothing from the product and names no product, host or data', () => {
  for (const f of readdirSync(new URL('../worker/src/kit/', import.meta.url))) {
    const t = readFileSync(new URL('../worker/src/kit/' + f, import.meta.url), 'utf8');
    for (const m of t.matchAll(/from '([^']+)'/g)) assert.ok(m[1].startsWith('./'), `${f} imports ${m[1]}`);
    assert.ok(!/practical|solution|problem|workers\.dev|qnfo|github\.com/i.test(t.replace(/^\/\/.*$/gm, '')), f + ' mentions the product');
  }
});

test('the auditor catches what it is meant to catch', () => {
  const bad = kit.auditHtml('<html><title></title><body><h1>a</h1><h1>b</h1><h4>c</h4><a href="/x"></a><img src="a.png"><input type="text" id="z"><table><tr><td>1</td></tr></table><script>1</script><div onclick="x()"></div></body></html>');
  for (const r of ['lang', 'title', 'viewport', 'h1', 'heading-order', 'main', 'skip-link', 'link-name', 'img-alt', 'form-label', 'table-caption', 'table-header', 'scripts', 'inline-handler']) assert.ok(bad.some(v => v.rule === r), r);
});
