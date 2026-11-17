// SPDX-License-Identifier: LicenseRef-Ultrastable-USL-1.0
// Copyright (c) 2026 Rowan Brad Quni-Gudzinas. Non-commercial use free; commercial use requires a license. See LICENSE.
// The outreach tick step and the approval queue. Always dry-run: core/outreach sends nothing without a transport and a named human.
import agenciesFile from '../org/agencies.json' with { type: 'json' };
import targeting from '../org/targeting.json' with { type: 'json' };
import { plan, roleAddresses, graphView, health } from './outreach.js';
import { submit, approve, suppress, stats, dispatch } from '../vendor/ultrastable/core/outreach/index.js';

const AGENCIES = agenciesFile.agencies;
const all = async (db, sql, ...a) => (await db.prepare(sql).bind(...a).all()).results || [];
export const hasIdentity = env => Boolean(env.OPERATOR_NAME && env.OPERATOR_POSTAL && env.OPERATOR_REPLY_TO);
const coreCtx = (db, env, now, footer) => ({ db, now: () => now, config: { sender: { name: env.OPERATOR_NAME, postal: env.OPERATOR_POSTAL, reply_to: env.OPERATOR_REPLY_TO }, footer } });

export async function contactsMap(db) {
  const m = {};
  for (const r of await all(db, `SELECT agency_id, addr FROM ps_agency_contacts ORDER BY addr`)) (m[r.agency_id] ||= []).push(r.addr);
  return m;
}

/** Read each agency's own public contact page (a few per tick, oldest first) and keep only role addresses on its domain. */
export async function discover(db, { fetch: f, nowIso, max = 3 }) {
  const seen = Object.fromEntries((await all(db, `SELECT agency_id, MAX(found_at) t FROM ps_agency_contacts GROUP BY agency_id`)).map(r => [r.agency_id, r.t]));
  const todo = AGENCIES.filter(a => !seen[a.id]).slice(0, max);
  const report = [];
  for (const a of todo) {
    try {
      const r = await f(a.contact_page, { headers: { 'user-agent': 'PracticalSolutionsBot (automated evidence service; honors robots.txt and opt-outs)' }, redirect: 'follow' });
      if (!r.ok) { report.push({ agency: a.id, ok: false, status: r.status }); continue; }
      const found = roleAddresses(await r.text(), a.domain, targeting);
      for (const addr of found) await db.prepare(`INSERT OR IGNORE INTO ps_agency_contacts (agency_id, addr, source_url, found_at) VALUES (?,?,?,?)`).bind(a.id, addr, a.contact_page, nowIso).run();
      report.push({ agency: a.id, ok: true, found: found.length });
    } catch (e) { report.push({ agency: a.id, ok: false, error: String(e.message).slice(0, 120) }); }
  }
  return report;
}

