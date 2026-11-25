// SPDX-License-Identifier: LicenseRef-Ultrastable-USL-1.0
// Copyright (c) 2026 Rowan Brad Quni-Gudzinas. Non-commercial use free; commercial use requires a license. See LICENSE.
// COUNT-CLAIMS-1 (claims are code): every count the home page displays beside a link is compared with the data behind the linked page.
// Pure. tests run it on the rendered page; tools/countclaims.mjs runs it on the live site and files or closes its own fix item.
const num = s => Number(String(s).replace(/[,\s]/g, ''));
// Each rule: label on the home page, the href its figure links to, and how to count what that page shows.
export const RULES = [
  { label: 'problems in the catalogue', href: '/catalogue', actual: d => d.catalogue.count },
  { label: 'problems with a full evidence entry', href: '/problems', actual: d => d.problems.length },
  { label: 'problems still seeking a solution', href: '/catalogue', actual: d => d.catalogue.problems.filter(p => p.solution_status === 'solution sought').length + d.problems.filter(p => !p.solutions || !p.solutions.length).length },
];
export function displayed(html) { const out = {}; for (const m of String(html).matchAll(/<li><b>([\d,]+)<\/b><span><a href="([^"]+)">([^<]+)<\/a><\/span><\/li>/g)) out[m[3]] = { value: num(m[1]), href: m[2] }; return out; }
export function check(html, data) {
  const shown = displayed(html), faults = [];
  for (const r of RULES) {
    const d = shown[r.label];
    if (!d) { faults.push({ label: r.label, why: 'not displayed with a link' }); continue; }
    if (d.href !== r.href) faults.push({ label: r.label, why: `links to ${d.href}, not ${r.href}` });
    const a = r.actual(data);
    if (d.value !== a) faults.push({ label: r.label, why: `home page says ${d.value}, ${r.href} holds ${a}` });
  }
  return faults;
}
