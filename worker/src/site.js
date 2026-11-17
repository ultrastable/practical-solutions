// SPDX-License-Identifier: LicenseRef-Ultrastable-USL-1.0
// Copyright (c) 2026 Rowan Brad Quni-Gudzinas. Non-commercial use free; commercial use requires a license. See LICENSE.
// The encyclopedia's pages. Server-rendered HTML, no script, every page reachable by a plain link. Every entry shows its label, sources and limits.
import { esc, DESIGN, LABELS, search, searchIndex, openQuestions } from './catalog.js';
import { FOOTER } from './publish.js';

const CSS = `:root{--bg:#fafaf7;--fg:#1c1c1a;--mut:#666;--card:#fff;--line:#e2e0d8;--acc:#0b5cad;--ok:#1a7f37;--warn:#9a6700}
@media(prefers-color-scheme:dark){:root{--bg:#161614;--fg:#ecebe6;--mut:#9a9890;--card:#1f1f1c;--line:#34332e;--acc:#6aaefc;--ok:#4cc26b;--warn:#e3b341}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.6 system-ui,sans-serif}a{color:var(--acc)}
header,main,footer{max-width:880px;margin:0 auto;padding:12px 16px}header{display:flex;flex-wrap:wrap;gap:6px 16px;align-items:center;border-bottom:1px solid var(--line)}
header b a{text-decoration:none;color:var(--fg)}nav a{margin-right:12px}form{margin:0 0 0 auto}input[type=search]{padding:6px 10px;border:1px solid var(--line);border-radius:8px;background:var(--card);color:var(--fg);width:12em}
h1{font-size:1.6rem;margin:.6em 0 .2em}h2{font-size:1.15rem;margin:1.6em 0 .4em}.m{color:var(--mut)}.card{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:12px 16px;margin:10px 0}
.pill{display:inline-block;padding:0 9px;border:1px solid var(--line);border-radius:99px;font-size:.8rem;margin-right:6px}.ok{color:var(--ok)}.warn{color:var(--warn)}
ul.t{padding-left:18px}footer{color:var(--mut);font-size:.85rem;border-top:1px solid var(--line);margin-top:32px}`;

export const HEADERS = { 'content-type': 'text/html; charset=utf-8', 'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'", 'x-content-type-options': 'nosniff', 'cache-control': 'public, max-age=300' };

const page = (title, desc, path, body, origin) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}"><link rel="canonical" href="${esc(origin + path)}"><link rel="alternate" type="application/rss+xml" href="/feed.xml"><style>${CSS}</style></head><body>
<header><b><a href="/">Practical Solutions</a></b><nav><a href="/problems">Problems</a><a href="/solutions">Solutions</a><a href="/domains">Domains</a><a href="/leads">Leads</a><a href="/method">Method</a><a href="/changes">Changes</a></nav>
<form action="/search" method="get"><input type="search" name="q" placeholder="Search" aria-label="Search"></form></header><main>${body}</main>
<footer>${esc(FOOTER)} <a href="/method">How this works</a> · <a href="/index.json">JSON</a> · <a href="/feed.xml">Feed</a></footer></body></html>`;

const pill = (s, cls = '') => `<span class="pill ${cls}">${esc(s)}</span>`;
const labelPill = l => pill(l, l === 'evidence-backed' ? 'ok' : 'warn');
const solLink = s => `<a href="/solutions/${esc(s.id)}">${esc(s.title)}</a>`;
const probLink = p => `<a href="/problems/${esc(p.id)}">${esc(p.title)}</a>`;
const solRow = s => `<li>${solLink(s)} ${labelPill(s.label)}<br><span class="m">${esc(s.claim)}</span></li>`;
const gapText = p => p.ranked ? `${p.value} ${esc(p.unit)} (${p.year}); target ${p.target} (${esc(p.target_src)}); gap ${(p.shortfall * 100).toFixed(0)}%` : 'No usable world figure yet. The loop retries every cycle.';

export function legend() {
  return `<div class="card"><b>How to read the labels</b><ul class="t">${Object.entries(LABELS).map(([k, v]) => `<li><b>${esc(k)}</b>: ${esc(v)}</li>`).join('')}</ul></div>`;
}

function home(c, origin) {
  const top = c.probs.filter(p => p.ranked).slice(0, 6), open = c.probs.filter(p => !(c.byProblem[p.id] || []).length);
  return page('Practical Solutions: an evidence-based encyclopedia', 'Implementable solutions to pressing problems, each linked to its sources and honestly labelled. Written and kept up to date by an automated loop.', '/', `