export function outreachStep({ solutions, fetch: f, env, footer, origin }) {
  return {
    name: 'ps_outreach',
    async run(db, ctx) {
      const d = await discover(db, { fetch: f, nowIso: ctx.nowIso });
      const planned = plan({ solutions, agencies: AGENCIES, contacts: await contactsMap(db), targeting, origin });
      let stored = 0, submitted = 0;
      const known = new Set((await all(db, `SELECT id FROM ps_outreach_plan`)).map(r => r.id));
      for (const p of planned) {
        if (known.has(p.id) && !p.to) continue;
        if (stored >= targeting.per_tick_max) break;
        await db.prepare(`INSERT INTO ps_outreach_plan (id, solution_id, agency_id, to_addr, subject, body, evidence_url, reason, at) VALUES (?,?,?,?,?,?,?,?,?)
          ON CONFLICT(id) DO UPDATE SET to_addr=COALESCE(excluded.to_addr, ps_outreach_plan.to_addr), subject=excluded.subject, body=excluded.body WHERE ps_outreach_plan.submitted=0`)
          .bind(p.id, p.solution_id, p.agency_id, p.to, p.subject, p.body, p.evidence_url, p.reason, ctx.nowIso).run();
        stored++;
        if (p.to && hasIdentity(env)) {
          await submit(coreCtx(db, env, ctx.now, footer), { tenant: 'ps', id: p.id, to: p.to, subject: p.subject, body: p.body, evidence_url: p.evidence_url });
          await db.prepare(`UPDATE ps_outreach_plan SET submitted=1 WHERE id=?`).bind(p.id).run();
          submitted++;
        }
      }
      // Automated gates, not human gates (Rowan, 2026-11-17): identity, role address on the agency's own domain, suppression, caps, health pause, transport.
      const h = health(await all(db, `SELECT kind FROM ps_outreach_events`), targeting);
      let sentNow = 0;
      if (hasIdentity(env) && !h.paused) {
        const c = coreCtx(db, env, ctx.now, footer);
        for (const r of await all(db, `SELECT id FROM outreach_intents WHERE status='pending_approval' AND tenant='ps'`)) await approve(c, r.id, targeting.approver);
        const transport = env.EMAIL?.send ? async m => env.EMAIL.send({ to: m.to, from: env.OPERATOR_REPLY_TO, replyTo: m.reply_to, subject: m.subject, text: m.text }) : undefined;
        const out = await dispatch(c, { transport, limits: { perDay: targeting.gates.per_day, perRecipient: targeting.gates.per_recipient } });
        for (const o of out.filter(x => x.result === 'sent')) { sentNow++; await db.prepare(`INSERT INTO ps_outreach_events (intent_id, kind, at) VALUES (?, 'sent', ?)`).bind(o.id, ctx.nowIso).run(); }
      }
      ctx.notes.push(`ps_outreach: ${sentNow} sent, ${h.paused ? 'PAUSED by health gate, ' : ''} contacts ${d.filter(x => x.ok).length}/${d.length} pages read, ${stored} planned, ${submitted} queued for approval${hasIdentity(env) ? '' : ' (operator identity not set: previews only)'}`);
    },
  };
}

export async function recordEvent(db, kind, intentId, detail, nowIso) {
  const ok = ['bounce', 'complaint', 'reply', 'implementation_signal'];
  if (!ok.includes(kind)) throw new Error('unknown event');
  await db.prepare(`INSERT INTO ps_outreach_events (intent_id, kind, detail, at) VALUES (?,?,?,?)`).bind(intentId, kind, detail || null, nowIso).run();
  if (kind === 'complaint' || kind === 'bounce') { const r = await db.prepare(`SELECT to_addr FROM outreach_intents WHERE id=?`).bind(intentId).first(); if (r) await db.prepare(`INSERT OR REPLACE INTO outreach_suppressed (addr, why, at) VALUES (?,?,?)`).bind(r.to_addr, kind, nowIso).run(); }
}
export async function metrics(db) { return health(await all(db, `SELECT kind FROM ps_outreach_events`), targeting); }

export async function queue(db, env, now, footer) {
  const rows = await all(db, `SELECT p.id, p.solution_id, p.agency_id, p.to_addr, p.subject, p.body, p.evidence_url, p.reason, p.submitted, i.status FROM ps_outreach_plan p LEFT JOIN outreach_intents i ON i.id=p.id ORDER BY p.at, p.id`);
  return { configured: hasIdentity(env), mode: 'dry_run', items: rows.map(r => ({ ...r, status: r.status || (r.to_addr ? 'awaiting_operator_identity' : 'no_public_contact_address') })), stats: await stats({ db }, 'ps'), health: await metrics(db) };
}
export const approveIntent = (db, env, now, footer, id, by) => approve(coreCtx(db, env, now, footer), id, by);
export const suppressAddr = (db, env, now, footer, addr, why) => suppress(coreCtx(db, env, now, footer), addr, why);
export const agenciesGraph = solutions => graphView({ solutions, agencies: AGENCIES, targeting });
