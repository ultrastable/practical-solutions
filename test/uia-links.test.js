import test from 'node:test';
import assert from 'node:assert/strict';
import { LINKS, UIA, section } from '../worker/src/uia-links.js';
import { SCAN } from '../worker/src/problem-scan.gen.js';
import { entryPage } from '../worker/src/catalogue-pages.js';
import agencies from '../org/agencies.json' with { type: 'json' };

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
test('every UIA link points at a real catalogue entry and the UIA encyclopedia host, with a title and no copied text', () => {
  const ids = new Set(SCAN.entries.map(e => e.id));
  for (const [id, links] of Object.entries(LINKS)) {
    assert.ok(ids.has(id), id + ' is not in the catalogue');
    for (const l of links) { assert.match(l.url, /^https:\/\/encyclopedia\.uia\.org\/(en\/)?problem\//); assert.ok(l.title && Object.keys(l).length === 2); }
  }
});
test('the section cites the source and retrieval date and is empty without a match', () => {
  assert.equal(section('no-such-entry', esc), '');
  const h = section('sdg-3-3-3', esc);
  assert.ok(h.includes(UIA.copyright) && h.includes(UIA.retrieved) && h.includes('problem/malaria'));
});
test('a linked catalogue entry page shows the related references; an unlinked one does not', () => {
  const page = (_p, _o, _t, _d, body) => body, e = id => SCAN.entries.find(x => x.id === id);
  assert.match(entryPage(e('sdg-3-3-3'), null, 'https://o', page), /Related references/);
  const other = SCAN.entries.find(x => !LINKS[x.id]);
  assert.doesNotMatch(entryPage(other, null, 'https://o', page), /Related references/);
});
test('UIA is a researcher target reached only through its published contact page', () => {
  const a = agencies.agencies.find(x => x.id === 'uia');
  assert.equal(a.audience, 'researcher'); assert.equal(a.domain, 'uia.org'); assert.match(a.contact_page, /^https:\/\/uia\.org\//);
});
