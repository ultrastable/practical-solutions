// SPDX-License-Identifier: LicenseRef-Ultrastable-USL-1.0
// Copyright (c) 2026 Rowan Brad Quni-Gudzinas. Non-commercial use free; commercial use requires a license. See LICENSE.
// REFERENCE-LINKS-1 page section: verified outside references for a catalogue entry (title and URL only), cited to the source with the date its
// terms were read. Data: reference-links.gen.js, written by tools/references.mjs.
import { REFERENCES } from './reference-links.gen.js';
export const linksFor = id => REFERENCES.links[id] || [];
export const section = (id, esc, R = REFERENCES) => {
  const l = R.links[id] || []; if (!l.length) return '';
  const by = {}; for (const x of l) (by[x.source] ||= []).push(x);
  return Object.entries(by).map(([k, xs]) => { const s = R.sources[k]; return `<p>Related entries in <a href="${esc(s.home)}">${esc(s.name)}</a> (${esc(s.publisher)}): ${xs.map(x => `<a href="${esc(x.url)}">${esc(x.title)}</a>`).join(', ')}. External links, checked ${esc(String(R.at || '').slice(0, 10))}; matched by topic, not a claim that the entries define the problem alike. ${esc(s.attribution)}. <a href="${esc(s.terms)}">Terms</a>.</p>`; }).join('');
};