<h1>Practical Solutions</h1><p>An encyclopedia of implementable solutions to pressing problems, in every field where a public number shows a gap. Problems are ranked by a published rule, not picked by hand. Every claim links to the paper it rests on and carries a label. An automated loop keeps it current and fills gaps; <a href="/method">the method is public</a>.</p>
<p>${c.probs.length} problems · ${c.sols.length} solutions · ${c.domains.length} domains · ${open.length} problems still without a solution${c.lastTick ? ` · last loop run ${esc(String(c.lastTick.at).slice(0, 16).replace('T', ' '))} UTC` : ''}</p>
<h2>Largest gaps between the world and its targets</h2><ul class="t">${top.map(p => `<li>${probLink(p)} <span class="m">${esc(p.domain)}: ${gapText(p)} · ${(c.byProblem[p.id] || []).length} solution(s)</span></li>`).join('')}</ul>
<h2>Where the encyclopedia is thin</h2><p class="m">These problems have no reviewed solution yet. The loop searches the literature for each of them every cycle.</p><ul class="t">${open.map(p => `<li>${probLink(p)}</li>`).join('') || '<li>None.</li>'}</ul>
<h2>Browse by domain</h2><p>${c.domains.map(d => `<a href="/domains/${esc(d.slug)}">${esc(d.name)}</a> (${d.solutions.length})`).join(' · ')}</p>
<h2>Latest changes by the loop</h2><ul class="t">${c.changes.slice(0, 6).map(x => `<li>${esc(x.kind.replace(/_/g, ' '))}: ${esc(x.id || x.title || x.problem || '')} <span class="m">${esc(String(x.at).slice(0, 10))}</span></li>`).join('') || '<li>No changes yet.</li>'}</ul>${legend()}`, origin);
}

function problemsIndex(c, origin) {
  return page('All problems | Practical Solutions', 'Problems ranked by gap to an international target.', '/problems', `<h1>Problems</h1><p class="m">${esc('Ranked by the gap between the latest world value and its international target (World Bank open data). This ranks size of gap, not deaths, and ignores solvability.')}</p>
<ol>${[...c.probs].sort((a, b) => (a.rank || 99) - (b.rank || 99)).map(p => `<li>${probLink(p)} <span class="m">${esc(p.domain)} · ${(c.byProblem[p.id] || []).length} solution(s)<br>${gapText(p)}</span></li>`).join('')}</ol>`, origin);
}

function problemPage(p, c, origin) {
  const L = c.leads[p.id], sols = c.byProblem[p.id] || [], same = c.probs.filter(x => x.domain === p.domain && x.id !== p.id);
  return page(`${p.title} | Practical Solutions`, `What is known about ${p.title.toLowerCase()}: the size of the gap and the solutions with evidence.`, '/problems/' + p.id, `
