// SPDX-License-Identifier: LicenseRef-Ultrastable-USL-1.0
// Copyright (c) 2026 Rowan Brad Quni-Gudzinas. Non-commercial use free; commercial use requires a license. See LICENSE.
// BEHAVIOUR-1 (Rowan, 2026-11-22): information is not implementation, and the people who must act are the weak link. For every catalogue entry this
// builds a change profile, as a pure function of the entry and the behaviour library (behaviour-lib.js): who has to change, what they may believe that
// the evidence contradicts, what gets in the way, which tested levers address it, first steps sized for a week, and what would change anyone's mind.
// Any entry the loops add gets a generated profile at once (no hand step); HINTS only sharpen it with the entry's specific belief and barriers.
// The aim follows the evidence label: a contested finding is never sold. guard() fails a profile that overclaims, uses a pressure word, cites a
// source the library lacks, or states a lever more strongly than its sources allow; npm test runs it over every entry.
import * as ui from './kit/index.js';
import { esc } from './catalog.js';
import { CHECKED } from './behaviour-sources.gen.js';
import { SOURCES, BARRIERS, LEVERS, RETIRED, MIND_RULES, ETHICS, OVERCLAIM, MANIPULATIVE } from './behaviour-lib.js';

// belief: what practitioners or the public commonly hold; says: what this entry's own evidence shows (limits kept); barriers: library ids.
// Wording stays inside what the entry itself cites; a belief is a hypothesis to ask about locally, not a claim about any one person.
export const HINTS = {
  kmc: { belief: 'Tiny babies need an incubator and equipment, not a parent\'s chest.', says: 'In the trial, babies of 1.0-1.8 kg held skin to skin straight after birth had about a quarter fewer deaths in the first month than babies who waited to be stabilised first. It was tested in hospital units only.', barriers: ['folk_belief', 'capability', 'inertia'] },
  'ors-zinc': { belief: 'A drink is not real treatment; diarrhoea needs a medicine.', says: 'Oral rehydration salts plus a zinc course is the recommended first treatment, and zinc shortens the episode. The gap is usually stock and training, not belief.', barriers: ['capability', 'friction', 'feedback'] },
  chlorine: { belief: 'If the water looks clear it is safe.', says: 'Chlorine at the point of collection lowered child deaths across 18 trials, but only where people actually use the dispensers.', barriers: ['folk_belief', 'friction', 'fidelity'] },
  itn: { belief: 'A net is a net: any treated net will do.', says: 'Where mosquitoes resist the older insecticide, nets with two insecticides did better in trials, so the type should be chosen from local resistance data.', barriers: ['inertia', 'incentives', 'feedback'] },
  tarl: { belief: 'Teach the grade\'s curriculum and the children who lag will catch up.', says: 'Grouping children by what they can do, for about an hour a day, raised basic reading and arithmetic in randomised evaluations; it needs protected class time and the gains fade if it stops.', barriers: ['identity', 'inertia', 'fidelity'] },
  immunisation: { belief: 'Parents who miss vaccines do not care enough; more awareness is the answer.', says: 'In Rajasthan, reliable monthly camps raised full immunisation from 6% to 17%, and a small gift took it to 38%. The service being dependable mattered more than the message. One region.', barriers: ['folk_belief', 'friction', 'incentives'] },
  vita: { belief: 'What worked in the trials works everywhere, forever.', says: 'The benefit is real where children are deficient; deficiency is falling in some countries, so local data should decide whether to start or continue.', barriers: ['inertia', 'feedback', 'scale'] },
  cash: { belief: 'Cash will be wasted and will cause inflation.', says: 'In rural Kenya large transfers raised spending, assets and food security with limited price inflation. Long-run income effects were weaker.', barriers: ['folk_belief', 'identity', 'blame'] },
  hypertension: { belief: 'Controlling blood pressure needs complex, individually tailored prescribing.', says: 'One simple protocol with a patient registry and follow-up raised control from about 44% to about 80% in a large US system. Low-income clinics face supply and follow-up barriers.', barriers: ['inertia', 'capability', 'feedback'] },
  'friendship-bench': { belief: 'Mental health care needs psychiatrists.', says: 'In Zimbabwe, trained lay health workers delivering brief problem-solving therapy lowered symptoms at six months compared with enhanced usual care. It measured symptoms, not suicide deaths.', barriers: ['identity', 'capability', 'blame'] },
  helmets: { belief: 'Wearing a helmet is the rider\'s own business.', says: 'Helmets cut deaths and head injury among riders; whether to mandate is a values question, but the size of the benefit is not. The evidence is observational, and enforcement decides how many actually wear them.', barriers: ['identity', 'fidelity', 'incentives'] },
  'rural-electrification': { belief: 'Connecting a household to electricity lifts its income.', says: 'A randomised study found connections rose sharply but short-run income and schooling effects were small, at high cost per household. Other technologies and productive-use support may differ.', barriers: ['optimism', 'sunk_cost', 'scale'] },
  'mobile-money': { belief: 'Technology reaches the poor by itself.', says: 'Gains followed where agent networks were dense and regulation allowed the service; the evidence is observational, so treat the size as an estimate.', barriers: ['incentives', 'capability', 'scale'] },
  'women-leaders': { belief: 'Who holds office does not change what gets funded.', says: 'In randomly assigned village councils in India, women heads shifted spending toward goods women asked for, such as drinking water. It shows a change in priorities, not that every outcome improves.', barriers: ['identity', 'inertia', 'blame'] },
  graduation: { belief: 'Handouts create dependency; people must stand on their own.', says: 'A bundle of an asset, training, savings and coaching raised consumption and food security in six countries, and gains lasted after support ended. It costs more per household than cash alone.', barriers: ['identity', 'incentives', 'scale'] },
  deworming: { belief: 'Mass deworming is a clear success, or alternatively that it has been debunked.', says: 'The two sources disagree: an influential trial found more school attendance, and a Cochrane review found little effect of mass treatment on growth, school performance or survival. Neither camp\'s confident version is supported; the honest position is contested.', barriers: ['identity', 'folk_belief', 'sunk_cost'] },
  'clean-cooking': { belief: 'A clean stove obviously protects children from pneumonia.', says: 'The largest trial of gas stoves with fuel found no clear reduction in severe infant pneumonia; mixed fuel use may leave exposure high. Other outcomes are reported separately.', barriers: ['folk_belief', 'sunk_cost', 'fidelity'] },
  'emissions-market': { belief: 'A pollution market just lets polluters pay to pollute.', says: 'In Surat, a cap-and-trade market with continuous monitors lowered emissions compared with standard rules, in one city and one industry. The figures should be re-checked against the paper.', barriers: ['identity', 'capability', 'scale'] },
  'pph-bundle': { belief: 'Treat heavy bleeding one step at a time and escalate when each fails.', says: 'Measuring blood in a calibrated drape and giving all first-response treatments together cut severe bleeding and related deaths in a trial of hospital vaginal births. It needs steady supplies.', barriers: ['inertia', 'capability', 'fidelity'] },
  'tb-community-screening': { belief: 'Test only people with symptoms who come to the clinic.', says: 'Three yearly rounds of testing all adults in a community, with or without symptoms, left less tuberculosis than standard case finding in one province. Cost depends on local burden.', barriers: ['inertia', 'incentives', 'scale'] },
  cytisine: { belief: 'Quitting needs the newest, priciest drug.', says: 'A 25-day course of a low-cost plant-based tablet with brief support helped more people stay off cigarettes than nicotine replacement in a trial; it was unblinded with self-reported results, and side effects were more common.', barriers: ['nih', 'incentives', 'inertia'] },
  'latrine-subsidy': { belief: 'Community motivation alone is enough; or that subsidies are not needed.', says: 'In rural Bangladesh, vouchers raised latrine ownership among the poorest and their neighbours; the two trials disagree on whether mobilisation alone is enough. Neither showed less diarrhoea.', barriers: ['identity', 'folk_belief', 'incentives'] },
  'cash-birth-certificate': { belief: 'Conditions on cash are always harmful, or always needed.', says: 'A condition raised child registration where the same cash without it did almost nothing. A condition can exclude those least able to reach a registry, so free registration and help applying are part of the design; the trial did not measure who lost payments.', barriers: ['identity', 'blame', 'friction'] },
  'smartphones-for-women': { belief: 'Hand over the device and use will follow.', says: 'Giving women phones raised household spending, but only about a third still had the handset after 13 months. It is a working paper from one country and measures spending, not internet use.', barriers: ['folk_belief', 'friction', 'scale'] },
};

