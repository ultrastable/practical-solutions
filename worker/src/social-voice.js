// SPDX-License-Identifier: LicenseRef-Ultrastable-USL-1.0
// Copyright (c) 2026 Rowan Brad Quni-Gudzinas. Non-commercial use free; commercial use requires a license. See LICENSE.
// SOCIAL-VOICE-1: this tenant's voice for social posts, as code. Pure functions over the catalogue; every number or claim in a post is read from the
// catalogue entry it is about (never typed here), so a post can only state what the site itself shows. Core's publisher (ultrastable seed/worker
// src/social.js) fetches /social-queue.json and drains it within its own caps; this module decides only the words and the order.
// Order follows the hierarchy: a new domain, then its problems, then its solutions. Wording varies by a hash of the id so the feed never repeats itself.
const LIMIT = 280;  // Bluesky allows 300; the link is counted in full
const h = s => [...String(s)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);
const pick = (id, arr) => arr[h(id) % arr.length];
// POST-QUALITY-1: nothing is ever clipped. A post is built from whole sentences; the first candidate that fits is used, and the last candidate always fits.
const fitWhole = (cands, n) => cands.map(c => c.replace(/[ \t]+/g, ' ').trim()).find(c => c.length <= n);
// THOUGHT-1 (Rowan, 2026-11-21): every post says what this is an example of. One link only (the page itself); the hook names Ultrastable without a second URL.
export const HOOK = 'Built on Ultrastable.';
const fit = (heads, url) => `${fitWhole(heads.map(h => `${h} ${/Ultrastable/.test(h) ? '' : HOOK}`), LIMIT - url.length - 1)}\n${url}`;
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
const num = v => (typeof v === 'number' ? Number(v.toPrecision(3)).toString() : String(v));

const A = f => Object.assign(f, { link: '/autonomy' });
export const META = [
  A(o => `Claim: a system left to run its own loop, inside fixed limits, can do useful public work. Test: this one has been compiling evidence on child health, water and hunger on its own. Here is its record, and what it doesn't prove.`),
  A(o => `"Autonomous AI can't be trusted without a human in every step." Maybe. So we built one with hard limits, open records and public corrections, and count what it does. Check our numbers, then tell us where we're wrong.`),
  o => `Practical Solutions is a free library of fixes with real evidence behind them: child deaths, dirty water, hunger. It keeps itself up to date, and it's the first thing built on Ultrastable, a platform for systems that improve themselves. ${o}`,
  o => `I started a nonprofit, Empowering Change, to ask how data can serve the common good. That became years of research, then AI for good. Practical Solutions is where it lands: ideas that work, kept current by a system that improves itself. ${o}`,
  o => `Ultrastable for good: a system that checks its own work and keeps improving, pointed at the problems people actually have. Start with the solutions, then see how the loop runs. ${o}`,
  o => `What happens if a system watches its own results, fixes what's wrong, and keeps going? Practical Solutions is our first try, built on Ultrastable. Poke holes in it, please. ${o}`,
  o => `Most websites stop improving the day they launch. This one re-checks its own evidence and re-ranks problems on its own. Free, no signup. What should it cover next? ${o}`,
  o => `A quiet public service: what actually works against big problems, with sources, and a plain note when the evidence is weak. Also a test of whether a self-improving system on Ultrastable can be trusted with this. ${o}`,
];

export function domainPost(d, o) {
  const url = `${o}/domains/${d.slug}`, p = d.problems.length, s = d.solutions.length;
  const head = pick(d.slug, [
    `New on the shelf: ${d.name}. ${p ? plural(p, 'problem') : 'No problems yet'}, ${plural(s, 'solution')} with sources you can check. What should we look at first?`,
    `We've opened a ${d.name} section. ${plural(s, 'solution')} so far, each with its evidence. Know something that works that we're missing?`,
    `${d.name} is now part of Practical Solutions: ${plural(p, 'problem')}, ${plural(s, 'solution')}. Tell us what we've got wrong.`,
  ]);
  return fit([head, `${d.name} is now part of Practical Solutions.`], url);
}