<p class="m"><a href="/problems">Problems</a> · <a href="/domains/${esc(p.dslug)}">${esc(p.domain)}</a></p><h1>${esc(p.title)}</h1>
<div class="card"><b>Why it is on the list</b><br>Indicator ${esc(p.ind)} (World Bank): ${gapText(p)}. ${p.ranked ? `Rank ${p.rank} of ${c.probs.filter(x => x.ranked).length}.` : ''} <a href="https://data.worldbank.org/indicator/${esc(p.ind)}">Source data</a></div>
<h2>Solutions</h2>${sols.length ? `<ul class="t">${sols.map(solRow).join('')}</ul>` : `<p>No reviewed solution is listed yet. <span class="m">The loop searches the literature for this problem every cycle; any lead it finds appears below.</span></p>`}
<h2>Leads found by the loop <span class="pill warn">lead, not finding</span></h2>
${L.drafts.length ? `<p class="m">Sentences quoted unchanged from systematic-review abstracts and re-checked by a separate step.</p>${L.drafts.map(d => `<div class="card"><b>${esc(d.title)}</b> (${esc(d.year)}) · <a href="https://pubmed.ncbi.nlm.nih.gov/${esc(d.pmid)}/">PubMed ${esc(d.pmid)}</a><br>${d.quotes.results.map(q => `<q>${esc(q)}</q>`).join(' ')} ${d.quotes.conclusions.map(q => `<q>${esc(q)}</q>`).join(' ')}<br><span class="m">${esc(d.review || '')}</span></div>`).join('')}` : ''}
${L.candidates.length ? `<p class="m">Recent reviews found, not yet reviewed (searched ${esc(String(L.searched_at).slice(0, 10))}):</p><ul class="t">${L.candidates.map(i => `<li>${esc(i.title)} (${esc(i.year)})${i.pmid ? ` · <a href="https://pubmed.ncbi.nlm.nih.gov/${esc(i.pmid)}/">PubMed</a>` : ''}</li>`).join('')}</ul>` : '<p class="m">Nothing found yet.</p>'}
${L.spots.length ? `<h2>Bright spots <span class="pill warn">lead</span></h2><p class="m">${esc(L.spots_note)}</p><ul class="t">${L.spots.map(s => `<li>${esc(s.name)}: ${s.value} (${s.year}); ${s.z_now} standard deviations better than income predicts now, ${s.z_before} before</li>`).join('')}</ul>` : ''}
<h2>Open questions the loop is working on</h2><ul class="t">${openQuestions(p, c).map(q => `<li>${esc(q)}</li>`).join('')}</ul>
${same.length ? `<h2>Related problems</h2><ul class="t">${same.map(x => `<li>${probLink(x)}</li>`).join('')}</ul>` : ''}`, origin);
}

function solutionsIndex(c, u, origin) {
  const g = u.searchParams.get('label'), d = u.searchParams.get('domain');
  const list = c.sols.filter(s => (!g || s.label === g) && (!d || s.domains.map(x => x.toLowerCase().replace(/\W+/g, '-')).includes(d)));
  return page('All solutions | Practical Solutions', 'Every solution with its evidence label.', '/solutions', `<h1>Solutions</h1><p class="m">Filter: ${['evidence-backed', 'mixed evidence', 'cited, weaker design'].map(l => `<a href="/solutions?label=${encodeURIComponent(l)}">${esc(l)}</a>`).join(' · ')} · <a href="/solutions">all</a></p>
<ul class="t">${list.map(solRow).join('') || '<li>None match.</li>'}</ul>${legend()}`, origin);
}

function solutionPage(s, c, origin) {
  const rel = c.related(s), probs = c.probs.filter(p => (s.problem_ids || []).includes(p.id)), dz = DESIGN[s.design];
  return page(`${s.title} | Practical Solutions`, s.claim, '/solutions/' + s.id, `
<p class="m"><a href="/solutions">Solutions</a> · ${probs.map(probLink).join(', ')}</p><h1>${esc(s.title)}</h1>
<p>${labelPill(s.label)} ${pill('strongest design: ' + dz.name.toLowerCase())}</p><p>${esc(s.claim)}</p>
<h2>Sources</h2>${s.links.map(l => `<div class="card"><b>${esc(l.cite)}</b><br>${esc(l.finding)}<br>${l.direct.map(d => `<a href="${esc(d.url)}">${esc(d.label)}</a> `).join('')}<a href="${esc(l.search)}">Find this paper on Europe PMC</a></div>`).join('')}
<p class="m">Verification: ${esc(s.verified)}${s.checkable ? ' The loop re-checks the quoted numbers against the paper abstract every day.' : ' No automatic check is defined for this entry yet, so the figures are the source\'s own, unconfirmed here.'}</p>
<p class="m">${esc(dz.note)} Sources without a DOI or PubMed link show a search link, because the loop only links papers it has found itself.</p>
<h2>Where it works</h2><p>${esc(s.works_where)}</p><h2>What it takes</h2><p>${esc(s.takes)}</p><h2>Who can act</h2><p>${esc(s.who)}</p>
<h2>Cheapest first test</h2><p>${esc(s.first_test)}</p><h2>Limits</h2><p>${esc(s.limits)}</p>
${rel.length ? `<h2>See also</h2><ul class="t">${rel.map(r => `<li>${solLink(r)}</li>`).join('')}</ul>` : ''}`, origin);
}

function domainsIndex(c, origin) {
  return page('Domains | Practical Solutions', 'Fields covered.', '/domains', `<h1>Domains</h1><ul class="t">${c.domains.map(d => `<li><a href="/domains/${esc(d.slug)}">${esc(d.name)}</a> <span class="m">${d.problems.length} problem(s), ${d.solutions.length} solution(s)</span></li>`).join('')}</ul>`, origin);
}
function domainPage(d, c, origin) {
  return page(`${d.name} | Practical Solutions`, `Problems and solutions in ${d.name}.`, '/domains/' + d.slug, `<p class="m"><a href="/domains">Domains</a></p><h1>${esc(d.name)}</h1>
