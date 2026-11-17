// SPDX-License-Identifier: LicenseRef-Ultrastable-USL-1.0
// Copyright (c) 2026 Rowan Brad Quni-Gudzinas. Non-commercial use free; commercial use requires a license. See LICENSE.
// Per-income-group adjustments for benefit-cost estimates. Every number comes from a cited World Bank series refreshed daily by
// tools/refresh_context.mjs into data/context.json (`adjust`); a group without a figure gets no adjustment, never a guessed one.
// Only the cost side is adjusted (price level). No sourced per-group WELLBY value exists, so wellbeing values are not adjusted by group.
export const ADJUST_SERIES = {
  // not published for income-group aggregates, so the group figure is the median of its member countries' latest values
  price_level: { code: 'PA.NUS.PPPC.RF', perCountry: true, label: 'Price level ratio of PPP conversion factor (GDP) to market exchange rate', cite: 'World Bank, World Development Indicators, PA.NUS.PPPC.RF (International Comparison Program), or where that series has no figure PA.NUS.PPP divided by PA.NUS.FCRF for the same year; median of member countries' },
  gni_pc: { code: 'NY.GNP.PCAP.CD', label: 'GNI per capita, Atlas method (current US$)', cite: 'World Bank, World Development Indicators, NY.GNP.PCAP.CD' },
};
const LEVEL = { LIC: 'low', LMC: 'lower-middle', UMC: 'upper-middle', HIC: 'high' };

// series: { price_level: { LIC: [{year, value}, ...] }, ... } (newest first) -> { low: { price_level: { value, year, cite } }, ... }
export function buildAdjust(series) {
  const out = {};
  for (const [k, rows] of Object.entries(series)) for (const [g, lv] of Object.entries(LEVEL)) {
    const r = ((rows || {})[g] || [])[0];
    if (r && r.value > 0) (out[lv] ||= {})[k] = { value: r.value, year: r.year, cite: ADJUST_SERIES[k].cite };
  }
  return out;
}

// byCountry: { iso3: { v, year } } (parseIndicator), countries: [{ iso3, level }] -> { LIC: [{ year, value }] } with the median of the group's members
// latest value per country, unrounded (countries.js parseIndicator rounds to 0.1, too coarse for a price ratio)
export function latestByCountry(wbJson) {
  const m = {};
  for (const r of (Array.isArray(wbJson) && wbJson[1]) || []) if (r.value != null && r.countryiso3code && !(m[r.countryiso3code] && m[r.countryiso3code].year > +r.date)) m[r.countryiso3code] = { v: Number(r.value), year: +r.date };
  return m;
}
// price level = PPP conversion factor / official exchange rate (both LCU per unit), same year per country
export function ratioByCountry(ppp, fx) {
  const out = {};
  for (const [c, a] of Object.entries(ppp)) { const b = fx[c]; if (b && b.year === a.year && b.v > 0 && a.v > 0) out[c] = { v: a.v / b.v, year: a.year }; }
  return out;
}
const CODE = { low: 'LIC', 'lower-middle': 'LMC', 'upper-middle': 'UMC', high: 'HIC' };
export function groupMedian(byCountry, countries) {
  const out = {};
  for (const [lv, g] of Object.entries(CODE)) {
    const xs = countries.filter(c => c.level === lv && byCountry[c.iso3]).map(c => byCountry[c.iso3]).sort((a, b) => a.v - b.v);
    if (!xs.length) continue;
    const mid = xs.length >> 1, value = xs.length % 2 ? xs[mid].v : (xs[mid - 1].v + xs[mid].v) / 2;
    out[g] = [{ value, year: Math.max(...xs.map(x => x.year)), n: xs.length }];
  }
  return out;
}

// The model's figures were measured in `origin`; running the same programme in `target` costs price_level(target) / price_level(origin) as much.
export function costMultiplier(adjust, origin, target) {
  const a = ((adjust || {})[origin] || {}).price_level, b = ((adjust || {})[target] || {}).price_level;
  if (!a || !b || origin === target) return null;
  return { value: b.value / a.value, why: `price level ${b.value.toFixed(2)} (${target}, ${b.year}) / ${a.value.toFixed(2)} (${origin}, ${a.year}); ${b.cite}` };
}