// Who has to change. Matched from the entry's own `who`; the always-present roles are the person who decides and the people the solution is for.
const ROLES = [
  { id: 'decision', name: 'Decision-maker', re: /ministr|authorit|board|commission|regulator|legislat|council|government|bank|utilit|department|committee|programme/i, always: true, concern: 'Carries the blame if a visible change fails, must fit it into a budget cycle, and answers to people with other priorities.', sources: ['ritov1990', 'damschroder2009'] },
  { id: 'delivery', name: 'Delivery lead', re: /manager|head|officer|school|ward|clinic|hospital|network|operator|police|unit|agenc|NGO|stop-smoking|service/i, concern: 'Absorbs the extra work, is judged on current targets, and needs the practice to fit the way the unit already runs.', sources: ['damschroder2009', 'greenhalgh2004'] },
  { id: 'frontline', name: 'Frontline staff', re: /nurse|midwi|teacher|worker|volunteer|clinician|clinic|ward|school|police|partners/i, concern: 'Their routine, skill and professional pride are what change; they will adopt what is easy to do and respected by peers.', sources: ['rogers2003', 'flodgren2019'] },
  { id: 'funder', name: 'Funders and partners', re: /funder|donor|bank|NGO|foundation|UNICEF|fund/i, concern: 'Want a result they can report and a reason to expect it will last; they can change what is easy by changing what they ask for.', sources: ['powell2015'] },
  { id: 'users', name: 'The people it is for', always: true, concern: 'Decide whether to use it; friction, trust and fit with daily life matter more than being told it is good for them.', sources: ['michie2011', 'bit2014'] },
];
export const rolesFor = s => ROLES.filter(r => r.always || (r.re && r.re.test(s.who || ''))).map(r => ({ id: r.id, name: r.name, concern: r.concern, sources: r.sources, named: !r.always && r.re.test(s.who || '') }));

