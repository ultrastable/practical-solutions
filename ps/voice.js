// SPDX-License-Identifier: LicenseRef-Ultrastable-USL-1.0
// Copyright (c) 2026 Rowan Brad Quni-Gudzinas. Non-commercial use free; commercial use requires a license. See LICENSE.
// How Practical Solutions talks on social media. The site is a hierarchy (domain -> problem -> solution), so the posts are too:
// a new domain is announced first, then its problems, then the fixes. Plain, warm, specific; every post ends on something a
// reader can answer. Wording varies by a stable hash so a feed never reads like a template. Facts come only from the entry.
import { PROBLEMS } from '../worker/src/problems.js';
import { DOMAIN_META } from '../worker/src/domains-meta.js';

const slug = s => String(s).toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const pick = (id, xs) => xs[[...String(id)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % xs.length];
const low = s => String(s || '').charAt(0).toLowerCase() + String(s || '').slice(1);
const trimDot = s => String(s || '').trim().replace(/[.\s]+$/, '');
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

export function domainPost(d) {
  const blurb = DOMAIN_META[d.name]?.blurb || '';
  const count = `${plural(d.problems.length, 'problem', 'problems')} we're tracking, ${plural(d.solutions.length, 'fix', 'fixes')} with real evidence behind ${d.solutions.length === 1 ? 'it' : 'them'}`;
  const [title, body] = pick(d.slug, [
    [`New on Practical Solutions: ${d.name}`, `${blurb} ${count}. What would you add?`],
    [`We just opened up ${d.name}`, `${blurb} So far: ${count}. If you work in this space, would you poke holes in it?`],
    [`${d.name} has its own section now`, `${count}. Every claim links to the study it came from. What's the one fix you'd want everyone to know about?`],
  ]);
  return { id: `domain:${d.slug}`, title, summary: body.trim(), url: `/domains/${d.slug}`, tags: [d.name, 'PublicGood'] };
}

export function problemPost(p, fixes) {
  const n = fixes.length;
  const [title, body] = pick(p.id, [
    [`Let's talk about ${low(p.title)}`, `The goal the world signed up to: ${p.target_src}. We're not there. ${n ? `We've found ${plural(n, 'approach', 'approaches')} with evidence behind ${n === 1 ? 'it' : 'them'}.` : `We're still hunting for fixes that hold up.`} Know a place doing better than it should?`],
    [`${trimDot(p.title)}: where things actually stand`, `Target: ${p.target_src}. ${n ? `${plural(n, 'fix', 'fixes')} on the page, each with its source and its limits.` : 'No proven fix listed yet.'} What are we missing?`],
  ]);
  return { id: `problem:${p.id}`, title, summary: body, url: `/problems/${p.id}`, tags: [p.domain] };
}

export function solutionPost(s) {
  const claim = trimDot(s.claim), test = trimDot(s.first_test);
  const [title, body] = pick(s.id, [
    [`This one's cheap and it works`, `${claim}. Want to try it? ${test}. Has anyone here seen it done?`],
    [`A fix for ${low(s.problem)} more people should know about`, `${claim}. Smallest way to test it: ${low(test)}. Would this work where you are?`],
    [trimDot(s.title), `${claim}. The catch: ${low(trimDot(s.limits))}. Worth trying anyway?`],
  ]);
  return { id: `solution:${s.id}`, title, summary: body, url: `/solutions/${s.id}`, tags: s.domains || [] };
}

/** Every post, in the order it should go out: domains, then problems, then solutions. URLs are absolute on origin. */
export function postsFor(solutions, origin, problems = PROBLEMS) {
  const domOf = s => [...new Set((s.problem_ids || []).map(id => problems.find(p => p.id === id)?.domain).filter(Boolean))];
  const sols = solutions.map(s => ({ ...s, domains: s.domains || domOf(s) }));
  const domains = [...new Set(problems.map(p => p.domain))].map(name => ({ name, slug: slug(name), problems: problems.filter(p => p.domain === name), solutions: sols.filter(s => s.domains.includes(name)) }));
  return [
    ...domains.map(domainPost),
    ...problems.map(p => problemPost(p, sols.filter(s => (s.problem_ids || []).includes(p.id)))),
    ...sols.map(solutionPost),
  ].map(e => ({ ...fit(e), url: origin + e.url }));
}

// Bluesky allows 300 characters including link, tags and disclosure; ~170 is left for the words. Sentences are dropped from the
// middle (never the opening or the closing question) until it fits, so no post is ever cut off mid-thought.
export const ROOM = 170;
export function fit(e, room = ROOM) {
  let parts = e.summary.match(/[^.?!]+[.?!]+/g) || [e.summary];
  parts = parts.map(x => x.trim());
  while (parts.length > 2 && `${e.title}. ${parts.join(' ')}`.length > room) parts.splice(parts.length - 2, 1);
  if (parts.length > 1 && `${e.title}. ${parts.join(' ')}`.length > room) {
    // still too long: shorten the opening sentence at a word boundary, keep the closing question whole
    const last = parts[parts.length - 1], first = parts.slice(0, -1).join(' ');
    const budget = Math.max(20, room - e.title.length - last.length - 6);
    if (first.length > budget) parts = [first.slice(0, budget).replace(/\s+\S*$/, '').replace(/[,;:\s]+$/, '') + '…', last];
  }
  return { ...e, summary: parts.join(' ') };
}
