// SPDX-License-Identifier: LicenseRef-Ultrastable-USL-1.0
// Copyright (c) 2026 Rowan Brad Quni-Gudzinas. Non-commercial use free; commercial use requires a license. See LICENSE.
// Practical Solutions' targeting for the core outreach outbox: which public agencies could implement which solution, a specific
// evidence-linked message for each pair, and the contact addresses read from the agency's own public contact page. Nothing here sends;
// intents go to core/outreach as pending approval, and core appends the sender identity and the automation disclosure.
const esc = s => String(s ?? '').trim();

export function sectorsFor(solution, targeting) {
  const s = new Set();
  for (const p of solution.problem_ids || []) for (const x of targeting.problem_sectors[p] || []) s.add(x);
  return [...s];
}

/** Targets whose mandate overlaps the solution's sectors, best first; known contact addresses break ties so a message is never planned only for targets that cannot be reached. Capped per audience so one kind cannot crowd out the others. */
export function match(solution, agencies, targeting, contacts = {}) {
  const want = sectorsFor(solution, targeting);
  const ranked = agencies
    .map(a => { const common = a.sectors.filter(x => want.includes(x)); return { agency: a, score: common.length ? common.length * (targeting.remit_weight?.[a.remit] ?? 1) : 0, reason: common.length ? ((a.audience || 'agency') === 'agency' || a.remit === 'implements' || a.remit === 'funds' ? `its mandate covers ${common.join(', ')}` : `your published work covers ${common.join(', ')}`) : '' }; })
    .filter(m => m.score >= (targeting.min_match ?? 1))
    .sort((a, b) => b.score - a.score || Number(Boolean(contacts[b.agency.id]?.length)) - Number(Boolean(contacts[a.agency.id]?.length)) || a.agency.id.localeCompare(b.agency.id));
  const used = {};
  return ranked.filter(m => { const k = m.agency.audience || 'agency'; used[k] = (used[k] || 0) + 1; return used[k] <= (targeting.per_audience_max?.[k] ?? targeting.per_solution_max ?? 4); });
}

/** Pages to read for a target's public contact address: its stated page, then common contact paths on the same domain only. */
export function contactPages(a, targeting) {
  const paths = targeting.contact_path_guesses || ['/contact', '/contact-us', '/about/contact', '/about', '/press', '/media'];
  return [...new Set([a.contact_page, ...paths.map(p => `https://${a.domain}${p}`), ...paths.map(p => `https://www.${a.domain}${p}`)])];
}

/** Role addresses (info@, press@ ...) on the agency's own domain, from the text of its public contact page. Personal-looking addresses are dropped. */
export function roleAddresses(text, domain, targeting) {
  const out = new Set();
  const dom = domain.toLowerCase();
  for (const m of String(text).matchAll(/([a-z0-9._%+-]+)@([a-z0-9.-]+\.[a-z]{2,})/gi)) {
    const local = m[1].toLowerCase(), host = m[2].toLowerCase();
    if (host !== dom && !host.endsWith('.' + dom)) continue;
    if (!targeting.role_local_parts.includes(local.replace(/[._-]/g, ''))) continue;
    out.add(`${local}@${host}`);
  }
  return [...out];
}

export function channelAllowed(agency, targeting) {
  return !targeting.cold_email_blocked_countries.includes(agency.country);
}

export function compose(solution, agency, reason, origin, targeting = {}) {
  const ev = (solution.evidence || [])[0];
  const link = `${origin}/solutions/${solution.id}`;
  const f = targeting.framing?.[agency.audience || 'agency'] || targeting.framing?.agency || { intro: 'We are writing because {reason}, and this entry may be relevant to your work: "{title}".', ask: 'If this is not relevant to you, no action is needed, and replying "stop" ensures you hear nothing further. If we have misread the evidence, replies are read by a person and corrections are published.' };
  const subject = `Evidence for ${solution.title.toLowerCase().replace(/^start /, '')}: a first test for ${agency.name}`.slice(0, 140);
  const body = [
    `To the team at ${agency.name},`,
    f.intro.replace('{reason}', reason).replace('{title}', solution.title),
    esc(solution.claim),
    ev ? `The evidence: ${ev.src}. ${ev.finding}` : '',
    `What it takes: ${esc(solution.takes)}`,
    `A cheap first test: ${esc(solution.first_test)}`,
    `Known limits: ${esc(solution.limits)}`,
    `Verification status: ${esc(solution.verified)}`,
    `Everything above, with its sources, is on one page: ${link}`,
    f.ask,
  ].filter(Boolean).join('\n\n');
  return { subject, body, evidence_url: link };
}

const verifiedOk = s => !/^not yet checked/i.test(s.verified || '') && Boolean(s.verified);

/** Pure planner: every (solution, agency) message that should exist, given known contact addresses. */
export function plan({ solutions, agencies, contacts, targeting, origin }) {
  const out = [];
  for (const s of solutions) {
    if (targeting.require_verified && !verifiedOk(s)) continue;
    for (const m of match(s, agencies, targeting, contacts)) {
      if (!channelAllowed(m.agency, targeting)) continue;
      const to = (contacts[m.agency.id] || [])[0] || null;
      out.push({ id: `ps:${s.id}:${m.agency.id}`, solution_id: s.id, agency_id: m.agency.id, to, reason: m.reason, ...compose(s, m.agency, m.reason, origin, targeting) });
    }
  }
  return interleave(out, agencies);
}

/** Alternate audiences so a daily cap spreads across agencies, NGOs, researchers, media and communities instead of draining one. */
export function interleave(items, agencies) {
  const aud = Object.fromEntries(agencies.map(a => [a.id, a.audience || 'agency']));
  const q = {};
  for (const i of items) (q[aud[i.agency_id] || 'agency'] ||= []).push(i);
  const keys = Object.keys(q).sort(), out = [];
  while (keys.some(k => q[k].length)) for (const k of keys) if (q[k].length) out.push(q[k].shift());
  return out;
}

/** Graph interface: agency nodes and solution -> agency edges, in plain {id, kind, ...} / {src, rel, dst} shape for the knowledge graph to ingest. */
export function graphView({ solutions, agencies, targeting }) {
  const nodes = agencies.map(a => ({ id: `agency:${a.id}`, kind: 'agency', audience: a.audience || 'agency', name: a.name, country: a.country, sectors: a.sectors, level: a.level, url: a.contact_page, source: 'official public site' }));
  const edges = solutions.flatMap(s => match(s, agencies, targeting).map(m => ({ src: `solution:${s.id}`, rel: 'implementable_by', dst: `agency:${m.agency.id}`, why: m.reason })));
  return { nodes, edges };
}

/** Automated safety gate replacing the per-send human check: pause all sending on any complaint or when the bounce rate passes the limit. */
export function health(events, targeting) {
  const n = k => events.filter(e => e.kind === k).length;
  const sent = n('sent'), bounces = n('bounce'), complaints = n('complaint');
  const rate = sent ? bounces / sent : 0;
  const paused = (targeting.gates.pause_on_complaint && complaints > 0) || (sent >= targeting.gates.min_sample && rate > targeting.gates.pause_bounce_rate);
  return { sent, bounces, complaints, replies: n('reply'), implementation_signals: n('implementation_signal'), bounce_rate: rate, paused };
}
