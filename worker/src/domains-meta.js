// SPDX-License-Identifier: LicenseRef-Ultrastable-USL-1.0
// Copyright (c) 2026 Rowan Brad Quni-Gudzinas. Non-commercial use free; commercial use requires a license. See LICENSE.
// Presentation facts about a domain. A new domain needs no entry here: it gets a stable colour and a generated blurb, and shows up
// on the home page, the domain index, filters, search and the sitemap automatically. Add an entry only to improve the wording.
export const DOMAIN_META = {
  'Child health': { blurb: 'Keeping children alive and well through the first five years.' },
  'Maternal health': { blurb: 'Safe pregnancy and childbirth.' },
  'Chronic disease': { blurb: 'Heart disease, cancer, diabetes and lung disease.' },
  'Mental health': { blurb: 'Depression, suicide and the care that reaches people.' },
  'Infectious disease': { blurb: 'Tuberculosis, malaria and other diseases that spread.' },
  Poverty: { blurb: 'Income, savings and access to money.' },
  Food: { blurb: 'Hunger and children who do not grow as they should.' },
  Water: { blurb: 'Safe drinking water and sanitation.' },
  'Energy and air': { blurb: 'Electricity, cooking fuel and the air people breathe.' },
  Education: { blurb: 'Children in school and learning.' },
  Safety: { blurb: 'Preventable injury and death.' },
  'Digital access': { blurb: 'Who is connected and who is not.' },
  'Governance and gender': { blurb: 'Representation, registration and rights.' },
};
const hash = s => [...String(s)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
export function domainMeta(d) {
  const m = DOMAIN_META[d.name] || {};
  return { hue: m.hue ?? hash(d.slug) % 360, blurb: m.blurb || `${d.problems.length} problem${d.problems.length === 1 ? '' : 's'} and ${d.solutions.length} solution${d.solutions.length === 1 ? '' : 's'}.` };
}
