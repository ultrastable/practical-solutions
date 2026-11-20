// SPDX-License-Identifier: LicenseRef-Ultrastable-USL-1.0
// Copyright (c) 2026 Rowan Brad Quni-Gudzinas. Non-commercial use free; commercial use requires a license. See LICENSE.
// I18N-1 (tenant side): which languages are live, where their dictionaries come from, and the language switcher. The generic work (segments, localizing a
// page, hreflang, sitemaps, checked translation) is core/i18n. Dictionaries are committed by the translate loop to ledger/i18n/<lang>/<shard>.json and copied
// into the STATE store by the Worker's own tick (syncDictionaries), so a request reads only the store.
import { LANGS, byCode, localizeHtml, localizePath, localizable, segKey, shardOf } from '../../vendor/ultrastable/core/i18n/index.js';

export const SHARDS = 8;
export const SOURCE_LANG = 'en';
export const CODES = LANGS.map(l => l.code).filter(c => c !== SOURCE_LANG);
export const RAW = 'https://raw.githubusercontent.com/ultrastable/practical-solutions/main/ledger/i18n/';
const MEMO = new WeakMap();   // per store, so an isolate never mixes two stores
const memo = (env, key, ttl, load) => { let c = MEMO.get(env.STATE); if (!c) MEMO.set(env.STATE, c = new Map()); const m = c.get(key), now = Date.now(); if (m && now - m.at < ttl) return m.v; return load().then(v => { c.set(key, { at: now, v }); return v; }); };
const j = async (env, k, d) => { const v = await env.STATE.get(k); try { return v ? JSON.parse(v) : d; } catch { return d; } };

export const manifest = env => memo(env, 'manifest', 300e3, () => j(env, 'i18n:manifest', { langs: {} }));
export const liveLangs = m => CODES.filter(c => m && m.langs && m.langs[c] && m.langs[c].live);
export const dictFor = (env, lang) => memo(env, 'dict:' + lang, 600e3, async () => Object.assign({}, ...(await Promise.all(Array.from({ length: SHARDS }, (_, n) => j(env, `i18n:${lang}:${n}`, {}))))));

// Tick step: copy at most `budget` changed dictionary shards from the repository into the store. Stale shards stay served until replaced.
export async function syncDictionaries(env, fetchFn = fetch, budget = 12) {
  const r = await fetchFn(RAW + 'manifest.json', { cf: { cacheTtl: 60 } });
  if (!r.ok) throw new Error('manifest HTTP ' + r.status);
  const man = await r.json(); let used = 0, copied = 0;
  for (const code of CODES) {
    const e = man.langs && man.langs[code]; if (!e || !e.shards) continue;
    for (let n = 0; n < SHARDS && used < budget; n++) {
      const sha = e.shards[n]; if (!sha || (await env.STATE.get(`i18n:sha:${code}:${n}`)) === sha) continue;
      used++; const s = await fetchFn(`${RAW}${code}/${n}.json`, { cf: { cacheTtl: 60 } });
      if (!s.ok) continue; const body = await s.text(); JSON.parse(body);   // refuse anything that is not JSON
      await env.STATE.put(`i18n:${code}:${n}`, body); await env.STATE.put(`i18n:sha:${code}:${n}`, sha); copied++;
    }
  }
  const mine = JSON.stringify(man), prev = await env.STATE.get('i18n:manifest');
  if (used < budget && mine !== prev) await env.STATE.put('i18n:manifest', mine);   // the manifest flips live flags only once its shards are in
  return { copied, pending: used >= budget };
}

export function switcher(path, live, current) {
  if (!localizable(path) || !live.length) return '';
  const item = l => `<li><a href="${localizePath(path, l, SOURCE_LANG).replace(/"/g, '&quot;')}" hreflang="${l}" lang="${l}"${l === current ? ' aria-current="true"' : ''}>${byCode[l].name}</a></li>`;
  return `<nav class="langs" aria-label="Languages" style="padding:1rem;text-align:center;font-size:.9rem"><ul style="list-style:none;margin:0;padding:0;display:flex;flex-wrap:wrap;gap:.25rem 1rem;justify-content:center">${[SOURCE_LANG, ...live].map(item).join('')}</ul></nav>`;
}

// html: the source-language page for `path` (path + query). Returns the page in `lang` (or the source page decorated with hreflang and the switcher).
export async function decorate(html, { env, lang, origin, path }) {
  const man = await manifest(env), live = liveLangs(man);
  const dict = lang === SOURCE_LANG ? {} : await dictFor(env, lang);
  const r = localizeHtml(html, { lang, dict, origin, path: path.split('?')[0], live, def: SOURCE_LANG });
  return r.html.replace('</body>', switcher(path, live, lang) + '</body>');
}
export { segKey, shardOf };
