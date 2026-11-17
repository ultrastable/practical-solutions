// SPDX-License-Identifier: LicenseRef-Ultrastable-USL-1.0
// Copyright (c) 2026 Rowan Brad Quni-Gudzinas. Non-commercial use free; commercial use requires a license. See LICENSE.
// Real-browser accessibility and performance check of a running site: axe-core (WCAG 2.0 to 2.2 A and AA plus best practice) in
// light and dark, desktop and phone widths, horizontal overflow, console errors, and transfer size. Needs playwright and axe-core
// installed (CI installs them); it is not part of `npm test` so the unit suite stays dependency-free.
//   node tools/live_axe.mjs https://tenant-ps-web.ultrastable.workers.dev
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
const require = createRequire(import.meta.url);
const base = (process.argv[2] || process.env.BASE || '').replace(/\/$/, '');
if (!base) { console.error('usage: live_axe.mjs <base url>'); process.exit(2); }
const { chromium } = require('playwright');
const axeSrc = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');
const idx = await (await fetch(base + '/index.json')).json();
const paths = ['/', '/for', '/for/implementers', '/solutions', '/problems', '/domains', '/compare?ids=' + idx.solutions.slice(0, 2).map(s => s.id).join('&ids='), '/search?q=water', '/method', '/api', '/about', '/impact',
  ...idx.solutions.slice(0, 4).map(s => '/solutions/' + s.id), '/problems/' + idx.problems[0].id, '/domains/' + idx.domains[0].slug, '/solutions/nope', '/country', '/levels/low'];
const browser = await chromium.launch(); const bad = [];
for (const scheme of ['light', 'dark']) for (const [name, viewport] of [['desktop', { width: 1280, height: 900 }], ['phone', { width: 390, height: 844 }]]) {
  const page = await (await browser.newContext({ viewport, colorScheme: scheme })).newPage(); const errors = []; let skipErrors = false; page.on('console', m => m.type() === 'error' && !skipErrors && errors.push(m.text())); page.on('pageerror', e => errors.push(String(e)));
  for (const p of paths) {
    skipErrors = p === '/solutions/nope'; // the 404 page is expected to log its own status
    let resp; await page.waitForTimeout(150); for (let i = 0; i < 12; i++) { const n = errors.length; try { resp = await page.goto(base + p, { waitUntil: 'load', timeout: 30000 }); } catch (e) { resp = null; if (i === 11) throw e; } if (resp && ![429, 502, 503].includes(resp.status())) break; errors.length = n; await page.waitForTimeout(Math.min(30000, 1000 * 2 ** i)); } await page.evaluate(axeSrc); // retry for about four minutes (a cool-down, as in live_ux): the edge throttles a fast crawl before the Worker runs (deploys from several threads crawl at once)
    const r = await page.evaluate(() => axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'] } }));
    for (const v of r.violations) bad.push(`${scheme} ${name} ${p}: ${v.id} (${v.impact}) ${v.nodes[0].html.slice(0, 100)}`);
    if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)) bad.push(`${scheme} ${name} ${p}: horizontal overflow`);
    const bytes = await page.evaluate(() => performance.getEntriesByType('navigation')[0].transferSize || 0); if (bytes > 120000) bad.push(`${p}: ${bytes} bytes transferred`);
    if (resp.status() >= 500) bad.push(`${p}: status ${resp.status()}`);
  }
  for (const e of errors) bad.push(`${scheme} ${name}: console error ${e}`);
}
await browser.close(); console.log(`axe: ${paths.length * 4} page views checked, ${bad.length} problems`); for (const b of bad) console.log('  ' + b); process.exit(bad.length ? 1 : 0);
