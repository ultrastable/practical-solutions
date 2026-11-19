// SPDX-License-Identifier: LicenseRef-Ultrastable-USL-1.0
// Copyright (c) 2026 Rowan Brad Quni-Gudzinas. Non-commercial use free; commercial use requires a license. See LICENSE.
// Problems ranked separately for each World Bank income group, from the groups' own aggregate series (LIC, LMC, UMC, HIC). The same
// international target applies to every group, so a group's rank shows where the gap is largest for people living in that setting.
import { shortfall } from './problems.js';
import { GROUPS, GROUP_ISO2 } from './countries.js';

// WB answer for `country/LIC;LMC;UMC;HIC/indicator/X`: rows for all four groups -> { LIC: [{year,value}...newest first], ... }
export function parseGroupSeries(wbJson) {
  const out = {};
  for (const r of (Array.isArray(wbJson) && wbJson[1]) || []) {
    const g = GROUPS[r.countryiso3code] ? r.countryiso3code : GROUP_ISO2[r.country && r.country.id];
    if (g && r.value != null) (out[g] ||= []).push({ year: +r.date, value: +r.value });
  }
  for (const g of Object.keys(out)) out[g].sort((a, b) => b.year - a.year);
  return out;
}

// series: { [problemId]: { LIC: rows, ... } | null }.  Returns { low: [ranked problems], ... }; a problem without usable data for a group is listed as unranked there.
export function rankLevels(problems, series) {
  const out = {};
  for (const [g, level] of Object.entries(GROUPS)) {
    const rows = problems.map(p => {
      const s = series[p.id] && series[p.id][g], latest = s && s[0], base = p.target_from && s ? s.find(x => x.year === p.target_from) : null;
      const r = latest ? shortfall(p, latest.value, base && base.value) : { target: null, shortfall: null };
      return { id: p.id, title: p.title, domain: p.domain, unit: p.unit, target: r.target, target_src: p.target_src, value: latest ? Math.round(latest.value * 100) / 100 : null, year: latest ? latest.year : null, shortfall: r.shortfall };
    });
    const ranked = rows.filter(x => x.shortfall != null).sort((a, b) => b.shortfall - a.shortfall).map((x, i) => ({ rank: i + 1, ...x }));
    out[level] = { ranked, unranked: rows.filter(x => x.shortfall == null).map(x => ({ id: x.id, title: x.title })) };
  }
  return out;
}
