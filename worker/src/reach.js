// SPDX-License-Identifier: LicenseRef-Ultrastable-USL-1.0
// Copyright (c) 2026 Rowan Brad Quni-Gudzinas. Non-commercial use free; commercial use requires a license. See LICENSE.
// Reach counters: one JSON object per UTC day, aggregate only. No IP, no cookie, no per-visitor record is kept.
// Counts are approximate (concurrent requests can lose an increment) and say so on the page.
const day = t => new Date(t).toISOString().slice(0, 10);
const section = p => (p.split('/')[1] || 'home');
const kind = ua => /bot|crawl|spider|slurp|curl|python|node|fetch|gpt|claude|perplexity|anthropic|openai/i.test(ua || '') ? 'agents_and_bots' : 'people';

export async function recordView(store, request, now = Date.now()) {
  const u = new URL(request.url);
  if (request.method !== 'GET' || !/^\/(problems|solutions|domains|leads|method|changes|search)?(\/|$)/.test(u.pathname) || /\.(json|xml|txt)$/.test(u.pathname)) return;
  const k = 'reach:' + day(now);
  const d = JSON.parse((await store.get(k)) || '{"views":0,"sections":{},"referrers":{},"kinds":{},"countries":{}}');
  const inc = (o, key) => { o[key] = (o[key] || 0) + 1; };
  d.views++; inc(d.sections, section(u.pathname)); inc(d.kinds, kind(request.headers.get('user-agent')));
  const ref = request.headers.get('referer'); if (ref) { try { const h = new URL(ref).hostname; if (h !== u.hostname) inc(d.referrers, h); } catch { /* ignore */ } }
  const cc = request.cf && request.cf.country; if (cc) inc(d.countries, cc);
  await store.put(k, JSON.stringify(d));
}

export async function summary(store, now = Date.now(), days = 30) {
  const out = { days, views: 0, sections: {}, referrers: {}, kinds: {}, countries: {}, daily: [] };
  for (let i = 0; i < days; i++) {
    const k = 'reach:' + day(now - i * 864e5), v = await store.get(k); if (!v) continue;
    const d = JSON.parse(v); out.views += d.views; out.daily.push({ day: k.slice(6), views: d.views });
    for (const f of ['sections', 'referrers', 'kinds', 'countries']) for (const [a, n] of Object.entries(d[f] || {})) out[f][a] = (out[f][a] || 0) + n;
  }
  return out;
}