const firstSentence = t => String(t || '').split(/(?<=[.!?])\s+/)[0] || '';
const GRADE_NAME = { 'evidence-backed': 'strong', 'mixed evidence': 'mixed', 'cited, weaker design': 'weak' };
export const aimFor = s => ({
  'evidence-backed': { kind: 'adopt-pilot', text: 'Move from awareness to a small, well-run local pilot. The evidence is a trial or review, so the aim is a pilot with a decision rule, not a rollout.' },
  'mixed evidence': { kind: 'fair-test', text: 'Do not push for adoption. The evidence is contested, so the aim is a fair local test and a decision rule agreed in advance, whichever side people start on.' },
  'cited, weaker design': { kind: 'test-first', text: 'Test locally before committing. The cited design is weaker than a trial, so the aim is a small test that could show it does not work.' },
}[s.label] || { kind: 'test-first', text: 'Test locally before committing.' });

const RANK = { strong: 3, moderate: 2, weak: 1, contested: 0 };
const leverFor = (barriers, grade) => Object.entries(LEVERS)
  .map(([id, l]) => ({ id, ...l, hits: l.addresses.filter(b => barriers.includes(b)).length }))
  .filter(l => l.hits > 0 || l.id === 'stop_rule')
  .sort((a, b) => b.hits - a.hits || RANK[b.strength] - RANK[a.strength])
  .slice(0, grade === 'mixed' ? 6 : 5);

