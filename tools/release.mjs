// SPDX-License-Identifier: LicenseRef-Ultrastable-USL-1.0
// Copyright (c) 2026 Rowan Brad Quni-Gudzinas. Non-commercial use free; commercial use requires a license. See LICENSE.
// RELEASE-1: the catalogue ships as dated releases, cut by code. A release lists what is new since the last one: problems, solutions,
// syntheses (new solutions made by transfer or combination) and insights (red-team findings). Cadence is measured, not assumed:
//   node tools/release.mjs             cut a release when something is new and the last one is at least `min_days` old; report cadence
//   node tools/release.mjs --watch     print cadence only (the daily cycle uses it as the second route that restarts a late release)
//   node tools/release.mjs --check     fail if worker/src/releases.gen.js is stale against ledger/releases.json
// PROBLEM-INTAKE-1: when no problem has been added for `gap_days`, the candidate in ledger/problem-bank.json with the largest measured
// shortfall to its target joins the catalogue (same World Bank series and rule as every listed problem).
// A late cadence heals itself: output `heal` names the workflows that produce new entries, and release.yml dispatches them.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export const LEDGER = 'ledger/releases.json', GEN = 'worker/src/releases.gen.js', BANK = 'ledger/problem-bank.json', PROBLEMS_FILE = 'worker/src/problems.js';
export const CONFIG = { min_days: 1, max_gap_days: 7, heal: ['discover.yml', 'redteam.yml', 'problemscan.yml'] };
const KINDS = ['problems', 'solutions', 'syntheses', 'insights'];
const day = d => new Date(d).toISOString().slice(0, 10), days = (a, b) => Math.floor((Date.parse(b) - Date.parse(a)) / 864e5);
const read = (f, fb) => existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : fb;

