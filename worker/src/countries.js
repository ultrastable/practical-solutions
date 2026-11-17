// SPDX-License-Identifier: LicenseRef-Ultrastable-USL-1.0
// Copyright (c) 2026 Rowan Brad Quni-Gudzinas. Non-commercial use free; commercial use requires a license. See LICENSE.
// Country context: income group, Human Development Index tier and infrastructure access, from World Bank and UNDP data.
// The snapshot (data/context.json) is written by tools/refresh_context.mjs on GitHub Actions (daily) and bundled into the Worker, so a
// request never waits on an upstream API. Every figure carries its year; a source that could not be loaded is named, never guessed.
import { LEVELS, fitFor } from './context.js';

export const GROUPS = { LIC: 'low', LMC: 'lower-middle', UMC: 'upper-middle', HIC: 'high' };
export const GROUP_ISO2 = { XM: 'LIC', XN: 'LMC', XT: 'UMC', XD: 'HIC' };
// Infrastructure indicators (World Bank WDI), keyed by the short name used on pages.
export const INFRA = {
  water: { code: 'SH.H2O.BASW.ZS', label: 'People with at least basic drinking water', unit: '%' },
  sanitation: { code: 'SH.STA.BASS.ZS', label: 'People with at least basic sanitation', unit: '%' },
  electricity: { code: 'EG.ELC.ACCS.ZS', label: 'People with electricity', unit: '%' },
  cooking: { code: 'EG.CFT.ACCS.ZS', label: 'People with clean cooking fuel', unit: '%' },
  internet: { code: 'IT.NET.USER.ZS', label: 'People using the internet', unit: '%' },
};
// Human Development Index tiers (UNDP): very high >= 0.800, high 0.700-0.799, medium 0.550-0.699, low < 0.550.
export const hdiTier = v => (v == null || !Number.isFinite(v) ? null : v >= 0.8 ? 'very high' : v >= 0.7 ? 'high' : v >= 0.55 ? 'medium' : 'low');
export const TIER_LEVEL = { 'very high': 'high', high: 'upper-middle', medium: 'lower-middle', low: 'low' };
// A solution that depends on infrastructure matters where access is below the threshold; at or above it the gap is nearly closed.
export const NEEDS = {
  chlorine: { key: 'water', below: 99, why: 'Treating water at home or at the tap matters where basic drinking water is not yet universal' },
  'rural-electrification': { key: 'electricity', below: 99, why: 'Grid or off-grid connection matters where electricity access is not yet universal' },
  'clean-cooking': { key: 'cooking', below: 95, why: 'Clean cooking matters where households still burn solid fuels' },
  'mobile-money': { key: 'internet', above: 20, why: 'Mobile money needs enough connectivity for people to use a phone for payments' },
};

export const norm = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

// ---- build (used by the refresh tool and tested with fixtures) -------------------------------------------------------------------------------------------
export function parseCountries(wbJson) {
  const rows = Array.isArray(wbJson) && Array.isArray(wbJson[1]) ? wbJson[1] : [];
  return rows.filter(r => r.region && r.region.id !== 'NA' && r.id).map(r => ({ iso3: r.id, iso2: r.iso2Code, name: r.name, region: r.region.value.trim(), level: GROUPS[r.incomeLevel && r.incomeLevel.id] || null }));
}
export function parseIndicator(wbJson) {
  const m = {};
  for (const r of (Array.isArray(wbJson) && wbJson[1]) || []) if (r.value != null && r.countryiso3code && !(m[r.countryiso3code] && m[r.countryiso3code].year > +r.date)) m[r.countryiso3code] = { v: Math.round(Number(r.value) * 10) / 10, year: +r.date };
  return m;
}
const csvRows = text => { const out = []; let row = [], cell = '', q = false; for (let i = 0; i < text.length; i++) { const c = text[i]; if (q) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; } else if (c === '"') q = true; else if (c === ',') { row.push(cell); cell = ''; } else if (c === '\n') { row.push(cell); out.push(row); row = []; cell = ''; } else if (c !== '\r') cell += c; } if (cell || row.length) { row.push(cell); out.push(row); } return out; };
// UNDP composite-indices time series: columns iso3, country, hdicode (tier) and hdi_<year>. The latest non-empty year is taken; the tier is recomputed from the value and checked against hdicode.
export function parseHdr(csv) {
  const [head, ...rows] = csvRows(csv.replace(/^﻿/, '')); if (!head) return {};
  const ix = n => head.indexOf(n), yc = head.map((h, i) => [h, i]).filter(([h]) => /^hdi_\d{4}$/.test(h)).sort((a, b) => b[0].localeCompare(a[0]));
  const out = {};
  for (const r of rows) {
    const iso = r[ix('iso3')]; if (!/^[A-Z]{3}$/.test(iso || '')) continue;
    for (const [h, i] of yc) { const v = parseFloat(r[i]); if (Number.isFinite(v)) { out[iso] = { value: v, year: +h.slice(4), tier: hdiTier(v), published_tier: (r[ix('hdicode')] || '').toLowerCase() || null }; break; } }
  }
  return out;
}
export function build({ countries, infra = {}, hdi = null, sources = {}, at }) {
  const out = {};
  for (const c of countries) {
    const inf = {};
    for (const k of Object.keys(INFRA)) if (infra[k] && infra[k][c.iso3]) inf[k] = infra[k][c.iso3];
    out[c.iso3] = { ...c, hdi: hdi && hdi[c.iso3] ? hdi[c.iso3] : null, infra: inf };
  }
  return { at, sources, countries: out };
}

