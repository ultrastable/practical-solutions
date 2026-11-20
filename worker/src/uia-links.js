// SPDX-License-Identifier: LicenseRef-Ultrastable-USL-1.0
// Copyright (c) 2026 Rowan Brad Quni-Gudzinas. Non-commercial use free; commercial use requires a license. See LICENSE.
// UIA-LINKS-1: cross-links from catalogue problems to the Union of International Associations' Encyclopedia of World Problems and Human Potential
// (UIA, not the Universal Ignorance Audit used elsewhere in this repository). UIA's terms (uia.org/terms) allow links and say reproduction needs the
// source acknowledged, but name no licence for the Encyclopedia's data and reserve the right to refuse extensive redistribution. So this module holds
// only a curated title and URL per match, never UIA's text, and the pages cite the source and retrieval date. A bulk harvest is not allowed here.
export const UIA = {
  name: 'Union of International Associations (UIA)', home: 'https://uia.org/', terms: 'https://uia.org/terms', contact: 'https://uia.org/contact-uia',
  encyclopedia: 'Encyclopedia of World Problems and Human Potential', encyclopedia_url: 'https://encyclopedia.uia.org/',
  copyright: '© Union of International Associations 1997 - present', retrieved: '2026-11-20',
};
const L = (title, path) => ({ title, url: 'https://encyclopedia.uia.org/' + path });
// Catalogue entry id -> UIA entries found by search on the retrieval date. Add a row only for a match a person-readable title can justify.
export const LINKS = {
  'sdg-3-3-3': [L('Malaria', 'problem/malaria')], 'who-malaria-est-incidence': [L('Malaria', 'problem/malaria')], 'wb-sh-mlr-incd-p3': [L('Malaria', 'problem/malaria')],
  'sdg-2-1-1': [L('Hunger', 'problem/hunger'), L('Malnutrition', 'en/problem/133486')], 'wb-sn-itk-defc-zs': [L('Hunger', 'problem/hunger'), L('Malnutrition', 'en/problem/133486')],
  'sdg-3-4-2': [L('Suicide', 'problem/suicide')], 'who-mh-12': [L('Suicide', 'problem/suicide')], 'wb-sh-sta-suic-ma-p5': [L('Suicide', 'problem/suicide')],
  'wb-sh-h2o-smdw-zs': [L('Polluted drinking water', 'en/problem/polluted-drinking-water'), L('Long-term shortage of water', 'problem/long-term-shortage-water')],
  'wb-sh-h2o-smdw-ur-zs': [L('Polluted drinking water', 'en/problem/polluted-drinking-water')],
};
export const linksFor = id => LINKS[id] || [];
export const section = (id, esc) => { const l = linksFor(id); return l.length ? `<p>Related entries in UIA's ${esc(UIA.encyclopedia)}: ${l.map(x => `<a href="${esc(x.url)}">${esc(x.title)}</a>`).join(', ')}. External links, found ${esc(UIA.retrieved)}; the match is by topic, not a claim that the two entries define the problem alike. Source: <a href="${esc(UIA.encyclopedia_url)}">${esc(UIA.encyclopedia)}</a>, ${esc(UIA.copyright)}.</p>` : ''; };
