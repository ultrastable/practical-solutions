// SPDX-License-Identifier: LicenseRef-Ultrastable-USL-1.0
// Copyright (c) 2026 Rowan Brad Quni-Gudzinas. Non-commercial use free; commercial use requires a license. See LICENSE.
// Problem selection. A problem is on the list when a public global indicator sits far from its international target.
// Basis: World Bank open API, world aggregate, latest non-null year. Score = shortfall to target, in [0,1].
// Limits stated on the page: this ranks gap to target, not deaths or DALYs; it ignores tractability, which the solutions catalogue supplies.
// Self-contained (no imports) so any Worker can embed it.
export const PROBLEMS = [
  { id: 'under5', title: 'Children dying before age five', domain: 'Child health', ind: 'SH.DYN.MORT', unit: 'deaths per 1,000 births', lower: true, target: 25, target_src: 'SDG 3.2: at most 25 per 1,000' },
  { id: 'neonatal', title: 'Newborn deaths', domain: 'Child health', ind: 'SH.DYN.NMRT', unit: 'deaths per 1,000 births', lower: true, target: 12, target_src: 'SDG 3.2: at most 12 per 1,000' },
  { id: 'maternal', title: 'Mothers dying in childbirth', domain: 'Maternal health', ind: 'SH.STA.MMRT', unit: 'deaths per 100,000 births', lower: true, target: 70, target_src: 'SDG 3.1: below 70 per 100,000' },
  { id: 'ncd', title: 'Early death from heart disease, cancer, diabetes and lung disease', domain: 'Chronic disease', ind: 'SH.DYN.NCOM.ZS', unit: '% chance of dying between 30 and 70', lower: true, target_from: 2015, factor: 2 / 3, target_src: 'SDG 3.4: one-third lower than 2015' },
  { id: 'suicide', title: 'Suicide', domain: 'Mental health', ind: 'SH.STA.SUIC.P5', unit: 'deaths per 100,000', lower: true, target_from: 2015, factor: 2 / 3, target_src: 'SDG 3.4: one-third lower than 2015' },
  { id: 'tb', title: 'Tuberculosis', domain: 'Infectious disease', ind: 'SH.TBS.INCD', unit: 'new cases per 100,000', lower: true, target_from: 2015, factor: 0.2, target_src: 'WHO End TB: 80% lower than 2015' },
  { id: 'poverty', title: 'Extreme poverty', domain: 'Poverty', ind: 'SI.POV.DDAY', unit: '% of people below the international poverty line', lower: true, target: 3, target_src: 'World Bank goal: under 3%' },
  { id: 'hunger', title: 'Chronic hunger', domain: 'Food', ind: 'SN.ITK.DEFC.ZS', unit: '% of people undernourished', lower: true, target: 5, target_src: 'SDG 2.1 proxy: under 5%' },
  { id: 'water', title: 'Unsafe drinking water', domain: 'Water', ind: 'SH.H2O.SMDW.ZS', unit: '% of people with safely managed water', lower: false, target: 100, target_src: 'SDG 6.1: universal' },
  { id: 'cooking', title: 'Smoky cooking fuel', domain: 'Energy and air', ind: 'EG.CFT.ACCS.ZS', unit: '% of people with clean cooking', lower: false, target: 100, target_src: 'SDG 7.1: universal' },
  { id: 'education', title: 'Children not finishing primary school', domain: 'Education', ind: 'SE.PRM.CMPT.ZS', unit: '% completing primary', lower: false, target: 100, target_src: 'SDG 4.1: universal' },
  { id: 'road', title: 'Road traffic deaths', domain: 'Safety', ind: 'SH.STA.TRAF.P5', unit: 'deaths per 100,000', lower: true, target_from: 2015, factor: 0.5, target_src: 'SDG 3.6 / UN Decade of Action: halve deaths from 2015' },
  { id: 'electricity', title: 'People without electricity', domain: 'Energy and air', ind: 'EG.ELC.ACCS.ZS', unit: '% of people with electricity', lower: false, target: 100, target_src: 'SDG 7.1: universal' },
  { id: 'sanitation', title: 'Unsafe sanitation', domain: 'Water', ind: 'SH.STA.SMSS.ZS', unit: '% of people with safely managed sanitation', lower: false, target: 100, target_src: 'SDG 6.2: universal' },
  { id: 'stunting', title: 'Stunted growth in children', domain: 'Food', ind: 'SH.STA.STNT.ZS', unit: '% of children under 5 stunted', lower: true, target_from: 2012, factor: 0.6, target_src: 'WHA 2025 target: 40% fewer than 2012' },
  { id: 'air', title: 'Polluted air', domain: 'Energy and air', ind: 'EN.ATM.PM25.MC.M3', unit: 'annual mean PM2.5, micrograms per cubic metre', lower: true, target: 5, target_src: 'WHO 2021 air quality guideline: 5' },
  { id: 'internet', title: 'People offline', domain: 'Digital access', ind: 'IT.NET.USER.ZS', unit: '% of people using the internet', lower: false, target: 100, target_src: 'SDG 9.c: universal access' },
  { id: 'women-power', title: 'Women missing from national parliaments', domain: 'Governance and gender', ind: 'SG.GEN.PARL.ZS', unit: '% of parliamentary seats held by women', lower: false, target: 50, target_src: 'SDG 5.5 / parity: 50%' },
  { id: 'finance', title: 'Adults without a financial account', domain: 'Poverty', ind: 'FX.OWN.TOTL.ZS', unit: '% of adults with an account', lower: false, target: 100, target_src: 'World Bank / G20: universal financial access' },
  { id: 'birthreg', title: 'Children whose birth is never registered', domain: 'Governance and gender', ind: 'SP.REG.BRTH.ZS', unit: '% of children under 5 registered', lower: false, target: 100, target_src: 'SDG 16.9: universal' },
];