// ---- lookup ---------------------------------------------------------------------------------------------------------------------------------------
export const ALIASES = { usa: 'USA', us: 'USA', uk: 'GBR', britain: 'GBR', 'great britain': 'GBR', england: 'GBR', uae: 'ARE', russia: 'RUS', turkey: 'TUR', 'south korea': 'KOR', korea: 'KOR', 'north korea': 'PRK', vietnam: 'VNM', laos: 'LAO', iran: 'IRN', syria: 'SYR', egypt: 'EGY', gambia: 'GMB', bahamas: 'BHS', venezuela: 'VEN', yemen: 'YEM', slovakia: 'SVK', kyrgyzstan: 'KGZ', congo: 'COD', 'ivory coast': 'CIV', burma: 'MMR', czechia: 'CZE', 'czech republic': 'CZE', swaziland: 'SWZ', eswatini: 'SWZ', brunei: 'BRN', macau: 'MAC', 'hong kong': 'HKG' };
export function findCountries(data, q) {
  const n = norm(q); if (!n) return [];
  const list = Object.values(data.countries || {});
  if (ALIASES[n] && data.countries[ALIASES[n]]) return [data.countries[ALIASES[n]]];
  const iso = list.find(c => c.iso3.toLowerCase() === n.replace(/ /g, '') || (c.iso2 || '').toLowerCase() === n);
  if (iso) return [iso];
  const exact = list.filter(c => norm(c.name) === n); if (exact.length) return exact;
  const pre = list.filter(c => norm(c.name).startsWith(n)); if (pre.length) return pre;
  return list.filter(c => norm(c.name).includes(n)).sort((a, b) => a.name.localeCompare(b.name));
}
// The level used to pick solutions: the World Bank income group, else the HDI tier's equivalent (and the page says which).
export const levelOf = c => (c.level ? { id: c.level, via: 'income group' } : c.hdi && c.hdi.tier ? { id: TIER_LEVEL[c.hdi.tier], via: 'HDI tier' } : null);

// Solutions relevant to one country: the income level must fit, and an infrastructure condition must not already be met.
export function solutionsFor(c, sols) {
  const lv = levelOf(c), out = { level: lv, relevant: [], less: [] };
  for (const s of sols) {
    const fit = s.fit || fitFor(s.id), reasons = [];
    let ok = true;
    if (lv && !fit.levels.includes(lv.id)) { ok = false; reasons.push(`Mostly relevant at other income levels: ${fit.why}`); }
    const need = NEEDS[s.id], got = need && c.infra[need.key];
    if (need && got) {
      if (need.below != null && got.v >= need.below) { ok = false; reasons.push(`${INFRA[need.key].label.toLowerCase()} is already ${got.v}% (${got.year}), so this gap is nearly closed here`); }
      else if (need.below != null) reasons.push(`${need.why}: ${got.v}% here (${got.year})`);
      if (need.above != null && got.v < need.above) { ok = false; reasons.push(`${INFRA[need.key].label.toLowerCase()} is ${got.v}% (${got.year}), which may be too low to rely on yet`); }
      else if (need.above != null) reasons.push(`${INFRA[need.key].label.toLowerCase()} is ${got.v}% (${got.year})`);
    } else if (need) reasons.push('Infrastructure figure not available for this country; judged by income level only');
    if (ok && !reasons.length) reasons.push(fit.why);
    (ok ? out.relevant : out.less).push({ s, reasons });
  }
  return out;
}
export { LEVELS };
