// SPDX-License-Identifier: LicenseRef-Ultrastable-USL-1.0
// Copyright (c) 2026 Rowan Brad Quni-Gudzinas. Non-commercial use free; commercial use requires a license. See LICENSE.
// Executes a story's steps. `get(path)` returns { status, type, text }, so the same stories run against the render code in tests and
// against the deployed site in CI. Returns { ok, failures: [...] }; it never throws on an unmet expectation.
const links = html => [...html.matchAll(/<a\s[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g)].map(m => ({ href: m[1].replace(/&amp;/g, '&'), text: m[2].replace(/<[^>]*>/g, '').trim() }));
const headings = html => [...html.matchAll(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/g)].map(m => m[1].replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').trim());
const pick = (o, path) => path.split('.').reduce((a, k) => a == null ? a : a[k], o);

export async function runStory(story, get) {
  const failures = []; let page = null, at = '';
  const fail = (i, why) => failures.push(`${story.id} step ${i + 1}: ${why} (at ${at})`);
  for (const [i, st] of story.steps.entries()) {
    if (st.visit) { at = st.visit; page = await get(at); continue; }
    if (!page) { fail(i, 'no page loaded'); break; }
    if (st.follow) {
      const re = new RegExp(st.follow.href || st.follow.text, 'i'), l = links(page.text).find(x => re.test(st.follow.href ? x.href : x.text));
      if (!l) { fail(i, `no link matching ${re} on page`); break; }
      at = l.href; page = await get(at); continue;
    }
    if (st.submit) {
      const f = [...page.text.matchAll(/<form[^>]*action="([^"]*)"/g)].find(m => m[1] === st.submit.action);
      if (!f) { fail(i, `no form with action ${st.submit.action}`); break; }
      at = st.submit.action + '?' + new URLSearchParams(st.submit.fields); page = await get(at); continue;
    }
    if (st.expect) {
      const e = st.expect, t = page.text, tx = [].concat(e.text || []);
      if (e.status && page.status !== e.status) fail(i, `status ${page.status}, wanted ${e.status}`); else if (!e.status && page.status !== 200) fail(i, `status ${page.status}, wanted 200`);
      if (e.type && !page.type.includes(e.type)) fail(i, `content-type ${page.type}, wanted ${e.type}`);
      for (const r of tx) if (!new RegExp(r, 'im').test(t)) fail(i, `text not found: ${r}`);
      if (e.no_text && new RegExp(e.no_text, 'i').test(t)) fail(i, `unwanted text: ${e.no_text}`);
      if (e.heading && !headings(t).some(h => new RegExp(e.heading, 'i').test(h))) fail(i, `no heading matching ${e.heading}`);
      if (e.link && !links(t).some(l => new RegExp(e.link, 'i').test(l.href))) fail(i, `no link matching ${e.link}`);
      if (e.form && ![...t.matchAll(/<form[^>]*action="([^"]*)"/g)].some(m => m[1] === e.form)) fail(i, `no form with action ${e.form}`);
      if (e.json) {
        let d; try { d = JSON.parse(t); } catch { fail(i, 'body is not JSON'); continue; }
        const val = pick(d, e.json.path.replace(/\.length$/, '')), n = /\.length$/.test(e.json.path) ? (val || []).length : val;
        if (e.json.min != null && !(n >= e.json.min)) fail(i, `${e.json.path} is ${n}, wanted at least ${e.json.min}`);
        if (e.json.equals != null && n !== e.json.equals) fail(i, `${e.json.path} is ${n}, wanted ${e.json.equals}`);
        if (e.json.match && !new RegExp(e.json.match).test(String(n))) fail(i, `${e.json.path} does not match ${e.json.match}`);
      }
    }
  }
  return { ok: failures.length === 0, failures };
}
export async function runAll(stories, get) { const out = []; for (const s of stories) out.push({ id: s.id, ...(await runStory(s, get)) }); return out; }
