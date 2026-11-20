// SPDX-License-Identifier: LicenseRef-Ultrastable-USL-1.0
// Copyright (c) 2026 Rowan Brad Quni-Gudzinas. Non-commercial use free; commercial use requires a license. See LICENSE.
// PROBLEM-SCAN-1: a problem-discovery engine. It enumerates the indicator lists and taxonomies of public statistical sources, keeps the entries
// a published keyword rule reads as a problem (something that should fall, or a coverage that should rise), measures each one on the source's
// own world aggregate, and ranks by pace. Nothing is chosen by hand and no model is involved. Tenant-agnostic: sources, rules and the budget are
// arguments; `fetch` and `now` are injected. Every entry carries its provenance (source, code, the URL that was read, when).

export const slug = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const clean = s => String(s || '').replace(/\s+/g, ' ').trim();

// ---- the rule that decides what is a problem and which way is better ------------------------------------------------------------------------
// First match wins, so the specific "should rise" patterns come before the generic "should fall" words (contraceptive prevalence is a coverage).
export const RULES = [
  { id: 'coverage', lower: false, re: /\b(access to|with access|coverage|immuni[sz]ation|vaccin|births attended|skilled (health|birth)|antenatal care|contraceptive prevalence|demand for family planning|literacy rate|completion rate|school enrol|enrolment|enrollment|life expectancy|survival to|treatment success|case detection|antiretroviral|using (at least basic|safely managed|basic|the internet)|individuals using the internet|account ownership|handwashing|exclusive breastfeeding|breastfed|trained teachers|qualified teachers|birth registration|births? .*registered|seats held by women|protected areas|renewable energy|clean fuels|electricity|insecticide-treated|oral rehydration|vitamin a supplementation|iodized salt|health service coverage|social (protection|insurance|safety net)s? .*coverag|pupils? .*proficien|minimum proficiency)/i },
  { id: 'harm', lower: true, re: /\b(mortality|death|deaths|died|dying|stillbirth|suicide|homicide|killed|fatalit|prevalence|incidence|new (hiv )?infections|new cases|poverty|poor|undernourish|hunger|food insecurity|stunting|stunted|wasting|wasted|underweight|overweight|obes|an(a)?emia|low.?birth.?weight|out.of.school|not in (education|school)|dropout|drop-out|repeaters|illitera|unemploy|child (labou?r|marriage)|children in employment|married (by|before) age|vulnerable employment|informal employment|working poor|slum|homeless|pollution|pm2\.5|emissions|deforestation|degraded|threatened species|red list|water stress|natural disasters?|droughts, floods|bribe|corruption|violence|victims|trafficking|refugee population by country.*origin|internally displaced|conflict|unsafe|lacking|without|open defecation|smok|tobacco use|alcohol consumption|harmful use|road traffic|injur|disabilit|catastrophic|impoverish|out-of-pocket|unmet need|adolescent fertility|adolescent birth|teenage mothers|wait(ing)? time|losses|food loss|waste generated|hazardous waste|overfish|overexploit|gap|inequal|gini)\b/i },
];
// Words that mark an indicator as a breakdown of another one, or as something that is not a level in the world today.
export const SKIP = /\b(archived|discontinued|\(old\)|estimated number of people needing|number of countries|existence of|is there a|status of|standard error|sample size|confidence|lower bound|upper bound)\b/i;
export const BREAKDOWN = /,\s*(male|female|urban|rural|youth (male|female)|adult (male|female)|ages? [0-9][0-9 +-]*|(first|second|third|fourth|fifth|lowest|highest) (20%|10%|quintile))\b|\b(male|female)\s*\(/i;

export function classify(name, rules = RULES) {
  const t = clean(name);
  if (!t || SKIP.test(t)) return null;
  for (const r of rules) { const m = r.re.exec(t); if (m) return { lower: r.lower, rule: r.id, matched: m[0].toLowerCase() }; }
  return null;
}
export const isPercent = name => /%|per ?cent|proportion of|share of/i.test(String(name));

// ---- measurement and the ranking rule -------------------------------------------------------------------------------------------------------
export const PACE = { stall: 0.005, base_years: 10, min_span: 5, floor: 0.01 };
// rows: [{year, value}]. `burden` is the quantity that should fall: the value itself, or for a percentage that should rise, the share left out.
// pace is the yearly log change of the burden over about ten years: above zero the problem is growing.
export function measure(rows, { lower, percent }, cfg = PACE) {
  const xs = (rows || []).filter(r => Number.isFinite(r.value) && Number.isFinite(r.year)).sort((a, b) => b.year - a.year);
  if (!xs.length) return null;
  const latest = xs[0], cands = xs.filter(r => r.year <= latest.year - cfg.min_span);
  const base = cands.length ? cands.reduce((b, r) => Math.abs(r.year - (latest.year - cfg.base_years)) < Math.abs(b.year - (latest.year - cfg.base_years)) ? r : b) : null;
  const out = { value: latest.value, year: latest.year, base: base ? base.value : null, base_year: base ? base.year : null, pace: null, status: 'no trend yet' };
  if (!base) return out;
  const burden = v => lower ? v : percent ? 100 - v : v > 0 ? 1 / v : null;
  let b1 = burden(latest.value), b0 = burden(base.value);
  if (b1 == null || b0 == null || b1 < 0 || b0 < 0) { out.status = 'trend not computable'; return out; }
  if (percent) { b1 = Math.max(b1, cfg.floor); b0 = Math.max(b0, cfg.floor); }
  if (!(b1 > 0) || !(b0 > 0)) { out.status = 'trend not computable'; return out; }
  out.pace = Math.log(b1 / b0) / (latest.year - base.year);
  out.status = out.pace > cfg.stall ? 'getting worse' : out.pace < -cfg.stall ? 'improving' : 'stalled';
  return out;
}
export const RANK_RULE = 'Problems with a world figure in two years at least five years apart are ranked by pace: the yearly rate at which the thing that should fall is changing over about ten years (for a coverage that should rise, the share still left out). Growing problems rank first, then stalled ones, then the slowest improvers. Pace compares directions across different units; it does not measure how many people are harmed. Problems with no usable world figure are listed unranked.';
export function rank(entries) {
  const paced = entries.filter(e => e.m && e.m.pace != null).sort((a, b) => b.m.pace - a.m.pace || a.id.localeCompare(b.id));
  const rest = entries.filter(e => !(e.m && e.m.pace != null)).sort((a, b) => (b.m ? 1 : 0) - (a.m ? 1 : 0) || a.title.localeCompare(b.title));
  return [...paced.map((e, i) => ({ ...e, rank: i + 1 })), ...rest.map(e => ({ ...e, rank: null }))];
}

// ---- sources --------------------------------------------------------------------------------------------------------------------------------
// Each source: { id, name, licence, home, taxonomy (publish without a figure), list(fetch) -> [{code, name, domain, note}], series(fetch, code) -> {rows, url} }.
const getJson = async (f, url, tries = 3) => {
  let last = '';
  for (let a = 0; a < tries; a++) {
    try { const r = await f(url, { headers: { accept: 'application/json', 'user-agent': 'problem-scan (public statistics reader)' } }); if (r.ok) return await r.json(); last = 'HTTP ' + r.status; } catch (e) { last = String(e.message || e); }
    await new Promise(z => setTimeout(z, 300 * (a + 1)));
  }
  throw new Error(`${url}: ${last}`);
};

export const worldBank = ({ base = 'https://api.worldbank.org/v2', pause = 0 } = {}) => ({
  id: 'wb', name: 'World Bank World Development Indicators', home: 'https://data.worldbank.org/indicator', licence: 'CC BY 4.0', taxonomy: false,
  async list(f) {
    const out = [];
    for (let page = 1, pages = 1; page <= pages && page <= 40; page++) {
      const j = await getJson(f, `${base}/indicator?format=json&per_page=1000&source=2&page=${page}`);
      pages = (j[0] && j[0].pages) || 1;
      for (const x of j[1] || []) out.push({ code: x.id, name: clean(x.name), domain: clean(((x.topics || [])[0] || {}).value) || 'Other', note: clean(x.sourceNote).slice(0, 400), org: clean(x.sourceOrganization).slice(0, 200) });
    }
    return out;
  },
  async series(f, code) {
    const url = `${base}/country/WLD/indicator/${code}?format=json&per_page=80&date=2000:2030`;
    const j = await getJson(f, url); if (pause) await new Promise(z => setTimeout(z, pause));
    return { url, rows: (j[1] || []).filter(x => x.value != null).map(x => ({ year: +x.date, value: +x.value })) };
  },
  page: code => `https://data.worldbank.org/indicator/${code}`,
});

const GHO_TOTAL = d => d == null || /(_BTSX|_TOTL|_TOTAL|_ALL)$/i.test(d);
export const whoGho = ({ base = 'https://ghoapi.azureedge.net/api' } = {}) => ({
  id: 'who', name: 'WHO Global Health Observatory', home: 'https://www.who.int/data/gho', licence: 'CC BY-NC-SA 3.0 IGO', taxonomy: false,
  async list(f) { const j = await getJson(f, `${base}/Indicator`); return (j.value || []).filter(x => x.IndicatorCode && x.IndicatorName).map(x => ({ code: x.IndicatorCode, name: clean(x.IndicatorName), domain: 'Health', note: '' })); },
  async series(f, code) {
    const url = `${base}/${encodeURIComponent(code)}?$filter=${encodeURIComponent("SpatialDim eq 'GLOBAL'")}`;
    const j = await getJson(f, url), by = new Map();
    for (const x of j.value || []) if (x.NumericValue != null && GHO_TOTAL(x.Dim1) && x.Dim2 == null && x.Dim3 == null && !by.has(+x.TimeDim)) by.set(+x.TimeDim, { year: +x.TimeDim, value: +x.NumericValue });
    return { url, rows: [...by.values()] };
  },
  page: code => `https://www.who.int/data/gho/data/indicators/indicator-details/GHO/${code}`,
});

// WHO Global Health Estimates cause list: a taxonomy. Every cause of death is a problem; the list itself carries no figure.
export const whoCauses = ({ base = 'https://ghoapi.azureedge.net/api' } = {}) => ({
  id: 'ghe', name: 'WHO Global Health Estimates cause list', home: 'https://www.who.int/data/gho/data/themes/mortality-and-global-health-estimates', licence: 'CC BY-NC-SA 3.0 IGO', taxonomy: true, lower: true,
  listUrl: `${base}/DIMENSION/GHECAUSES/DimensionValues`,
  async list(f) { const j = await getJson(f, this.listUrl); return (j.value || []).filter(x => x.Code && x.Title && !/^all causes$/i.test(x.Title)).map(x => ({ code: x.Code.replace(/^GHECAUSES_/, ''), name: clean(x.Title), domain: 'Health', note: 'A cause of death or ill health in the WHO Global Health Estimates cause list.' })); },
  page: () => 'https://www.who.int/data/gho/data/themes/mortality-and-global-health-estimates',
});

export const SDG_GOALS = ['Poverty', 'Food', 'Health', 'Education', 'Gender equality', 'Water', 'Energy', 'Work and economy', 'Industry and infrastructure', 'Inequality', 'Cities and housing', 'Consumption and waste', 'Climate', 'Oceans', 'Land and biodiversity', 'Peace, justice and institutions', 'Global cooperation'];
const SDG_TOTAL = /^(_T|BOTHSEX|ALLAGE|ALLAREA|TOTAL|ALL|_X|G|E|C|CA|M|N|NA)$/i;
// UN SDG global indicator framework: every indicator the UN Statistical Commission agreed to track is a recognised problem statement.
export const unSdg = ({ base = 'https://unstats.un.org/sdgs/UNSDG/api/v1/sdg' } = {}) => ({
  id: 'sdg', name: 'UN SDG global indicator framework', home: 'https://unstats.un.org/sdgs/indicators/indicators-list/', licence: 'UN Statistics Division open data', taxonomy: true,
  listUrl: `${base}/Indicator/List`,
  async list(f) {
    const j = await getJson(f, this.listUrl), seen = new Set(), out = [];
    for (const x of Array.isArray(j) ? j : []) {
      if (!x.code || !x.description || seen.has(x.code)) continue; seen.add(x.code);
      const s = (x.series || [])[0];
      out.push({ code: x.code, name: clean(x.description), domain: SDG_GOALS[Number(x.goal) - 1] || 'Other', note: `SDG indicator ${x.code}, target ${x.target}.`, series_code: s && s.code });
    }
    return out;
  },
  async series(f, code, item) {
    if (!item || !item.series_code) return { url: null, rows: [] };
    const url = `${base}/Series/Data?seriesCode=${encodeURIComponent(item.series_code)}&areaCode=1&pageSize=1000`;
    const j = await getJson(f, url), by = new Map();
    for (const x of (j && j.data) || []) {
      const v = Number(x.value), y = Math.floor(Number(x.timePeriodStart));
      if (!Number.isFinite(v) || !Number.isFinite(y) || by.has(y)) continue;
      if (Object.values(x.dimensions || {}).every(d => SDG_TOTAL.test(String(d)))) by.set(y, { year: y, value: v });
    }
    return { url, rows: [...by.values()] };
  },
  page: code => `https://unstats.un.org/sdgs/metadata/?Text=&Goal=${String(code).split('.')[0]}`,
});

export const SOURCES = () => [unSdg(), whoCauses(), worldBank(), whoGho()];

// ---- the scan -------------------------------------------------------------------------------------------------------------------------------
// One run: list every source, screen with the rule, then measure up to `budget` entries (never measured first, then the stalest).
// A source that fails to list is recorded and its earlier entries are kept. An entry is published when it has a world figure, or when its
// source is a taxonomy (the problem is recognised even though this run found no figure for it).
export async function scan({ sources = SOURCES(), prev = null, budget = 400, fetch: f = globalThis.fetch, now = () => new Date().toISOString(), rules = RULES, remeasure_days = 30 } = {}) {
  const at = now(), today = at.slice(0, 10), byId = new Map(((prev && prev.entries) || []).map(e => [e.id, e])), stats = {}, log = [...((prev && prev.log) || [])];
  const items = new Map();
  for (const s of sources) {
    const st = stats[s.id] = { name: s.name, home: s.home, licence: s.licence, listed: 0, matched: 0, breakdowns_skipped: 0, error: null };
    let list;
    try { list = await s.list(f); } catch (e) { st.error = String(e.message || e).slice(0, 200); log.push({ at, event: 'source list failed', source: s.id, detail: st.error }); continue; }
    st.listed = list.length;
    const names = new Set(list.map(x => x.name.toLowerCase()));
    for (const it of list) {
      const c = s.lower != null ? { lower: s.lower, rule: 'taxonomy', matched: null } : classify(it.name, rules) || (s.taxonomy ? { lower: null, rule: 'taxonomy', matched: null } : null);
      if (!c) continue;
      // a breakdown is skipped when the list also holds its total
      if (BREAKDOWN.test(it.name)) { const total = it.name.replace(BREAKDOWN, m => /\(/.test(m) ? '(' : '').toLowerCase(); if (names.has(total) || names.has(total.replace(/\s*\(/, ', total (')) || [...names].some(n => n !== it.name.toLowerCase() && n.replace(/,\s*total\b/, '') === total)) { st.breakdowns_skipped++; continue; } }
      st.matched++;
      const id = `${s.id}-${slug(it.code)}`, old = byId.get(id);
      items.set(id, { src: s, item: it, e: { id, source: s.id, code: it.code, title: it.name, domain: it.domain, note: it.note || '', lower: c.lower, rule: c.rule, matched: c.matched, percent: isPercent(it.name), page: s.page(it.code), first_seen: (old && old.first_seen) || today, published: (old && old.published) || null, m: (old && old.m) || null, measured_at: (old && old.measured_at) || null, read_url: (old && old.read_url) || s.listUrl || null, tries: (old && old.tries) || 0 } });
    }
  }
  // entries of a source that failed to list this run are carried over unchanged
  for (const e of byId.values()) if (!items.has(e.id) && stats[e.source] && stats[e.source].error) items.set(e.id, { src: null, item: null, e });
  const age = e => e.measured_at ? (Date.parse(at) - Date.parse(e.measured_at)) / 864e5 : Infinity;
  const due = [...items.values()].filter(x => x.src && x.src.series && x.e.lower != null && (age(x.e) >= remeasure_days * Math.min(4, 1 + x.e.tries * (x.e.m ? 0 : 1))))
    .sort((a, b) => (a.e.measured_at ? 1 : 0) - (b.e.measured_at ? 1 : 0) || String(a.e.measured_at).localeCompare(String(b.e.measured_at)) || a.e.id.localeCompare(b.e.id)).slice(0, budget);
  let measured = 0, empty = 0, failed = 0;
  for (const x of due) {
    try {
      const r = await x.src.series(f, x.e.code, x.item), m = measure(r.rows, x.e);
      x.e.measured_at = at; x.e.read_url = r.url || x.e.read_url; x.e.tries++;
      if (m) { x.e.m = m; measured++; } else empty++;
    } catch (e) { failed++; x.e.tries++; x.e.measured_at = at; if (failed <= 5) log.push({ at, event: 'series failed', id: x.e.id, detail: String(e.message || e).slice(0, 160) }); }
  }
  const all = [...items.values()].map(x => x.e), added = [];
  for (const e of all) { const taxonomy = (sources.find(s => s.id === e.source) || {}).taxonomy; if (!e.published && (e.m || taxonomy)) { e.published = today; added.push(e.id); } }
  const entries = rank(all.filter(e => e.published)), pending = all.filter(e => !e.published);
  for (const s of Object.keys(stats)) { stats[s].published = entries.filter(e => e.source === s).length; stats[s].measured = entries.filter(e => e.source === s && e.m).length; stats[s].awaiting_figure = pending.filter(e => e.source === s && !e.measured_at).length; stats[s].no_world_figure = pending.filter(e => e.source === s && e.measured_at).length; }
  log.push({ at, event: 'scan', added: added.length, measured, no_figure: empty, failed, published: entries.length, due_left: [...items.values()].filter(x => x.src && x.src.series && x.e.lower != null && !x.e.measured_at).length });
  return { schema: 'problem-scan/1', at, rank_rule: RANK_RULE, sources: stats, entries: [...entries, ...pending.map(e => ({ ...e, rank: null }))], added, log: log.slice(-200) };
}
export const published = ledger => ((ledger && ledger.entries) || []).filter(e => e.published);
