import test from 'node:test';
import assert from 'node:assert/strict';
import { topics, slugsFor, urlFor, pageOk, verify, linkMap, candidatesFor, slugOf } from '../ps/references.js';
import { section } from '../worker/src/references.js';
import { REFERENCES } from '../worker/src/reference-links.gen.js';
import { SCAN } from '../worker/src/problem-scan.gen.js';
import { entryPage } from '../worker/src/catalogue-pages.js';
import { generated } from '../tools/references.mjs';
import { readFileSync } from 'node:fs';
import agencies from '../org/agencies.json' with { type: 'json' };
import reg from '../org/references.json' with { type: 'json' };

const src = reg.sources[0], esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const page = t => ({ status: 200, html: `<html><title>${t} | Encyclopedia of World Problems</title>` });

test('topics strip measure words, and an alias must head the phrase', () => {
  assert.ok(topics('Estimated malaria incidence (per 1000)', src).includes('malaria'));
  assert.ok(topics('People using safely managed drinking water services (%)', src).includes('drinking water'));
  assert.ok(!topics('Total population pushed below a relative poverty line by household health expenditures', src).includes('poverty'));
  assert.equal(slugOf('Long-term shortage of water'), 'long-term-shortage-of-water');
});
test('pageOk needs HTTP 200 and a title that names the term', () => {
  assert.equal(pageOk(page('Malaria'), 'malaria'), 'Malaria');
  assert.equal(pageOk({ status: 404, html: '' }, 'malaria'), null);
  assert.equal(pageOk(page('Something else'), 'malaria'), null);
});
test('verify is bounded, polite, skips fresh hits and recent misses, and does not count a network error as a miss', async () => {
  const calls = [], f = async u => { calls.push(u); if (u.endsWith('boom')) throw new Error('net'); return u.endsWith('malaria') ? { status: 200, text: async () => page('Malaria').html } : { status: 404, text: async () => '' }; };
  const now = Date.parse('2026-11-20T00:00:00Z'), s = { ...src, per_run_budget: 3, delay_ms: 0 }, c = ['malaria', 'nothing', 'boom', 'late'].map(slug => ({ slug }));
  const r = await verify({ source: s, candidates: c, fetch: f, now, sleep: async () => {} });
  assert.equal(r.used, 3); assert.equal(calls.length, 3); assert.ok(r.found[urlFor(s, 'malaria')]); assert.ok(r.misses[urlFor(s, 'nothing')]); assert.ok(!r.misses[urlFor(s, 'boom')]);
  calls.length = 0; await verify({ source: s, candidates: c.slice(0, 2), known: r, fetch: f, now: now + 864e5, sleep: async () => {} }); assert.equal(calls.length, 0);
});
test('every stored link is for a real catalogue entry on a registered source and carries a title and URL only', () => {
  const ids = new Set(SCAN.entries.map(e => e.id));
  for (const [id, ls] of Object.entries(REFERENCES.links)) { assert.ok(ids.has(id)); for (const l of ls) { assert.ok(REFERENCES.sources[l.source] && l.title && l.url.startsWith('https://') && Object.keys(l).length === 3); } }
  assert.ok(Object.keys(REFERENCES.links).length > 0);
});
test('the generated module matches the ledger and registry', () => {
  assert.equal(readFileSync(new URL('../worker/src/reference-links.gen.js', import.meta.url), 'utf8'), generated(reg, JSON.parse(readFileSync(new URL('../ledger/reference-links.json', import.meta.url), 'utf8'))));
});
test('catalogue pages show related references only where a link exists, with source and terms cited', () => {
  const pg = (_p, _o, _t, _d, body) => body, id = Object.keys(REFERENCES.links)[0], withLink = entryPage(SCAN.entries.find(e => e.id === id), null, 'https://o', pg);
  assert.match(withLink, /Related references/); assert.ok(withLink.includes('Union of International Associations') && withLink.includes('uia.org/terms'));
  assert.doesNotMatch(entryPage(SCAN.entries.find(e => !REFERENCES.links[e.id]), null, 'https://o', pg), /Related references/);
  assert.equal(section('none', esc), '');
});
test('candidates list aliases first; linkMap only maps verified pages', () => {
  const c = candidatesFor([{ title: 'Some other thing' }, { title: 'Malaria incidence' }], src); assert.equal(c[0].slug, 'malaria');
  assert.deepEqual(linkMap({ entries: [{ id: 'a', title: 'Malaria incidence' }], sources: [src], results: { uia: { found: {} } } }), {});
});
test('UIA is a reference-publisher target reached only through its published contact page', () => {
  const a = agencies.agencies.find(x => x.id === 'uia'); assert.equal(a.audience, 'reference'); assert.equal(a.domain, 'uia.org'); assert.match(a.contact_page, /^https:\/\/uia\.org\//);
});
