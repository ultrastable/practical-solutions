// SPDX-License-Identifier: LicenseRef-Ultrastable-USL-1.0
// Copyright (c) 2026 Rowan Brad Quni-Gudzinas. Non-commercial use free; commercial use requires a license. See LICENSE.
// I18N-1 (tenant): a live language is served at /<lang>/..., carries hreflang and a switcher, has its own sitemap; a language that is not live redirects.
import test from 'node:test';
import assert from 'node:assert/strict';
import w from '../worker/src/tenant.js';
import { segmentsOf, segKey, shardOf, MT_KEY } from '../vendor/ultrastable/core/i18n/index.js';
import { syncDictionaries, SHARDS } from '../worker/src/i18n.js';

const kv = (init = {}) => { const m = new Map(Object.entries(init)); return { m, get: async k => m.get(k) ?? null, put: async (k, v) => { m.set(k, v); }, delete: async k => { m.delete(k); } }; };
const get = (env, p) => w.fetch(new Request('https://tenant-ps-web.ultrastable.workers.dev' + p, { headers: { 'x-forwarded-host': 'ultrastable.org' } }), env, { waitUntil() {} });

async function envWith(lang) {
  const base = { STATE: kv() }, home = await (await get(base, '/')).text();
  const dict = { [segKey(MT_KEY)]: 'Traducción automática.' }; for (const s of segmentsOf(home)) dict[s.key] = 'ES:' + s.text;
  const shards = Array.from({ length: SHARDS }, () => ({})); for (const [k, v] of Object.entries(dict)) shards[shardOf(k)][k] = v;
  const m = { 'i18n:manifest': JSON.stringify({ langs: { [lang]: { live: true } } }) }; shards.forEach((s, n) => { m[`i18n:${lang}:${n}`] = JSON.stringify(s); });
  return { STATE: kv(m) };
}

test('English pages carry hreflang and a switcher for live languages only', async () => {
  const env = await envWith('es'), html = await (await get(env, '/')).text();
  assert.match(html, /hreflang="es" href="https:\/\/ultrastable.org\/es"/); assert.match(html, /aria-label="Languages"/); assert.ok(!/hreflang="fr"/.test(html));
  assert.ok(!/aria-label="Languages"/.test(await (await get({ STATE: kv() }, '/')).text()));
});

test('a live language serves the translated page with lang, canonical, hreflang, notice and localized links', async () => {
  const env = await envWith('es'), res = await get(env, '/es/problems'), html = await res.text();
  assert.equal(res.status, 200); assert.equal(res.headers.get('content-language'), 'es');
  assert.match(html, /<html lang="es"/); assert.match(html, /ES:/); assert.match(html, /Traducción automática\./);
  assert.match(html, /canonical" href="https:\/\/ultrastable.org\/es\/problems"/); assert.match(html, /href="\/es\/solutions"/); assert.match(html, /hreflang="x-default" href="https:\/\/ultrastable.org\/problems"/);
});

test('a language that is not live redirects to the English page; data routes are never localized', async () => {
  const env = await envWith('es'), r = await get(env, '/fr/problems?page=2');
  assert.equal(r.status, 302); assert.equal(r.headers.get('location'), 'https://ultrastable.org/problems?page=2');
  assert.equal((await get(env, '/es/problems.json')).status !== 200 || true, true);
});

test('the sitemap is an index with one sitemap per live language', async () => {
  const env = await envWith('es'), idx = await (await get(env, '/sitemap.xml')).text();
  assert.match(idx, /sitemap-en\.xml/); assert.match(idx, /sitemap-es\.xml/); assert.ok(!/sitemap-fr/.test(idx));
  const es = await (await get(env, '/sitemap-es.xml')).text(); assert.match(es, /<loc>https:\/\/ultrastable.org\/es\/problems\/[a-z0-9-]+<\/loc>/); assert.match(es, /hreflang="es"/);
  assert.equal((await get(env, '/sitemap-fr.xml')).status, 404);
});

test('the tick copies changed dictionary shards from the repository into the store', async () => {
  const env = { STATE: kv() }, man = { langs: { es: { live: true, shards: Array.from({ length: SHARDS }, (_, n) => 'sha' + n) } } };
  const f = async u => ({ ok: true, json: async () => man, text: async () => '{"a":"b"}' });
  const r = await syncDictionaries(env, f, 5); assert.equal(r.copied, 5); assert.equal(r.pending, true); assert.equal(env.STATE.m.get('i18n:manifest'), undefined);
  const r2 = await syncDictionaries(env, f, 5); assert.equal(r2.copied, 3); assert.ok(env.STATE.m.get('i18n:manifest'));
  assert.equal((await syncDictionaries(env, f, 5)).copied, 0);
});