export function profileFor(s) {
  const hint = HINTS[s.id], aim = aimFor(s), grade = GRADE_NAME[s.label] || 'weak';
  const barriers = [...new Set([...(hint ? hint.barriers : ['inertia', 'capability', 'friction']), ...(grade === 'mixed' ? ['sunk_cost'] : []), 'optimism'])].filter(b => BARRIERS[b]);
  const levers = leverFor(barriers, grade);
  const lim = firstSentence(s.limits);
  const steps = [...barriers.slice(0, 2).map(b => BARRIERS[b].first_step), `Run the cheapest first test: ${s.first_test}`, 'Before it starts, write down the one number you will watch, the result that would make you stop and the result that would make you continue, and give the rule to someone other than the sponsor.'];
  return {
    id: s.id, label: s.label, grade, aim: aim.kind, aim_text: aim.text, bespoke: !!hint,
    roles: rolesFor(s),
    belief: hint ? { belief: hint.belief, says: hint.says } : { belief: 'People who have not seen the evidence may hold a different view. Ask what they believe before presenting it.', says: `${s.claim} ${lim}` },
    barriers, levers: levers.map(l => l.id), steps,
    mind: {
      ours: { 'evidence-backed': `We would downgrade this entry if a well-run replication or review finds no effect on the main outcome. Our own stated limit: ${lim}`, 'mixed evidence': 'We would move this entry toward "works" or "does not work" only when a new trial or review resolves the disagreement. Until then both readings stay on the page.', 'cited, weaker design': 'We would raise this entry\'s label only when a trial or systematic review reports the main outcome.' }[s.label] || 'We would revise this entry on better evidence.',
      yours: `If you would keep your view whatever the pilot shows, it is not a test. Decide first what result would change your mind, in either direction. The test: ${s.first_test}`,
    },
    sources: [...new Set([...roleSources(s), ...barriers.flatMap(b => BARRIERS[b].sources), ...levers.flatMap(l => l.sources)])],
  };
}
const roleSources = s => rolesFor(s).flatMap(r => r.sources);

// ---------------------------------------------------------------- the guard
const strs = p => JSON.stringify([p.aim_text, p.belief, p.steps, p.mind, p.roles.map(r => r.concern)]);
export function guard(p, s) {
  const bad = [], add = m => bad.push(m);
  const text = strs(p);
  if (MANIPULATIVE.test(text)) add('pressure or manipulation wording');
  if (p.grade !== 'strong' && OVERCLAIM.test(text)) add('overclaim on a finding that is not strongly evidenced');
  if (p.grade === 'mixed' && !/fair local test/.test(p.aim_text)) add('a contested finding must aim at a fair test, not adoption');
  if (p.grade === 'mixed' && p.aim !== 'fair-test') add('contested aim kind');
  if (p.grade === 'weak' && p.aim === 'adopt-pilot') add('weak design cannot aim at a pilot rollout');
  for (const id of p.sources) if (!SOURCES[id]) add('unknown source ' + id);
  for (const id of p.barriers) if (!BARRIERS[id] || !BARRIERS[id].sources.length) add('barrier without a source: ' + id);
  for (const id of p.levers) if (!LEVERS[id] || !LEVERS[id].sources.length) add('lever without a source: ' + id);
  if (p.levers.length < 3) add('fewer than three levers');
  if (p.steps.length < 3) add('fewer than three first steps');
  if (!p.mind.ours || !p.mind.yours) add('missing what-would-change-your-mind');
  if (s && p.id !== s.id) add('profile for a different entry');
  return bad;
}
// The library lints itself: a lever's stated strength may not exceed what its sources' designs allow.
export function lintLibrary() {
  const bad = [], ok = { strong: ['meta-analysis'], moderate: ['meta-analysis', 'review', 'trial'] };
  for (const [id, l] of Object.entries(LEVERS)) {
    const need = ok[l.strength];
    if (need && !l.sources.some(x => SOURCES[x] && need.includes(SOURCES[x].grade))) bad.push(`${id}: strength ${l.strength} without a ${need.join(' or ')} source`);
    if (!l.not) bad.push(`${id}: no statement of what it is not`);
    for (const x of l.sources) if (!SOURCES[x]) bad.push(`${id}: unknown source ${x}`);
    for (const b of l.addresses) if (!BARRIERS[b]) bad.push(`${id}: unknown barrier ${b}`);
    if (MANIPULATIVE.test(JSON.stringify(l))) bad.push(`${id}: pressure wording`);
  }
  for (const [id, b] of Object.entries(BARRIERS)) for (const x of b.sources) if (!SOURCES[x]) bad.push(`${id}: unknown source ${x}`);
  for (const [id, x] of Object.entries(SOURCES)) if (!x.caveat || !x.says || !x.grade) bad.push(`${id}: source needs says, grade and caveat`);
  return bad;
}

