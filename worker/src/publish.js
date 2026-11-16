// SPDX-License-Identifier: LicenseRef-Ultrastable-USL-1.0
// Copyright (c) 2026 Rowan Brad Quni-Gudzinas. Non-commercial use free; commercial use requires a license. See LICENSE.
// Practical Solutions' own content for the shared feed and outbox: how a change reads, the permalink page, the disclosure footer.
const esc = s => String(s ?? '').replace(/[<>&"']/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' }[c]));

export const FOOTER = 'This message was generated and fact-checked automatically by Practical Solutions, an automated evidence service. Every claim links to the paper it rests on.';

const WORDS = {
  verification: c => ({ title: `Evidence check: ${c.id} is ${c.status}`, summary: `The loop re-checked the cited paper for "${c.id}" against Europe PMC: ${c.status}.`, link: `/solutions/${c.id}` }),
  problem_moved: c => ({ title: `Problem ${c.id} moved from rank ${c.from_rank} to ${c.to_rank}`, summary: `New World Bank data (${c.year}) changed its gap to the SDG target.`, link: '/' }),
  problem_added: c => ({ title: `New problem ranked: ${c.id}`, summary: 'A problem entered the ranking.', link: '/' }),
  candidate_added: c => ({ title: `New evidence found: ${c.title}`, summary: `A recent Cochrane review was found for problem ${c.problem}. Unreviewed.`, link: '/' }),
  brightspot_added: c => ({ title: `New bright spot for ${c.problem}: ${c.title}`, summary: `${c.title} does better than its income predicts on ${c.problem} in two separate periods. A lead to investigate, not a finding.`, link: '/' }),
  draft_reviewed: c => ({ title: `Evidence draft passed review: ${c.title}`, summary: 'Quoted sentences and numbers were re-checked against the record by a separate step.', link: '/' }),
};

export function describeChange(c, origin) {
  const f = WORDS[c.kind]; if (!f) return null;
  const d = f(c); return { ...d, link: origin + d.link };
}

export function solutionPage(s, verified, origin) {
  const li = a => a.map(e => `<li><b>${esc(e.src)}</b>: ${esc(e.finding)}</li>`).join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(s.title)} | Practical Solutions</title>
<meta name="description" content="${esc(s.claim)}"><link rel="canonical" href="${esc(origin)}/solutions/${esc(s.id)}">
<style>body{font:16px/1.55 system-ui,sans-serif;max-width:760px;margin:0 auto;padding:24px 16px;background:#fafaf7;color:#1c1c1a}@media(prefers-color-scheme:dark){body{background:#161614;color:#ecebe6}a{color:#6aaefc}}h1{font-size:1.5rem}.m{opacity:.7}</style></head>
<body><p class="m"><a href="/">Practical Solutions</a> · ${esc(s.problem)}</p><h1>${esc(s.title)}</h1><p>${esc(s.claim)}</p>
<h2>Evidence</h2><ul>${li(s.evidence || [])}</ul><p class="m">Verification: ${esc(verified)}</p>
<h2>Where it works</h2><p>${esc(s.works_where)}</p><h2>What it takes</h2><p>${esc(s.takes)}</p><h2>Who can act</h2><p>${esc(s.who)}</p>
<h2>Cheapest first test</h2><p>${esc(s.first_test)}</p><h2>Limits</h2><p>${esc(s.limits)}</p>
<p class="m">${esc(FOOTER)} <a href="/feed.xml">Follow changes</a></p></body></html>`;
}
