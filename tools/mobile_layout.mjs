// SPDX-License-Identifier: LicenseRef-Ultrastable-USL-1.0
// Copyright (c) 2026 Rowan Brad Quni-Gudzinas. Non-commercial use free; commercial use requires a license. See LICENSE.
// MOBILE-LAYOUT-1: renders real pages in a real browser at phone width and fails when chrome crowds out content.
// Budgets (all at 390 px wide): chrome (family bar + header) at most 170 px tall, the page's h1 starts inside the first screen,
// no horizontal scroll, every link/button/input at least 44 px tall in the header. Usage: node tools/mobile_layout.mjs [--shots dir] [--base https://host]
// Without --base the pages are rendered from the Worker's own route() so the check needs no network and runs in CI.
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
import { mkdirSync } from 'node:fs';
import { buildCatalog } from '../worker/src/catalog.js';
import { route } from '../worker/src/site.js';
import { SOLUTIONS } from '../worker/src/solutions.js';

export const BUDGET = { width: 390, height: 844, chromeMax: 170, h1TopMax: 330, tap: 44 };
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
await browser.close();
if (failures.length) { console.error(`${failures.length} page(s) over the mobile budget`); process.exit(1); }
