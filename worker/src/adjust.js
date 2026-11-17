// SPDX-License-Identifier: LicenseRef-Ultrastable-USL-1.0
// Copyright (c) 2026 Rowan Brad Quni-Gudzinas. Non-commercial use free; commercial use requires a license. See LICENSE.
// Per-income-group adjustments for benefit-cost estimates. Every number comes from a cited World Bank series refreshed daily by
// tools/refresh_context.mjs into data/context.json (`adjust`); a group without a figure gets no adjustment, never a guessed one.
// Only the cost side is adjusted (price level). No sourced per-group WELLBY value exists, so wellbeing values are not adjusted by group.
export const ADJUST_SERIES = {
  price_level: { code: 'PA.NUS.PPPC.RF', label: 'Price level ratio of PPP conversion factor (GDP) to market exchange rate', cite: 'World Bank, World Development Indicators, PA.NUS.PPPC.RF (International Comparison Program)' },
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

// The model's figures were measured in `origin`; running the same programme in `target` costs price_level(target) / price_level(origin) as much.
export function costMultiplier(adjust, origin, target) {
  const a = ((adjust || {})[origin] || {}).price_level, b = ((adjust || {})[target] || {}).price_level;
  if (!a || !b || origin === target) return null;
  return { value: b.value / a.value, why: `price level ${b.value.toFixed(2)} (${target}, ${b.year}) / ${a.value.toFixed(2)} (${origin}, ${a.year}); ${b.cite}` };
}