export function shortfall(p, value, baseline) {
  const target = p.target ?? (baseline == null ? null : baseline * p.factor);
  if (value == null || target == null) return { target, shortfall: null };
  const s = p.lower ? (value - target) / value : (target - value) / target;
  return { target, shortfall: Math.max(0, Math.min(1, s)) };
}

async function series0(fetchFn, ind) {
  const url = `https://api.worldbank.org/v2/country/WLD/indicator/${ind}?format=json&per_page=80&date=2000:2025`;
  let r;
  for (let a = 0; a < 3; a++) { r = await fetchFn(url); if (r.ok) break; await new Promise(z => setTimeout(z, 400 * (a + 1))); }
  if (!r.ok) throw new Error(`${ind}: HTTP ${r.status}`);
  const rows = ((await r.json())[1] || []).filter(x => x.value != null).map(x => ({ year: +x.date, value: +x.value }));
  return rows.sort((a, b) => b.year - a.year);
}
// one request at a time: the World Bank answered 502 to eleven at once
let wbq = Promise.resolve();
function series(fetchFn, ind) { const run = () => series0(fetchFn, ind); wbq = wbq.then(run, run); return wbq; }

export async function rankProblems(fetchFn = fetch) {
  const out = await Promise.all(PROBLEMS.map(async p => {
    try {
      const rows = await series(fetchFn, p.ind);
      const latest = rows[0] || null;
      const base = p.target_from ? (rows.find(x => x.year === p.target_from) || null) : null;
      const { target, shortfall: s } = shortfall(p, latest && latest.value, base && base.value);
      return { ...p, value: latest && latest.value, year: latest && latest.year, target, shortfall: s, error: s == null ? 'no usable data' : undefined };
    } catch (e) { return { ...p, value: null, year: null, target: null, shortfall: null, error: String(e.message || e) }; }
  }));
  const ranked = out.filter(x => x.shortfall != null).sort((a, b) => b.shortfall - a.shortfall);
  return {
    basis: 'Gap between the latest world value and its international target (World Bank open data, world aggregate). Larger gap ranks higher. It ranks the size of the gap, not deaths or DALYs, and ignores how solvable a problem is.',
    problems: ranked.map((x, i) => ({ rank: i + 1, ...x })),
    unranked: out.filter(x => x.shortfall == null).map(x => ({ id: x.id, title: x.title, error: x.error })),
  };
}
