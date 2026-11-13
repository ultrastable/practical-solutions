// SPDX-License-Identifier: LicenseRef-Ultrastable-USL-1.0
// Copyright (c) 2026 Rowan Brad Quni-Gudzinas. Non-commercial use free; commercial use requires a license. See LICENSE.
// Data sources. Each returns a dataset (see detect.js) and takes its network port as an argument.
import { synthWorld } from './synth.js';

export function syntheticSource(cfg = {}) {
  return { async get({ epoch = 0 } = {}) { return synthWorld({ ...cfg, epoch }); } };
}

const WB = 'https://api.worldbank.org/v2';
// A real source: country-level indicators from the World Bank open API. outcome/context/practices are indicator codes.
// transform: { CODE: 'log' } for skewed indicators. Aggregates (regions, income groups) are excluded; units with any
// missing indicator are dropped (listwise), and the count dropped is reported.
export function worldBankSource({ fetch: f = globalThis.fetch, outcome, context, practices, transform = {}, from = 2015, to = 2024 } = {}) {
  const ind = async code => {
    const r = await f(`${WB}/country/all/indicator/${code}?format=json&per_page=20000&date=${from}:${to}&mrnev=1`);
    if (!r.ok) throw new Error(`worldbank ${code}: HTTP ${r.status}`);
    const j = await r.json();
    if (!Array.isArray(j) || !Array.isArray(j[1])) throw new Error(`worldbank ${code}: unexpected response`);
    const m = new Map();
    for (const row of j[1]) if (row.value != null && row.countryiso3code) m.set(row.countryiso3code, { v: Number(row.value), name: row.country && row.country.value, date: row.date });
    return m;
  };
  return {
    async get() {
      const cr = await f(`${WB}/country?format=json&per_page=400`);
      if (!cr.ok) throw new Error(`worldbank countries: HTTP ${cr.status}`);
      const cj = await cr.json();
      const countries = new Set((cj[1] || []).filter(c => c.region && c.region.id !== 'NA').map(c => c.id));
      const codes = [outcome.id, ...context, ...practices];
      const maps = await Promise.all(codes.map(ind));
      const tf = (code, v) => (transform[code] === 'log' ? (v > 0 ? Math.log(v) : NaN) : v);
      const units = [];
      let dropped = 0;
      for (const iso of maps[0].keys()) {
        if (!countries.has(iso)) continue;
        const vals = maps.map((m, i) => (m.has(iso) ? tf(codes[i], m.get(iso).v) : NaN));
        if (vals.some(v => !Number.isFinite(v))) { dropped++; continue; }
        const ctx = {}, pr = {};
        context.forEach((c, i) => { ctx[c] = vals[1 + i]; });
        practices.forEach((c, i) => { pr[c] = vals[1 + context.length + i]; });
        units.push({ id: iso, name: maps[0].get(iso).name || iso, outcome: vals[0], context: ctx, practices: pr });
      }
      const vintage = Math.max(...[...maps[0].values()].map(x => Number(x.date) || 0));
      return { units, contextKeys: context, practiceKeys: practices, higherIsBetter: outcome.higherIsBetter !== false, dropped, vintage, source: 'worldbank' };
    },
  };
}

export function makeSource(spec, ports = {}) {
  if (spec.type === 'synthetic') return syntheticSource(spec);
  if (spec.type === 'worldbank') return worldBankSource({ ...spec, fetch: ports.fetch });
  throw new Error(`unknown source type ${spec.type}`);
}
