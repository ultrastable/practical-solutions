// SPDX-License-Identifier: LicenseRef-Ultrastable-USL-1.0
// Copyright (c) 2026 Rowan Brad Quni-Gudzinas. Non-commercial use free; commercial use requires a license. See LICENSE.
// Who the encyclopedia is for. This is data: the /for pages render it, and ux/stories.js attaches the user stories and acceptance
// steps to each id, so the audience list, the pages and the tests cannot drift apart. Add an audience here and a story for it.
export const AUDIENCES = [
  { id: 'implementers', name: 'Implementers', hue: 150, who: 'Ministry and agency staff, municipal programme officers, NGO programme leads.',
    goal: 'Pick a solution that can be delivered with the money and channels you already have, and start with its cheapest test.',
    start: { href: '/solutions?ready=ready', label: 'Solutions ready to implement' } },
  { id: 'funders', name: 'Funders', hue: 35, who: 'Foundations, donors, small funders and the advisers who brief them.',
    goal: 'See where a grant buys the most evidence-backed change, and where the evidence is too thin to fund yet.',
    start: { href: '/solutions?cost=low&sort=impl', label: 'Low-cost solutions, best first' } },
  { id: 'researchers', name: 'Researchers', hue: 265, who: 'Evidence synthesisers, academics and students.',
    goal: 'Trace every claim to its source, see how evidence is graded, and find the gaps worth studying.',
    start: { href: '/method', label: 'How evidence is graded' } },
  { id: 'journalists', name: 'Journalists and educators', hue: 5, who: 'Reporters, editors, teachers and communicators.',
    goal: 'Quote a claim accurately, with its label and limits, and know what is disputed.',
    start: { href: '/solutions?label=mixed+evidence', label: 'Where the evidence is mixed' } },
  { id: 'public', name: 'Curious public', hue: 200, who: 'Anyone who wants to know what could actually be done about a problem.',
    goal: 'Understand a problem in plain words and see what works, without wading through papers.',
    start: { href: '/problems', label: 'Problems by size of the gap' } },
  { id: 'developers', name: 'Developers and AI agents', hue: 320, who: 'Software that reads the catalogue, and the people who build it.',
    goal: 'Read the whole catalogue as data, with labels and sources intact, and know when it changed.',
    start: { href: '/api', label: 'Data and API' } },
  { id: 'experts', name: 'Domain experts and reviewers', hue: 90, who: 'People who know a field well enough to correct an entry.',
    goal: 'Find the entries most in need of review and tell us exactly what is wrong.',
    start: { href: '/solutions?label=cited%2C+weaker+design', label: 'Entries with weaker evidence' } },
];
export const audience = id => AUDIENCES.find(a => a.id === id) || null;