// RELEASE-FEATURES-1: a release also lists what the site can do that it could not before. These are the merged pull requests on main (git is
// the record), cleaned into plain sentences; data refreshes by loops (host-sync, ledger commits, auto merges) never count as features.
const NOISE = /^(auto|host-sync|release|audit|ensemble|connections|translate|redteam|syntheses|problemscan|context|realdata|cycle|discover|references|modelprobe)\b/i;
export function featureTitle(subject) {
  let t = String(subject).replace(/(\s*\(#\d+\))+\s*$/, '').replace(/^[A-Z][A-Z0-9]*(-[A-Z0-9]+)+:\s*/, '').trim();
  t = t.replace(/^ps:\s*/i, '').replace(/\s+-\s+/g, ': ').replace(/^(\w)/, c => c.toUpperCase());
  return t.length > 200 ? t.slice(0, 197) + '...' : t;
}
export function featuresFrom(lines) {
  const out = [];
  for (const l of lines) {
    const [sha, at, ...rest] = l.split('\t'), subject = rest.join('\t'), pr = (subject.match(/\(#(\d+)\)\s*$/) || [])[1];
    if (!sha || !pr || NOISE.test(subject)) continue;
    out.push({ id: sha.slice(0, 7), at, pr: +pr, title: featureTitle(subject) });
  }
  return out.sort((a, b) => a.at.localeCompare(b.at));
}
export function gitFeatures(since) {
  const args = ['log', 'origin/main', '--no-merges', '--format=%H%x09%cI%x09%s', ...(since ? ['--since=' + since] : [])];
  try { return featuresFrom(execFileSync('git', args, { encoding: 'utf8' }).split('\n').filter(Boolean)); }
  catch { try { return featuresFrom(execFileSync('git', args.map(a => a === 'origin/main' ? 'HEAD' : a), { encoding: 'utf8' }).split('\n').filter(Boolean)); } catch { return []; } }
}
const through = r => r.through || new Date(Date.parse(r.date) + 864e5).toISOString();
export const newFeatures = (ledger, feats) => { const l = ledger.releases[ledger.releases.length - 1]; return l ? feats.filter(f => f.at > through(l)) : feats; };

// What exists now, as stable ids with the title a reader sees.
export function inventory({ problems, solutions, syntheses, redteam }) {
  const insights = {};
  for (const [subject, v] of Object.entries((redteam && redteam.bySubject) || {})) for (const f of v.findings || []) {
    insights[subject + ':' + createHash('sha1').update(String(f.challenge)).digest('hex').slice(0, 10)] = `${subject}: ${String(f.challenge).slice(0, 140)}`;
  }
  const by = xs => Object.fromEntries(xs.map(x => [x.id, x.title]));
  return { problems: by(problems), solutions: by(solutions), syntheses: by(syntheses), insights };
}

// Pure decision: what a run does, given the ledger, the inventory and the date.
export function decide(ledger, inv, today, cfg = CONFIG, feats = []) {
  const last = ledger.releases[ledger.releases.length - 1] || null;
  const added = Object.fromEntries(KINDS.map(k => [k, Object.keys(inv[k]).filter(id => !(ledger.known[k] || []).includes(id)).sort()]));
  added.features = newFeatures(ledger, feats);
  const fresh = KINDS.reduce((n, k) => n + added[k].length, 0) + added.features.length, since = last ? days(last.date, today) : null;
  const cut = fresh > 0 && (since === null || since >= cfg.min_days);
  const late = since !== null && since > cfg.max_gap_days;
  const state = cut ? 'released' : since === null ? 'empty' : late ? 'late' : fresh ? 'waiting' : 'nothing_new';
  return { cut, added, fresh, days_since_last: since, state, heal: late && !cut ? cfg.heal : (cut ? [] : fresh === 0 && since !== null && since >= cfg.min_days ? cfg.heal : []) };
}

export function cut(ledger, inv, d, today) {
  let version = day(today).replace(/-/g, '.'), n = 1;
  while (ledger.releases.some(r => r.version === version)) version = day(today).replace(/-/g, '.') + '-' + (++n);
  const rel = { version, date: day(today), first: ledger.releases.length === 0, through: new Date(Math.max(Date.parse(today), 0)).toISOString().replace(/\.\d+Z$/, 'Z'), added: { ...Object.fromEntries(KINDS.map(k => [k, d.added[k].map(id => ({ id, title: inv[k][id] }))])), features: (d.added.features || []).map(f => ({ id: f.id, pr: f.pr, title: f.title })) }, totals: Object.fromEntries(KINDS.map(k => [k, Object.keys(inv[k]).length])) };
  return { ...ledger, known: Object.fromEntries(KINDS.map(k => [k, [...new Set([...(ledger.known[k] || []), ...Object.keys(inv[k])])].sort()])), releases: [...ledger.releases, rel] };
}

export const notes = r => [`Practical Solutions ${r.version}`, '', ...((r.added.features || []).length ? [`What is new on the site (${r.added.features.length}):`, ...r.added.features.slice(0, 40).map(x => `- ${x.title}`), ''] : []), ...KINDS.flatMap(k => r.added[k].length ? [`New ${k} (${r.added[k].length}):`, ...r.added[k].slice(0, 40).map(x => `- ${x.title}`), ''] : []),
  `Totals: ${KINDS.map(k => `${r.totals[k]} ${k}`).join(', ')}.`].join('\n');

export function generated(ledger, cfg = CONFIG) {
  const rels = ledger.releases.slice(-26).reverse().map(r => ({ ...r, added: { ...r.added, features: r.added.features || [], insights: r.added.insights.slice(0, 25) }, counts: Object.fromEntries([...KINDS, 'features'].map(k => [k, (r.added[k] || []).length])) }));
  return `// SPDX-License-Identifier: LicenseRef-Ultrastable-USL-1.0\n// Copyright (c) 2026 Rowan Brad Quni-Gudzinas. Non-commercial use free; commercial use requires a license. See LICENSE.\n// GENERATED by tools/release.mjs from ledger/releases.json. Do not edit.\nexport const RELEASES = ${JSON.stringify({ schema: 'ps-releases/1', min_days: cfg.min_days, max_gap_days: cfg.max_gap_days, count: ledger.releases.length, releases: rels }, null, 1)};\n`;
}

// PROBLEM-INTAKE-1. `rank(candidates)` measures candidates with the catalogue's own rule; the largest shortfall wins.
export function problemDue(ledger, bank, today) {
  const lastWith = [...ledger.releases].reverse().find(r => !r.first && r.added.problems.length) || ledger.releases[0];
  const lastIntake = bank.log.length ? bank.log[bank.log.length - 1].at : null;
  const ref = [lastWith && lastWith.date, lastIntake].filter(Boolean).sort().pop();
  return Boolean(ref) && days(ref, today) >= bank.gap_days;
}
export function pickProblem(bank, existingIds, measured) {
  const ok = measured.filter(m => !existingIds.includes(m.id) && m.shortfall != null && m.shortfall >= bank.min_shortfall).sort((a, b) => b.shortfall - a.shortfall || a.id.localeCompare(b.id));
  return ok[0] || null;
}
export function insertProblem(src, entry) {
  const start = src.indexOf('export const PROBLEMS = ['), end = src.indexOf('\n];', start);
  if (start < 0 || end < 0) throw new Error('PROBLEMS array not found');
  const fields = ['id', 'title', 'domain', 'ind', 'unit', 'lower', 'target', 'target_from', 'factor', 'target_src'].filter(k => entry[k] !== undefined);
  const line = '  { ' + fields.map(k => `${k}: ${typeof entry[k] === 'string' ? `'${entry[k].replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'` : entry[k]}`).join(', ') + ' },';
  return src.slice(0, end) + '\n' + line + src.slice(end);
}

// Backfill: one release per UTC day for the features merged since the last release, so a loop that was blind to features catches up in order.
// New catalogue entries go to the newest day, because the ledger of earlier days is not recoverable from the inventory.
export function backfill(ledger, inv, feats, today) {
  const fresh = newFeatures(ledger, feats), days_ = [...new Set(fresh.map(f => f.at.slice(0, 10)))].sort();
  days_.forEach((dy, i) => {
    const last = i === days_.length - 1, at = last ? today : dy + 'T23:59:59Z', mine = fresh.filter(f => f.at.slice(0, 10) === dy);
    const d = decide(ledger, last ? inv : { problems: {}, solutions: {}, syntheses: {}, insights: {} }, dy + 'T23:59:59Z', { ...CONFIG, min_days: 0 }, mine);
    const keep = ledger.known; ledger = cut(ledger, last ? inv : { problems: {}, solutions: {}, syntheses: {}, insights: {} }, d, last ? dy + 'T23:59:59Z' : at);
    if (!last) { ledger.known = keep; ledger.releases[ledger.releases.length - 1].totals = ledger.releases[ledger.releases.length - 2].totals; }
    ledger.releases[ledger.releases.length - 1].through = mine[mine.length - 1].at;
  });
  return ledger;
}

async function load() {
  const u = f => pathToFileURL(f).href + '?t=' + Date.now();
  const [{ PROBLEMS, shortfall }, { SOLUTIONS }, { SYNTHESES_PUBLISHED }] = await Promise.all([import(u(PROBLEMS_FILE)), import(u('worker/src/solutions.js')), import(u('worker/src/syntheses.gen.js'))]);
  return { PROBLEMS, shortfall, inv: inventory({ problems: PROBLEMS, solutions: SOLUTIONS, syntheses: SYNTHESES_PUBLISHED.published, redteam: read('ledger/redteam.json', {}) }) };
}

async function measure(cands, shortfall, fetchFn = fetch) {
  const out = [];
  for (const p of cands) {
    try {
      const r = await fetchFn(`https://api.worldbank.org/v2/country/WLD/indicator/${p.ind}?format=json&per_page=80&date=2000:2025`);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const rows = ((await r.json())[1] || []).filter(x => x.value != null).map(x => ({ year: +x.date, value: +x.value })).sort((a, b) => b.year - a.year);
      const base = p.target_from ? rows.find(x => x.year === p.target_from) : null;
      out.push({ id: p.id, value: rows[0] ? rows[0].value : null, year: rows[0] ? rows[0].year : null, ...shortfall(p, rows[0] && rows[0].value, base && base.value) });
    } catch (e) { out.push({ id: p.id, value: null, shortfall: null, error: String(e.message || e) }); }
  }
  return out;
}

async function main(argv) {
  const today = new Date().toISOString();
  let ledger = read(LEDGER, { schema: 'ps-releases/1', known: {}, releases: [] });
  if (argv.includes('--check')) { if (!existsSync(GEN) || readFileSync(GEN, 'utf8') !== generated(ledger)) { console.error(GEN + ' is stale: run node tools/release.mjs'); process.exit(1); } console.log('releases ok'); return; }
  let { PROBLEMS, shortfall, inv } = await load();
  const lastRel = ledger.releases[ledger.releases.length - 1], feats = gitFeatures(lastRel ? new Date(Date.parse(through(lastRel)) - 864e5).toISOString() : null);
  if (argv.includes('--watch')) { console.log(JSON.stringify({ ...decide(ledger, inv, today, CONFIG, feats), added: undefined })); return; }
  if (argv.includes('--backfill')) { ledger = backfill(ledger, inv, feats, today); writeFileSync(LEDGER, JSON.stringify(ledger, null, 1) + '\n'); writeFileSync(GEN, generated(ledger)); console.log(JSON.stringify({ releases: ledger.releases.map(r => r.version) })); return; }
  const bank = read(BANK, null); let intake = null;
  if (bank && problemDue(ledger, bank, today)) {
    const open = bank.candidates.filter(c => !PROBLEMS.some(p => p.id === c.id || p.ind === c.ind));
    const measured = open.length ? await measure(open, shortfall) : [];
    const pick = pickProblem(bank, PROBLEMS.map(p => p.id), measured);
    intake = { at: day(today), measured, picked: pick ? pick.id : null, bank_left: open.length - (pick ? 1 : 0) };
    if (pick) { writeFileSync(PROBLEMS_FILE, insertProblem(readFileSync(PROBLEMS_FILE, 'utf8'), open.find(c => c.id === pick.id))); ({ inv } = await load()); }
    if (pick || measured.some(m => m.shortfall != null)) { bank.log.push(intake); writeFileSync(BANK, JSON.stringify(bank, null, 1) + '\n'); }
  }
  const d = decide(ledger, inv, today, CONFIG, feats);
  if (d.cut) { ledger = cut(ledger, inv, d, today); writeFileSync(LEDGER, JSON.stringify(ledger, null, 1) + '\n'); writeFileSync('release-notes.md', notes(ledger.releases[ledger.releases.length - 1])); }
  writeFileSync(GEN, generated(ledger));
  console.log(JSON.stringify({ state: d.state, cut: d.cut, version: d.cut ? ledger.releases[ledger.releases.length - 1].version : null, counts: Object.fromEntries([...KINDS, 'features'].map(k => [k, d.added[k].length])), days_since_last: d.days_since_last, heal: d.heal, intake: intake && { picked: intake.picked, bank_left: intake.bank_left } }));
}
if (import.meta.url === pathToFileURL(process.argv[1] || '').href) main(process.argv.slice(2)).catch(e => { console.error(e); process.exit(1); });
