// SPDX-License-Identifier: LicenseRef-Ultrastable-USL-1.0
// Copyright (c) 2026 Rowan Brad Quni-Gudzinas. Non-commercial use free; commercial use requires a license. See LICENSE.
// STICKY-1: the content feed (JSON Feed 1.1 with the stickiness extension _domain, _kind, _depth) that the platform's `stickiness` step reads to judge
// whether this system gives a reader a reason to come back. Entries are the catalogue's own solutions and syntheses; the date of each is the commit
// that first added it (worker/src/content-dates.gen.js, kept complete by tools/content_dates.mjs and a test), never the date of a rebuild.
import { SOLUTIONS } from './solutions.js';
import { SYNTHESES } from './syntheses-data.js';
import { DATES } from './content-dates.gen.js';

export function contentEntries(origin) {
  const sols = SOLUTIONS.map(s => ({ id: 'solution:' + s.id, url: `${origin}/solutions/${s.id}`, title: s.title, summary: s.claim, domain: (s.problem_ids || [])[0] || 'other', kind: 'solution', depth: (s.evidence || []).length, at: DATES['solution:' + s.id] }));
  const syn = SYNTHESES.map(s => ({ id: 'synthesis:' + s.id, url: `${origin}/syntheses/${s.id}`, title: s.title, summary: s.headline, domain: String(s.domain || 'other').toLowerCase(), kind: 'synthesis', depth: (s.citations || []).length, at: DATES['synthesis:' + s.id] }));
  return [...sols, ...syn].filter(e => e.at);
}
export const contentFeed = origin => ({ version: 'https://jsonfeed.org/version/1.1', title: 'Practical Solutions: new entries', home_page_url: origin, feed_url: origin + '/content.json',
  description: 'Every solution and synthesis in the catalogue, dated by when it was first added.',
  items: contentEntries(origin).sort((a, b) => (a.at < b.at ? 1 : -1)).map(e => ({ id: e.id, url: e.url, title: e.title, content_text: e.summary || '', date_published: e.at, tags: [e.domain, e.kind], _domain: e.domain, _kind: e.kind, _depth: e.depth })) });
