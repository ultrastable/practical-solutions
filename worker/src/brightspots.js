// SPDX-License-Identifier: LicenseRef-Ultrastable-USL-1.0
// Copyright (c) 2026 Rowan Brad Quni-Gudzinas. Non-commercial use free; commercial use requires a license. See LICENSE.
// Bright spots: countries doing markedly better on a problem's indicator than their income predicts, in two separate periods.
// These are leads, not solutions: each one says where to look for what is being done differently. Honest limits are returned with the result:
// income is the only control, indicators are noisy, and a spot that persists in two periods is still a hypothesis.
const WB = 'https://api.worldbank.org/v2';
const INCOME = 'NY.GDP.PCAP.PP.CD';

async function getJson(fetchFn, url) {
  const r = await fetchFn(url);
  if (!r.ok) throw new Error(`World Bank HTTP ${r.status}`);
  return r.json();
}

// Latest non-empty value per country between two years, for real countries only.
export async function snapshot(fetchFn, ind, from, to, countries) {
  const j = await getJson(fetchFn, `${WB}/country/all/indicator/${ind}?format=json&per_page=1000&date=${from}:${to}&mrnev=1`);
  const out = {};
  for (const r of (Array.isArray(j) ? j[1] : null) || []) if (r.value != null && countries.has(r.countryiso3code)) out[r.countryiso3code] = { v: +r.value, name: r.country.value, year: +r.date };
  return out;
}

export async function countryList(fetchFn) {
  const j = await getJson(fetchFn, `${WB}/country?format=json&per_page=400`);
  return new Set(((Array.isArray(j) ? j[1] : null) || []).filter(c => c.region && c.region.id !== 'NA').map(c => c.id));
}

// Ordinary least squares of y on ln(x); returns each unit's standardised residual, signed so that positive means better than predicted.
export function residuals(rows, lower) {
  const n = rows.length;
  const xs = rows.map(r => Math.log(r.x)), ys = rows.map(r => r.y);
  const mx = xs.reduce((a, b) => a + b, 0) / n, my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0, sxx = 0;
  xs.forEach((x, i) => { sxy += (x - mx) * (ys[i] - my); sxx += (x - mx) ** 2; });
  const b = sxx ? sxy / sxx : 0, a = my - b * mx;
  const res = ys.map((y, i) => y - (a + b * xs[i]));
  const sd = Math.sqrt(res.reduce((s, r) => s + r * r, 0) / Math.max(1, n - 2)) || 1;
  return Object.fromEntries(rows.map((r, i) => [r.iso, (lower ? -res[i] : res[i]) / sd]));
}

function zFor(ind, income, lower) {
  const rows = Object.keys(ind).filter(k => income[k] && income[k].v > 0).map(k => ({ iso: k, x: income[k].v, y: ind[k].v }));
  return rows.length >= 30 ? residuals(rows, lower) : null;
}

export async function findSpots(fetchFn, p, { now = new Date().getUTCFullYear(), minZ = 1.25 } = {}) {
  const countries = await countryList(fetchFn);
  const periods = [[now - 4, now], [now - 10, now - 6]];
  const zs = [];
  for (const [from, to] of periods) {
    const [y, x] = [await snapshot(fetchFn, p.ind, from, to, countries), await snapshot(fetchFn, INCOME, from, to, countries)];
    zs.push({ z: zFor(y, x, p.lower), y });
  }
  if (!zs[0].z || !zs[1].z) return { spots: [], note: 'too few countries with data in both periods' };
  const spots = Object.keys(zs[0].z).filter(k => zs[0].z[k] >= minZ && (zs[1].z[k] ?? -9) >= minZ)
    .map(k => ({ iso: k, name: zs[0].y[k].name, value: zs[0].y[k].v, year: zs[0].y[k].year, z_now: +zs[0].z[k].toFixed(2), z_before: +zs[1].z[k].toFixed(2) }))
    .sort((a, b) => b.z_now + b.z_before - a.z_now - a.z_before).slice(0, 6);
  return { spots, note: `Better than income predicts by at least ${minZ} standard deviations in both ${periods[0].join('-')} and ${periods[1].join('-')}. Income is the only control; treat each as a lead to investigate, not a finding.` };
}