<h2>Problems</h2><ul class="t">${d.problems.map(p => `<li>${probLink(p)}</li>`).join('')}</ul><h2>Solutions</h2><ul class="t">${d.solutions.map(solRow).join('') || '<li>None yet.</li>'}</ul>`, origin);
}

function leadsPage(c, origin) {
  const withLeads = c.probs.filter(p => { const L = c.leads[p.id]; return L.drafts.length || L.candidates.length || L.spots.length; });
  return page('Leads | Practical Solutions', 'What the loop found and has not yet turned into an entry.', '/leads', `<h1>Leads</h1><p>Everything here was found by the automated loop and is <b>not</b> a finding. Each is a place to look. A lead becomes a solution entry only when a source with a study design is cited and checked.</p>
<ul class="t">${withLeads.map(p => { const L = c.leads[p.id]; return `<li>${probLink(p)} <span class="m">${L.drafts.length} reviewed quote(s), ${L.candidates.length} review(s) found, ${L.spots.length} bright spot(s)</span></li>`; }).join('') || '<li>The loop has not found any yet.</li>'}</ul>`, origin);
}

function changesPage(c, origin) {
  return page('Changes | Practical Solutions', 'Every automatic change.', '/changes', `<h1>Changes</h1><p class="m">Every change the loop made, newest first. <a href="/feed.xml">RSS</a> · <a href="/feed.json">JSON Feed</a></p><ul class="t">${c.changes.map(x => `<li><span class="m">${esc(String(x.at).slice(0, 16).replace('T', ' '))}</span> ${esc(x.kind.replace(/_/g, ' '))}: ${esc(x.id || x.title || x.problem || '')}${x.status ? ' (' + esc(x.status) + ')' : ''}</li>`).join('') || '<li>None yet.</li>'}</ul>`, origin);
}

function methodPage(c, origin) {
  return page('Method | Practical Solutions', 'How problems are chosen, how solutions are found and graded, and how the loop runs.', '/method', `<h1>Method</h1>
<p>This page describes exactly how the site is made. Nothing here is hidden behind a model: where a model is used it is named, and today the loop uses none.</p>
<h2>1. How problems are chosen</h2><p>A problem is on the list when a public global indicator (World Bank open data, world aggregate) sits away from an international target (SDG, WHO, World Bank). The score is the shortfall to target, between 0 and 1; the ranking is computed by code on every refresh, not edited by hand. The list of indicators is code in <a href="https://github.com/QNFO/practical-solutions/blob/main/worker/src/problems.js">problems.js</a>; adding one is a pull request. Limits: it ranks gap, not deaths or years of life lost, and ignores how solvable a problem is. A problem whose indicator has no usable data is still shown, marked as unranked.</p>
<h2>2. How solutions get in</h2><p>An entry is added only with a citation to a study, the study's own figures, where it was tested, what it takes, who can act, a cheapest first test, and its limits. Entries are written in <a href="https://github.com/QNFO/practical-solutions/blob/main/worker/src/solutions.js">code</a>, so every addition is reviewed and recorded in version history. The automated loop proposes leads (below); it does not promote a lead to an entry on its own.</p>
<h2>3. Labels and evidence grading</h2><ul class="t">${Object.entries(DESIGN).map(([k, v]) => `<li><b>${esc(v.name)}</b>: ${esc(v.note)}</li>`).join('')}</ul>${legend()}
<p>The label comes from the strongest design the entry cites and from whether its sources agree. It is a transparent rule, not a judgement of quality: a trial can still be small, and one setting may not transfer.</p>
<h2>4. How sources are checked</h2><p>Every day the loop searches Europe PMC for the cited paper and confirms that the quoted numbers appear in its abstract. When it finds the paper it records the DOI and PubMed ID, and the entry links to them. Results are shown on the entry as verified, mismatch or not found; a mismatch is shown, never hidden.</p>
<h2>5. How the loop iterates</h2><ol><li>Refresh the problem ranking from World Bank data (every 6 hours).</li><li>Re-check the stalest solution citations.</li><li>For each problem without a solution, and for the top-ranked problems, search for recent Cochrane systematic reviews on mortality and survival.</li><li>Find bright spots: countries doing better than their income predicts in two separate periods. Leads only.</li><li>Quote results sentences from reviews, unchanged, and have a separate step confirm every quote and number against the abstract.</li><li>Record every change in the public <a href="/changes">changelog</a> and <a href="/feed.xml">feed</a>.</li></ol>
<h2>6. What it will not do</h2><p>It does not present a lead as a finding, paraphrase a result into a stronger claim, or hide a failed check. Corrections: open an issue at <a href="https://github.com/QNFO/practical-solutions/issues">the repository</a>.</p>
<h2>Machine-readable</h2><p><a href="/index.json">/index.json</a> holds the whole catalogue with labels and sources; <a href="/sitemap.xml">/sitemap.xml</a> lists every page.</p>`, origin);
}

function searchPage(c, q, origin) {
  const hits = search(searchIndex(c), q);
  return page(`Search: ${q} | Practical Solutions`, 'Search results.', '/search', `<h1>Search</h1><form action="/search" method="get" style="margin:0 0 12px"><input type="search" name="q" value="${esc(q)}" style="width:100%"></form>
