// SPDX-License-Identifier: LicenseRef-Ultrastable-USL-1.0
// Copyright (c) 2026 Rowan Brad Quni-Gudzinas. Non-commercial use free; commercial use requires a license. See LICENSE.
// tenant-ps-mail: a tiny stateless mail relay. The mail domain lives in the ultrastable account and Email Routing and Sending only
// work for Workers in the domain's own account, so this Worker sits next to the domain and talks to the backend over authenticated HTTPS.
//   inbound:  email() -> POST {BACKEND_URL}/internal/mail            (header x-ps-token = MAIL_TOKEN)
//   outbound: POST /send {to, from, reply_to, subject, text}         (header x-ps-token = MAIL_TOKEN) -> EMAIL.send
// Bindings: BACKEND_URL (plain_text), MAIL_TOKEN (secret_text), EMAIL (send_email). It stores nothing.
const ok = (env, req) => Boolean(env.MAIL_TOKEN) && req.headers.get('x-ps-token') === env.MAIL_TOKEN;

export default {
  async email(message, env) {
    const raw = await new Response(message.raw).text();
    const text = raw.split(/\r?\n\r?\n/).slice(1).join('\n');
    const r = await fetch(env.BACKEND_URL + '/internal/mail', { method: 'POST', headers: { 'x-ps-token': env.MAIL_TOKEN, 'content-type': 'application/json' },
      body: JSON.stringify({ from: message.from, subject: message.headers.get('subject') || '', text }) });
    if (!r.ok) throw new Error('backend refused mail: ' + r.status); // the sender's server then retries or bounces; nothing is dropped silently
  },
  async fetch(req, env) {
    const u = new URL(req.url);
    if (u.pathname === '/health') return Response.json({ ok: true });
    if (u.pathname !== '/send' || req.method !== 'POST') return new Response('not found', { status: 404 });
    if (!ok(env, req)) return new Response('forbidden', { status: 403 });
    const m = await req.json();
    for (const k of ['to', 'from', 'subject', 'text']) if (!m[k]) return Response.json({ error: `missing ${k}` }, { status: 400 });
    await env.EMAIL.send({ to: m.to, from: m.from, replyTo: m.reply_to, subject: m.subject, text: m.text });
    return Response.json({ sent: true });
  },
};