export function problemPost(p, o) {
  const url = `${o}/problems/${p.id}`;
  const gap = p.ranked ? `Right now it's ${num(p.value)} ${p.unit} (${p.year}); the target is ${num(p.target)}.` : `${p.target_src}.`;
  const head = pick(p.id, [
    `${p.title}. ${gap} Here's what the evidence says about closing that gap.`,
    `How far are we from fixing this? ${p.title}: ${gap} Have you seen something work?`,
    `${p.title} is one of the problems we track. ${gap} What do you think is holding it back?`,
  ]);
  return fit([head, `${p.title}. ${gap}`, `${p.title}.`], url);
}

// SOCIAL-VOICE-2: wording is calibrated to the evidence label, so a contested finding is never introduced as one that works.
const lower = t => t.charAt(0).toLowerCase() + t.slice(1);
const plain = t => t.replace(/\s*\([^)]*\)\s*$/, '');
const GRADE = { 'evidence-backed': 'strong', 'mixed evidence': 'mixed', 'cited, weaker design': 'weak' };
export function solutionPost(s, o) {
  const url = `${o}/solutions/${s.id}`, t = plain(s.title), g = GRADE[s.label];
  const lead = { strong: `${t}. `, mixed: `Contested evidence: ${lower(t)}. `, weak: `Early evidence only: ${lower(t)}. ` }[g] || `${t}. `;
  const closer = { strong: 'Could this work where you are?', mixed: 'Both sides of the evidence, with sources, on the page.', weak: 'The page says what is not yet shown.' }[g] || '';
  const fallback = { strong: `${t}: backed by a trial or systematic review.`, mixed: `${t}: the evidence is contested. We set out each side, with sources.`, weak: `${t}: an early finding, not yet established.` }[g] || `${t}.`;
  return fit([`${lead}${s.claim} ${closer}`, `${lead}${s.claim}`, fallback], url);
}
// LinkedIn and other long channels get the full finding and the sources, still one link.
export function solutionLong(s, o) {
  const url = `${o}/solutions/${s.id}`, t = plain(s.title), g = GRADE[s.label];
  const lead = { strong: `${t}.`, mixed: `The evidence on ${lower(t)} is contested.`, weak: `Early evidence on ${lower(t)}.` }[g] || `${t}.`;
  const ev = (s.evidence || []).slice(0, 2).map(e => `${e.src}: ${e.finding}`).join('\n');
  return `${lead}\n\n${s.claim}${ev ? `\n\n${ev}` : ''}\n\nOur page sets out the evidence and what is not yet known. ${HOOK}\n${url}`;
}

export const metaPost = (week, i, o) => { const m = META[i % META.length]; return fit([m('').trim(), 'Practical Solutions: evidence on what works against big problems, kept current by a system that checks its own work.'], o + (m.link || '/how')); };

// Queue: hierarchy order, stable ids, so core posts each exactly once. Anything the loop touched in the last 3 days (changes feed) is an event and goes first.
export function socialQueue(cat, { origin, now = Date.now(), recent = new Set() } = {}) {
  const day = new Date(now).toISOString().slice(0, 10), wk = Math.floor(now / 6048e5);
  const q = [];
  const add = (id, text, rank, arm, extra = {}) => q.push({ id, date: day, text, kind: recent.has(id) ? 'event' : 'backlog', arm, rank, ...extra });
  for (const d of cat.domains) add('ps:domain:' + d.slug, domainPost(d, origin), 0, 'ps-domain');
  for (const p of cat.probs) add('ps:problem:' + p.id, problemPost(p, origin), 1, 'ps-problem');
  for (const s of cat.sols) add('ps:solution:' + s.id, solutionPost(s, origin), 2, 'ps-solution', { grade: GRADE[s.label], long: solutionLong(s, origin) });
  q.sort((a, b) => (a.kind !== 'event') - (b.kind !== 'event') || a.rank - b.rank);
  q.unshift({ id: 'ps:meta:' + wk, date: day, text: metaPost(wk, wk, origin), kind: 'backlog', arm: 'meta-story', rank: -1 });
  return { tenant: 'practical-solutions', origin, as_of: new Date(now).toISOString(), posts: q.map(({ rank, ...x }) => x) };
}
export const recentIds = (changes, now = Date.now()) => new Set((changes || []).filter(c => !c.at || now - Date.parse(c.at) < 3 * 864e5).flatMap(c => [c.id && ('ps:problem:' + c.id), c.id && ('ps:solution:' + c.id)]).filter(Boolean));