${q ? `<p class="m">${hits.length} result(s)</p>` : ''}<ul class="t">${hits.map(h => `<li><a href="${esc(h.url)}">${esc(h.title)}</a> ${pill(h.type)}</li>`).join('')}</ul>`, origin);
}

export function sitemap(c, origin) {
  const urls = ['/', '/problems', '/solutions', '/domains', '/leads', '/method', '/changes', ...c.probs.map(p => '/problems/' + p.id), ...c.sols.map(s => '/solutions/' + s.id), ...c.domains.map(d => '/domains/' + d.slug)];
  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map(u => `<url><loc>${esc(origin + u)}</loc></url>`).join('')}</urlset>`;
}

export function indexJson(c, origin) {
  return {
    generated: new Date().toISOString(), origin, labels: LABELS,
    problems: c.probs.map(p => ({ id: p.id, title: p.title, domain: p.domain, indicator: p.ind, value: p.value ?? null, year: p.year ?? null, target: p.target ?? null, shortfall: p.shortfall ?? null, solutions: (c.byProblem[p.id] || []).map(s => s.id), url: origin + '/problems/' + p.id })),
    solutions: c.sols.map(s => ({ id: s.id, title: s.title, claim: s.claim, label: s.label, design: s.design, verdict: s.verdict, problems: s.problem_ids, domains: s.domains, verified: s.verified, sources: s.links.map(l => ({ cite: l.cite, finding: l.finding, links: [...l.direct.map(d => d.url), l.search] })), related: c.related(s).map(r => r.id), url: origin + '/solutions/' + s.id })),
  };
}

// Returns a Response or null when the path is not an encyclopedia page.
export function route(u, c) {
  const o = u.origin, h = (b, s = 200) => new Response(b, { status: s, headers: HEADERS });
  const p = u.pathname.replace(/\/$/, '') || '/';
  if (p === '/') return h(home(c, o));
  if (p === '/problems') return h(problemsIndex(c, o));
  if (p === '/solutions') return h(solutionsIndex(c, u, o));
  if (p === '/domains') return h(domainsIndex(c, o));
  if (p === '/leads') return h(leadsPage(c, o));
  if (p === '/changes') return h(changesPage(c, o));
  if (p === '/method') return h(methodPage(c, o));
  if (p === '/search') return h(searchPage(c, u.searchParams.get('q') || '', o));
  if (p === '/search.json') return Response.json({ q: u.searchParams.get('q') || '', results: search(searchIndex(c), u.searchParams.get('q')) });
  if (p === '/index.json') return Response.json(indexJson(c, o));
  if (p === '/sitemap.xml') return new Response(sitemap(c, o), { headers: { 'content-type': 'application/xml' } });
  if (p === '/robots.txt') return new Response(`User-agent: *\nAllow: /\nSitemap: ${o}/sitemap.xml\n`, { headers: { 'content-type': 'text/plain' } });
  let m;
  if ((m = /^\/problems\/([a-z0-9-]+)$/.exec(p))) { const x = c.probs.find(y => y.id === m[1]); return x ? h(problemPage(x, c, o)) : h('not found', 404); }
  if ((m = /^\/solutions\/([a-z0-9-]+)$/.exec(p))) { const x = c.sols.find(y => y.id === m[1]); return x ? h(solutionPage(x, c, o)) : h('not found', 404); }
  if ((m = /^\/domains\/([a-z0-9-]+)$/.exec(p))) { const x = c.domains.find(y => y.slug === m[1]); return x ? h(domainPage(x, c, o)) : h('not found', 404); }
  return null;
}