// ---------------------------------------------------------------- rendering
const STRENGTH_TONE = { strong: 'ok', moderate: 'info', weak: 'warn', contested: 'warn' };
const CHECK_TEXT = { verified: 'found in OpenAlex', unresolved: 'NOT FOUND in OpenAlex: treat as unverified', not_indexed: 'book or report, not machine-checked', unchecked: 'not yet machine-checked' };
export const statusOf = id => (CHECKED.status || {})[id] || 'unchecked';
// a lever whose every source failed the lookup is shown no stronger than weak
export const strengthOf = l => l.sources.length && l.sources.every(x => statusOf(x) === 'unresolved') ? 'weak' : l.strength;
const srcLine = id => { const x = SOURCES[id]; return x ? `${esc(x.cite)} <span class="m">(${esc(x.grade)}). ${esc(x.says)} <i>Caution: ${esc(x.caveat)}</i> <b>Citation: ${esc(CHECK_TEXT[statusOf(id)])}.</b></span>` : ''; };
const srcSearch = id => 'https://europepmc.org/search?query=' + encodeURIComponent(String(SOURCES[id].cite).replace(/\(.*?\)/g, '').slice(0, 140));
const sourceList = ids => ui.list(ids.filter(i => SOURCES[i]).map(i => `${srcLine(i)} <a href="${esc(srcSearch(i))}" rel="noopener">find it</a>`));

export function changeBlock(s) {
  const p = profileFor(s);
  if (guard(p, s).length) return '';   // a profile that fails its guard is not shown; the audit files the fix
  const tone = p.grade === 'strong' ? 'ok' : p.grade === 'mixed' ? 'warn' : 'info';
  return `<p>${ui.badge(s.label, tone)} <b>Aim:</b> ${esc(p.aim_text)}</p>
<h3>Who has to change</h3>${ui.list(p.roles.map(r => `<b>${esc(r.name)}</b>${r.named ? '' : ' <span class="m">(always involved)</span>'}: ${esc(r.concern)}`))}
<p class="m">These are common concerns to ask about, not facts about any one person.</p>
<h3>What people may believe, and what the evidence says</h3><p><b>Common belief:</b> ${esc(p.belief.belief)}</p><p><b>What this entry\'s evidence shows:</b> ${esc(p.belief.says)}</p>
<h3>What tends to get in the way</h3>${ui.list(p.barriers.map(b => `<b>${esc(BARRIERS[b].name)}.</b> ${esc(BARRIERS[b].why)} <span class="m">Ask: ${esc(BARRIERS[b].diagnose)}</span>`))}
<h3>What has been tested against it</h3>${ui.list(p.levers.map(id => { const l = LEVERS[id]; return `${ui.badge(strengthOf(l), STRENGTH_TONE[strengthOf(l)])} <b>${esc(l.name)}.</b> ${esc(l.how)} <span class="m">${esc(l.not)}</span>`; }))}
<h3>First steps, each small enough for a week</h3><ol class="list">${p.steps.map(t => `<li>${esc(t)}</li>`).join('')}</ol>
<h3>What would change your mind</h3>${ui.summaryList([['Ours', esc(p.mind.ours)], ['Yours', esc(p.mind.yours)]])}
<p class="m">This follows the transparency test: ${esc(ETHICS.test)} <a href="/change">How the change layer works, and the ideas it does not rely on</a>.</p>
${ui.details('Sources for these behavioural claims', sourceList(p.sources))}`;
}

