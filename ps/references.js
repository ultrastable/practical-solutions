// SPDX-License-Identifier: LicenseRef-Ultrastable-USL-1.0
// Copyright (c) 2026 Rowan Brad Quni-Gudzinas. Non-commercial use free; commercial use requires a license. See LICENSE.
// REFERENCE-LINKS-1: finds and verifies links from catalogue problems to outside reference sources (org/references.json), on the source's terms.
// Pure functions; the runner (tools/references.mjs) passes `fetch`. A link is kept only when its page was fetched with HTTP 200 and its own <title>
// names the term; only the title and URL are stored (posture link_only), never the source's text.
const LEAD = /^(estimated |total |number of |incidence of |prevalence of |proportion of |share of |mortality rate,? |death rate,? |people using |population using |rate of )+/i;
export const slugOf = s => String(s).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

/** The topic phrases a catalogue title can be searched under: the title cut at "(" or "," and stripped of measure words, plus matching alias keys. */
export function topics(title, source) {
  const base = String(title).split(/[(,]/)[0].replace(LEAD, '').replace(/\b(per|among|of|in|by)\b.*$/i, '').trim().toLowerCase();
  const out = new Set(base && base.split(/\s+/).length <= 3 ? [base] : []);
  for (const k of Object.keys(source.aliases || {})) if (new RegExp('^(\\S+ ){0,3}' + k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i').test(base)) out.add(k); // the term must head the phrase, not sit anywhere in a long title
  return [...out];
}
/** Candidate slugs for a topic: the aliases listed for it, else the slug of the phrase itself. */
export const slugsFor = (topic, source) => (source.aliases || {})[topic] || [slugOf(topic)];
export const urlFor = (source, slug) => source.url.replace('{slug}', slug);

/** True when the fetched page is real and names the term. `html` is the response body, `status` its HTTP status. */
export function pageOk({ status, html }, slug) {
  if (status !== 200) return null;
  const m = /<title[^>]*>([^<]{1,200})<\/title>/i.exec(html || '');
  if (!m) return null;
  const title = m[1].replace(/\s*[|\-–—]\s*(Encyclopedia|UIA).*$/i, '').replace(/&amp;/g, '&').trim();
  const words = slug.split('-').filter(w => w.length > 3);
  return words.length && words.every(w => title.toLowerCase().includes(w.slice(0, Math.max(4, w.length - 2)))) ? title : null;
}

/**
 * Verify a bounded batch of (topic, slug) candidates. `known` is the earlier result: { found: {url: title}, misses: {url: isoDate} }.
 * Misses are not retried until miss_ttl_days pass, and a run stops at per_run_budget fetches so the source is read gently.
 */
export async function verify({ source, candidates, known = {}, fetch, now = Date.now(), sleep = ms => new Promise(r => setTimeout(r, ms)) }) {
  const found = { ...(known.found || {}) }, misses = { ...(known.misses || {}) }, checked = { ...(known.checked || {}) }, ttl = (source.miss_ttl_days ?? 45) * 864e5, recheck = (source.recheck_days ?? 60) * 864e5;
  let used = 0;
  for (const c of candidates) {
    const url = urlFor(source, c.slug);
    if ((found[url] && checked[url] && now - Date.parse(checked[url]) < recheck) || (misses[url] && now - Date.parse(misses[url]) < ttl)) continue;
    if (used >= (source.per_run_budget ?? 40)) break;
    used++;
    let r = null;
    try { const res = await fetch(url, { headers: { 'user-agent': 'practical-solutions-reference-check (+https://ultrastable.org)' }, redirect: 'follow' }); r = { status: res.status, html: res.status === 200 ? (await res.text()).slice(0, 20000) : '' }; } catch { r = null; }
    if (!r) { await sleep(source.delay_ms ?? 1500); continue; } // a network error is not a miss
    const title = pageOk(r, c.slug);
    if (title) { found[url] = title; checked[url] = new Date(now).toISOString(); delete misses[url]; } else { delete found[url]; delete checked[url]; misses[url] = new Date(now).toISOString(); } // a page that stops matching drops its link
    await sleep(source.delay_ms ?? 1500);
  }
  return { found, misses, checked, used };
}

/** Catalogue id -> [{ source, title, url }] for every verified candidate. */
export function linkMap({ entries, sources, results }) {
  const map = {};
  for (const e of entries) for (const s of sources) {
    const seen = new Set();
    for (const t of topics(e.title, s)) for (const slug of slugsFor(t, s)) {
      const url = urlFor(s, slug), title = ((results[s.id] || {}).found || {})[url];
      if (title && !seen.has(url)) { seen.add(url); (map[e.id] ||= []).push({ source: s.id, title, url }); }
    }
  }
  return map;
}
export const candidatesFor = (entries, source) => {
  const seen = new Set(), out = [];
  for (const e of entries) for (const t of topics(e.title, source)) for (const slug of slugsFor(t, source)) if (!seen.has(slug)) { seen.add(slug); out.push({ topic: t, slug }); }
  // aliases first: they are the curated, likeliest matches
  return out.sort((a, b) => Number(Boolean((source.aliases || {})[b.topic])) - Number(Boolean((source.aliases || {})[a.topic])));
};
