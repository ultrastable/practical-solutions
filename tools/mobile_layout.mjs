// SPDX-License-Identifier: LicenseRef-Ultrastable-USL-1.0
// Copyright (c) 2026 Rowan Brad Quni-Gudzinas. Non-commercial use free; commercial use requires a license. See LICENSE.
// MOBILE-LAYOUT-1: renders real pages in a real browser at phone width and fails when chrome crowds out content.
// Budgets (all at 390 px wide): chrome (family bar + header) at most 170 px tall, the page's h1 starts inside the first screen,
// no horizontal scroll, every link/button/input at least 44 px tall in the header. Usage: node tools/mobile_layout.mjs [--shots dir] [--base https://host]
// Without --base the pages are rendered from the Worker's own route() so the check needs no network and runs in CI.
// PHONE-OVERFLOW-1: then every page the web Worker serves (every sitemap path plus the HTML routes outside the sitemap and the 404 page) is
// rendered through the Worker's full fetch handler (the i18n decoration included) at 360 and 390 px, with the header's More menu closed and
// open, and the run fails when any page is wider than the screen, naming the element(s) that stick out. Found 2026-11-25: every page scrolled
// sideways by 9-11 px at 360 px because the header's one-line nav (four links + More) could not shrink below its text width.
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
import { mkdirSync } from 'node:fs';
import { buildCatalog } from '../worker/src/catalog.js';
import { route } from '../worker/src/site.js';
import { SOLUTIONS } from '../worker/src/solutions.js';
import { sitemapPaths } from '../worker/src/site.js';
import web from '../worker/src/tenant.js';

export const BUDGET = { width: 390, height: 844, chromeMax: 170, h1TopMax: 330, tap: 44 };
export const SWEEP_WIDTHS = [360, 390];
// HTML routes served by the web Worker that are not in the sitemap; /no-such-page renders the 404 page.
export const EXTRA_PAGES = ['/live', '/changelog', '/ask', '/connections', '/no-such-page'];
export const PAGES = ['/', '/solutions', '/problems', '/domains', '/method', '/ask', '/for', '/country', '/graph', '/connections', '/syntheses', '/catalogue', '/solutions/chlorine'];

const args = process.argv.slice(2), opt = n => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
const shots = opt('--shots'), base = opt('--base');
const c = buildCatalog({ problems: null, solutions: SOLUTIONS });
if (shots) mkdirSync(shots, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: BUDGET.width, height: BUDGET.height }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const failures = [];
for (const p of PAGES) {
  const page = await ctx.newPage();
  if (base) await page.goto(base + p, { waitUntil: 'load' });
  else {
    const r = route(new URL('https://x.test' + p), c);
    if (!r || r.status !== 200) { await page.close(); continue; }
    await page.setContent(await r.text(), { waitUntil: 'load' });
  }
  const m = await page.evaluate(() => {
    const top = el => el ? Math.round(el.getBoundingClientRect().top + scrollY) : null;
    const bottom = el => el ? Math.round(el.getBoundingClientRect().bottom + scrollY) : null;
    const hdr = document.querySelector('.site-h'), main = document.querySelector('main'), h1 = document.querySelector('main h1');
    const small = [...document.querySelectorAll('.fam a,.site-h a,.site-h button,.site-h input,.site-h summary')].filter(e => e.offsetParent && e.getBoundingClientRect().height < 43.5).map(e => (e.textContent || e.name || e.tagName).trim().slice(0, 24));
    return { chrome: bottom(hdr), h1Top: top(h1), mainTop: top(main), overflow: document.documentElement.scrollWidth - innerWidth, small };
  });
  const bad = [];
  if (m.chrome > BUDGET.chromeMax) bad.push(`chrome ${m.chrome}px > ${BUDGET.chromeMax}`);
  if (m.h1Top != null && m.h1Top > BUDGET.h1TopMax) bad.push(`h1 at ${m.h1Top}px > ${BUDGET.h1TopMax}`);
  if (m.overflow > 0) bad.push(`horizontal overflow ${m.overflow}px`);
  if (m.small.length) bad.push(`small tap targets: ${m.small.join(', ')}`);
  console.log((bad.length ? 'FAIL ' : 'ok   ') + p.padEnd(22) + JSON.stringify({ chrome: m.chrome, h1Top: m.h1Top, overflow: m.overflow }) + (bad.length ? ' ' + bad.join('; ') : ''));
  if (bad.length) failures.push(p + ': ' + bad.join('; '));
  if (shots) await page.screenshot({ path: `${shots}/${p === '/' ? 'home' : p.slice(1).replace(/\//g, '_')}.png` });
  await page.close();
}
// PHONE-OVERFLOW-1: the sweep. Offenders are the innermost elements whose right edge passes the viewport.
const kv = new Map(), env = { STATE: { get: async k => kv.get(k) ?? null, put: async (k, v) => { kv.set(k, v); }, delete: async k => { kv.delete(k); } } };
const sweep = [...new Set([...sitemapPaths(c), ...EXTRA_PAGES])];
const html = async p => {
  if (base) { const r = await fetch(base + p); return /html/.test(r.headers.get('content-type') || '') ? r.text() : null; }
  const r = await web.fetch(new Request('https://tenant-ps-web.ultrastable.workers.dev' + p), env, { waitUntil() {} });
  return /html/.test(r.headers.get('content-type') || '') ? r.text() : null;
};
const offenders = () => { const W = innerWidth, wide = [...document.querySelectorAll('body *')].filter(e => { const x = e.getBoundingClientRect(); if (!(x.width > 0 && x.right > W + 0.5)) return false; for (let a = e.parentElement; a && a !== document.body; a = a.parentElement) if (getComputedStyle(a).overflowX !== 'visible') return false; return true; });
  return { over: document.documentElement.scrollWidth - W, els: wide.filter(e => !wide.some(o => o !== e && e.contains(o))).slice(0, 3).map(e => e.tagName.toLowerCase() + (e.className ? '.' + String(e.className).trim().split(/\s+/).join('.') : '') + ` right=${Math.round(e.getBoundingClientRect().right)} "${(e.textContent || '').trim().slice(0, 30)}"`) }; };
let swept = 0;
for (const w of SWEEP_WIDTHS) {
  const sctx = await browser.newContext({ viewport: { width: w, height: 800 } }), page = await sctx.newPage();
  for (const p of sweep) {
    const text = await html(p); if (text == null) continue;
    await page.setContent(text, { waitUntil: 'load' }); swept++;
    const closed = await page.evaluate(offenders);
    let open = { over: 0, els: [] };
    if (await page.locator('.more summary').count()) { await page.click('.more summary'); open = await page.evaluate(offenders); }
    for (const [state, m] of [['', closed], [' (More open)', open]]) if (m.over > 0) failures.push(`${p} at ${w}px${state}: ${m.over}px wider than the screen; ${m.els.join('; ')}`);
  }
  await sctx.close();
}
console.log(`overflow sweep: ${sweep.length} paths, ${swept} HTML renders at ${SWEEP_WIDTHS.join(' and ')} px`);
await browser.close();
if (failures.length) { for (const f of failures.slice(0, 40)) console.error('FAIL ' + f); if (failures.length > 40) console.error(`... and ${failures.length - 40} more (not shown)`); }
if (failures.length) { console.error(`${failures.length} failure(s) over the mobile budget`); process.exit(1); }