export function changeBody(c) {
  const bs = Object.entries(BARRIERS), ls = Object.entries(LEVERS), ps = c.sols.map(s => [s, profileFor(s)]);
  const bespoke = ps.filter(([, p]) => p.bespoke).length;
  return `${ui.breadcrumbs([{ label: 'Home', href: '/' }, { label: 'Making change happen' }])}<h1>Making change happen</h1>
<p class="lede">A finding that nobody acts on changes nothing, and the weak link is usually human: habits, beliefs, incentives and fear of blame. This page is the evidence on that, kept to the same standard as the rest of the site. Each solution carries a change profile: who must change, what they may believe, what gets in the way, what has been tested, and a first step.</p>
${ui.callout({ tone: 'info', title: 'The rule', body: `<p>${esc(ETHICS.test)}</p>${ui.list(ETHICS.rules.map(esc))}<p class="m">After ${srcLine(ETHICS.source)}</p>` })}
${ui.section({ id: 'aim', title: 'The aim follows the evidence', body: ui.list([`${ui.badge('evidence-backed', 'ok')} A trial or review stands behind it: the aim is a small, well-run local pilot with a decision rule.`, `${ui.badge('cited, weaker design', 'info')} Early evidence: the aim is a test that could show it does not work.`, `${ui.badge('mixed evidence', 'warn')} The sources disagree: the aim is a fair local test and a rule agreed in advance. Nobody is asked to adopt on one side\'s word.`]) })}
${ui.section({ id: 'barriers', title: `What gets in the way (${bs.length})`, body: ui.list(bs.map(([, b]) => `<b>${esc(b.name)}.</b> ${esc(b.why)} <span class="m">It sounds like: ${b.signs.map(esc).join(' ')} Ask: ${esc(b.diagnose)}</span> ${sourceList(b.sources)}`)) })}
${ui.section({ id: 'levers', title: `What has been tested (${ls.length})`, body: ui.list(ls.map(([, l]) => `${ui.badge(strengthOf(l), STRENGTH_TONE[strengthOf(l)])} <b>${esc(l.name)}.</b> ${esc(l.how)} <span class="m">${esc(l.not)}</span> ${sourceList(l.sources)}`)) })}
${ui.section({ id: 'minds', title: 'Changing minds, yours and theirs', body: ui.list(MIND_RULES.map(m => `<b>${esc(m.rule)}</b> ${esc(m.why)} ${sourceList(m.sources)}`)) })}
${ui.section({ id: 'retired', title: 'Ideas this layer does not rely on', body: `<p>Popular claims from behavioural science that failed to hold up. A change plan built on them would be built on sand.</p>${ui.list(RETIRED.map(r => `${esc(r.idea)}. ${sourceList([r.source, r.also].filter(Boolean))}`))}` })}
${ui.section({ id: 'entries', title: 'Change profiles by solution', body: `<p>${ps.length} solutions have a profile; ${bespoke} carry a belief and barriers written for that entry and the rest use a generated profile until one is written. A new entry gets one at once.</p>${ui.list(ps.map(([s, p]) => `<a href="/solutions/${esc(s.id)}#change">${esc(s.title)}</a> ${ui.badge(s.label, p.grade === 'strong' ? 'ok' : p.grade === 'mixed' ? 'warn' : 'info')}`))}` })}
<p class="m">Limits: most of the behavioural evidence comes from rich-country lab and field studies and from health-system implementation research; effects in other settings are uncertain, which is why every profile ends in a local test. <a href="/change.json">All of it as JSON</a>.</p>`;
}

export const changeJson = c => ({ schema: 'ps-change/1', rule: ETHICS, barriers: BARRIERS, levers: LEVERS, retired: RETIRED, mind_rules: MIND_RULES, sources: SOURCES,
  solutions: Object.fromEntries(c.sols.map(s => [s.id, profileFor(s)])) });

// ---------------------------------------------------------------- promotion copy
// One plain post per solution about the human side of it. Calibrated to the label like the other posts: a contested entry is presented as a test to run.
const HOOK = 'Built on Ultrastable.';
const lower = t => t.charAt(0).toLowerCase() + t.slice(1);
const plain = t => t.replace(/\s*\([^)]*\)\s*$/, '');
export function changePost(s, o, limit = 280) {
  const p = profileFor(s), url = `${o}/solutions/${s.id}#change`, t = lower(plain(s.title));
  const b = p.belief.belief.replace(/\.$/, ''), lever = LEVERS[p.levers[0]].name.toLowerCase();
  const step = BARRIERS[p.barriers[0]].first_step.replace(/\.$/, '');
  const early = p.grade === 'weak';
  const c = early
    ? [`Early evidence on ${t}, so the useful move is a small local test first. A common view: "${b}." What helps: ${lever}. ${HOOK}`, `${plain(s.title)}: the evidence is early. A small local test comes first; the people side is on the page. ${HOOK}`]
    : p.grade === 'mixed'
    ? [`The evidence on ${t} is contested, so the useful move is a fair local test with the stopping rule written first. People often start from "${b}". ${HOOK}`, `${plain(s.title)}: contested evidence. Agree a local test and a stop rule before anyone adopts. ${HOOK}`]
    : [`The hard part of ${t} is usually people, not evidence. A common view: "${b}" What helps: ${lever}. ${HOOK}`, `Getting ${t} adopted: ${lever}. A first step: ${lower(step)}. ${HOOK}`, `${plain(s.title)}: the people who must change, what gets in their way and a first step. ${HOOK}`];
  const room = limit - url.length - 1;
  return `${c.map(x => x.replace(/\s+/g, ' ').trim()).find(x => x.length <= room)}\n${url}`;
}
