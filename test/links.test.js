// SPDX-License-Identifier: LicenseRef-Ultrastable-USL-1.0
// Copyright (c) 2026 Rowan Brad Quni-Gudzinas. Non-commercial use free; commercial use requires a license. See LICENSE.
// LINKS-1: connections are shown on entry pages and in /graph, kinds are never mixed, and the generated data follows the catalogue.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCatalog } from '../worker/src/catalog.js';
import { route } from '../worker/src/site.js';
import { LINKS } from '../worker/src/links.gen.js';
import { connectionsOf, linksJson, graphStats } from '../worker/src/links.js';
import { corpus, buildLinks } from '../tools/connections.mjs';
import * as D from '../vendor/ultrastable/core/discover/index.js';

const c = buildCatalog({});
const get = async p => { const r = route(new URL('https://x.test' + p), c); return { status: r.status, text: await r.text() }; };

test('every hand-checked solution has a node and shows its connections, with the catalogue-cited ones marked established', async () => {
  for (const s of c.sols) assert.ok(LINKS.nodes['s:' + s.id], 'regenerate with: node tools/connections.mjs --links-only (' + s.id + ')');
  const k = connectionsOf('s:chlorine', c);
  assert.ok(k.established.some(n => n.id === 'p:water'), 'the catalogue cites chlorine against water');
  const ids = [...k.established, ...k.near, ...k.leads.map(l => l.other)].map(n => n.id);
  assert.equal(new Set(ids).size, ids.length, 'an entry appears in one kind of connection only');
  const { status, text } = await get('/solutions/chlorine');
  assert.equal(status, 200); assert.match(text, /id="connections"/); assert.match(text, /href="\/graph\?node=/); assert.match(text, /linked in the catalogue/);
});

test('problem and catalogue entries show connections too', async () => {
  for (const p of ['/problems/water', '/problems/under5', '/catalogue/who-wsh-water-safely-managed']) { const { status, text } = await get(p); assert.equal(status, 200, p); assert.match(text, /id="connections"/, p); }
});

test('/graph is a browsable map: domains, a domain, and one entry, with a JSON form', async () => {
  const o = await get('/graph'); assert.equal(o.status, 200); assert.match(o.text, /The knowledge graph/); assert.match(o.text, /<svg/); assert.doesNotMatch(o.text, /<script/);
  const dom = o.text.match(/href="(\/graph\?domain=[^"]+)"/)[1]; const d = await get(dom.replace(/&amp;/g, '&')); assert.equal(d.status, 200); assert.match(d.text, /Most connected entries/);
  const n = await get('/graph?node=p%3Awater'); assert.equal(n.status, 200); assert.match(n.text, /Unsafe drinking water/);
  assert.equal((await get('/graph?node=p%3Anope')).status, 404); assert.equal((await get('/graph?domain=nope')).status, 404);
  const j = JSON.parse((await get('/links.json')).text); assert.ok(j.nodes.length > 500); assert.ok(j.edges.some(e => e.kind === 'cited') && j.edges.some(e => e.kind === 'alike'));
  const s = graphStats(c); assert.ok(s.nodes > 500 && s.solutions >= 20 && s.established >= 20);
  assert.ok(linksJson(c).edges.length > 100);
});

test('the generator builds links from vectors and the ledger, and a new item gets neighbours on the next run', () => {
  const input = corpus(), DIM = 64, words = t => String(t).toLowerCase().match(/[a-z]{4,}/g) || [];
  const rows = input.nodes.map(n => { const v = new Array(DIM).fill(0); for (const w of words(n.label + ' ' + n.text)) v[parseInt(D.hash(w), 16) % DIM] += 1; return { id: n.id, q: Int8Array.from(v.map(x => Math.min(100, x * 10))) }; });
  const M = D.unpack(D.pack(rows));
  const L = buildLinks({ nodes: input.nodes, M, ledger: { entries: { x: { id: 'x', type: 'transfer', status: 'new', members: ['s:chlorine', 'p:water'], via: 'p:water', score: 0.9, justification: { value: 90, needs_model: false } } } }, url: input.url, at: 'now', floor: 0.3, crossFloor: 0.2 });
  assert.equal(Object.keys(L.nodes).length, input.nodes.length);
  assert.ok(Object.keys(L.near).length > 100); assert.deepEqual(L.leads['s:chlorine'], [['transfer', 'p:water', 90, 'p:water']]);
  for (const [id, l] of Object.entries(L.near)) for (const [o, pct] of l) { assert.notEqual(o, id); assert.ok(['very close', 'close', 'related'].includes(pct) && L.nodes[o]); }
});
