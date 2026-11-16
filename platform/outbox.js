// SPDX-License-Identifier: LicenseRef-Ultrastable-USL-1.0
// Copyright (c) 2026 Rowan Brad Quni-Gudzinas. Non-commercial use free; commercial use requires a license. See LICENSE.
// Core candidate: an outreach outbox for automated senders. Nothing leaves without a human approval and a transport; with no
// transport it only records what it would have sent (dry run). Rules enforced in code, not policy:
//   - the sender identity (name, postal address, reply address) and the disclosure footer are required and always appended
//   - every intent cites evidence (a URL a recipient can check)
//   - a suppressed address is never sent to; opting out is immediate and permanent
//   - per-day and per-recipient caps; one send per intent
// Storage: any { get(key), put(key, value) }. Tenants submit intents; they never reach the transport directly.
const KEY = 'outbox';
const norm = e => String(e || '').trim().toLowerCase();

export function createOutbox({ store, sender, footer, limits = { perDay: 5, perRecipient: 2 }, now = () => Date.now() }) {
  for (const k of ['name', 'postal', 'reply_to']) if (!sender || !sender[k]) throw new Error(`outbox: sender.${k} is required`);
  if (!footer) throw new Error('outbox: disclosure footer is required');
  const load = async () => { const v = await store.get(KEY); return v ? JSON.parse(v) : { intents: {}, suppressed: {}, log: [] }; };
  const save = s => store.put(KEY, JSON.stringify(s));
  const render = i => `${i.body}\n\n--\n${footer}\n${sender.name}, ${sender.postal}\nReplies reach a monitored inbox: ${sender.reply_to}\nTo stop all messages from us, reply "stop" or write to that address; we will not contact you again.\nEvidence: ${i.evidence_url}`;

  return {
    render,
    async submit({ id, to, subject, body, evidence_url }) {
      if (!id || !to || !subject || !body) throw new Error('outbox: id, to, subject and body are required');
      if (!/^https:\/\//.test(evidence_url || '')) throw new Error('outbox: evidence_url (https) is required');
      const s = await load();
      if (s.intents[id]) return s.intents[id];
      const addr = norm(to);
      const intent = { id, to: addr, subject, body, evidence_url, status: s.suppressed[addr] ? 'blocked_suppressed' : 'pending_approval', created: new Date(now()).toISOString() };
      s.intents[id] = intent; await save(s); return intent;
    },
    async approve(id, by) {
      if (!by || /^agent:/.test(by)) throw new Error('outbox: approval must name a human');
      const s = await load(); const i = s.intents[id];
      if (!i) throw new Error('outbox: no such intent');
      if (i.status !== 'pending_approval') return i;
      i.status = 'approved'; i.approved_by = by; await save(s); return i;
    },
    async suppress(address, why = 'opt-out') {
      const s = await load(); const a = norm(address);
      s.suppressed[a] = { why, at: new Date(now()).toISOString() };
      for (const i of Object.values(s.intents)) if (i.to === a && ['pending_approval', 'approved'].includes(i.status)) i.status = 'blocked_suppressed';
      await save(s);
    },
    // Send what is approved and within caps. transport: async ({ to, subject, text, reply_to }) => void. Absent: dry run.
    async dispatch({ transport } = {}) {
      const s = await load(); const out = [];
      const day = new Date(now()).toISOString().slice(0, 10);
      const sentToday = () => s.log.filter(l => l.at.slice(0, 10) === day && l.result !== 'skipped').length;
      for (const i of Object.values(s.intents).filter(x => x.status === 'approved')) {
        const prior = s.log.filter(l => l.to === i.to && l.result !== 'skipped').length;
        const why = s.suppressed[i.to] ? 'suppressed' : sentToday() >= limits.perDay ? 'daily cap' : prior >= limits.perRecipient ? 'recipient cap' : null;
        const at = new Date(now()).toISOString();
        if (why) { out.push({ id: i.id, result: 'skipped', why }); continue; }
        const text = render(i);
        if (transport) { await transport({ to: i.to, subject: i.subject, text, reply_to: sender.reply_to }); i.status = 'sent'; } else i.status = 'dry_run';
        i.sent_at = at; s.log.push({ id: i.id, to: i.to, at, result: i.status, text });
        out.push({ id: i.id, result: i.status });
      }
      await save(s); return out;
    },
    async stats() {
      const s = await load(); const by = {};
      for (const i of Object.values(s.intents)) by[i.status] = (by[i.status] || 0) + 1;
      return { intents: by, suppressed: Object.keys(s.suppressed).length, sent_log: s.log.length };
    },
  };
}
