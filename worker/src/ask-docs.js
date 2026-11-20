// SPDX-License-Identifier: LicenseRef-Ultrastable-USL-1.0
// Copyright (c) 2026 Rowan Brad Quni-Gudzinas. Non-commercial use free; commercial use requires a license. See LICENSE.
// ASK-1 (tenant side): what a visitor may ask about. Documents are this site's own pages (problems, solutions, catalogue entries, syntheses); the
// generic retrieval, answer checking and endpoint are core/ask. tools/askindex.mjs turns these into the generated index the Worker ships.
import { SCAN } from './problem-scan.gen.js';
import { SYNTHESES_PUBLISHED } from './syntheses.gen.js';

const t = (...a) => a.flat().filter(Boolean).join('. ').replace(/\s+/g, ' ');
export function askDocs(c, scan = SCAN, syn = SYNTHESES_PUBLISHED) {
  const sols = c.sols.map(s => ({ id: 'solutions/' + s.id, type: 'solution', url: '/solutions/' + s.id, title: s.title, text: t(s.claim, s.works_where, 'Who: ' + s.who, 'Takes: ' + s.takes, 'Limits: ' + s.limits, s.domains.join(', '), s.label, (s.evidence || []).map(e => e.src + ': ' + e.finding)) }));
  const probs = c.probs.map(p => ({ id: 'problems/' + p.id, type: 'problem', url: '/problems/' + p.id, title: p.title, text: t(p.domain, p.unit, p.target_src, (c.byProblem[p.id] || []).map(s => 'Solution: ' + s.title)) }));
  const cat = scan.entries.map(e => ({ id: 'catalogue/' + e.id, type: 'catalogue', url: '/catalogue/' + e.id, title: e.title, text: t(e.domain, e.m ? `World figure ${e.m.value} in ${e.m.year}; ${e.m.status}` : 'Recognised problem, no world figure read yet', (c.sols || []).some(s => (s.problem_ids || []).includes(e.id)) ? '' : 'Solution sought') }));
  const syns = syn.published.map(s => ({ id: 'syntheses/' + s.id, type: 'new solution', url: '/syntheses/' + s.id, title: s.title, text: t(s.headline, s.problem, s.mechanism, s.domain) }));
  return [...sols, ...probs, ...cat, ...syns];
}
