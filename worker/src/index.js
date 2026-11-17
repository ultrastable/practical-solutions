// SPDX-License-Identifier: LicenseRef-Ultrastable-USL-1.0
// Copyright (c) 2026 Rowan Brad Quni-Gudzinas. Non-commercial use free; commercial use requires a license. See LICENSE.
// The Cloudflare Worker: cron runs one tick of every loop; fetch serves /health, /ps/briefs, /ps/criticality and the Ultrastable routes.
// Two token-gated routes exist for the bootstrap workflow: POST /ps/tick (run one tick now) and GET /ps/ledger (export state).
import { createPs } from '../../ps/org.js';
import { ledgerExport } from '../../ps/ledger.js';
import { PAGE } from './ui.js';
import { SOLUTIONS } from './solutions.js';
import { rankProblems } from './problems.js';
import { ALLOW, FILES } from './selfmigrate.gen.js';
import { FOOTER } from './publish.js';
import { handleInbound, recordEvent, metrics, queue, approveIntent, suppressAddr, agenciesGraph } from '../../ps/outreach_step.js';


const ORIGIN = 'https://tenant-ps-web.ultrastable.workers.dev';
const ps = env => createPs({ db: env.DB, env, secrets: env, selfMigrate: { files: FILES, allow: ALLOW }, solutions: SOLUTIONS, footer: FOOTER, origin: env.PS_ORIGIN || ORIGIN });
const authed = (request, env) => Boolean(env.PS_TICK_TOKEN) && request.headers.get('x-ps-token') === env.PS_TICK_TOKEN;

export default {
  async scheduled(_event, env, ctx) { ctx.waitUntil(ps(env).tick()); },
  // Mail to the monitored reply address: stored, classified, and acted on automatically (opt-outs suppress, bounces count toward the health gate).
  async email(message, env) {
    const raw = await new Response(message.raw).text();
    const body = raw.split(/\r?\n\r?\n/).slice(1).join('\n');
    await handleInbound(env.DB, { from: message.from, subject: message.headers.get('subject') || '', text: body }, new Date().toISOString().replace('T', ' ').slice(0, 19));
  },
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    if (pathname === '/' || pathname === '/index.html') return new Response(PAGE, { headers: { 'content-type': 'text/html; charset=utf-8', 'content-security-policy': "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'", 'x-content-type-options': 'nosniff' } });
    if (pathname === '/problems.json') return Response.json(await rankProblems(), { headers: { 'cache-control': 'public, max-age=21600' } });
    if (pathname === '/solutions.json') return Response.json({ solutions: SOLUTIONS });
    if (pathname === '/internal/mail' && request.method === 'POST') {
      if (!env.MAIL_TOKEN || request.headers.get('x-ps-token') !== env.MAIL_TOKEN) return new Response('forbidden\n', { status: 403 });
      const m = await request.json();
      return Response.json({ kind: await handleInbound(env.DB, { from: m.from, subject: m.subject, text: m.text }, new Date().toISOString().replace('T', ' ').slice(0, 19)) });
    }
    if (pathname === '/internal/tick' && request.method === 'POST' && request.headers.get('x-ps-internal') === '1') return Response.json({ report: (await ps(env).tick()).report });
    if (pathname === '/agencies.json') return Response.json(agenciesGraph(SOLUTIONS));
    if (pathname.startsWith('/ps/outreach/')) {
      if (!authed(request, env)) return new Response('forbidden\n', { status: 403 });
      const u = new URL(request.url), now = Date.now();
      if (pathname === '/ps/outreach/queue') return Response.json(await queue(env.DB, env, now, FOOTER));
      if (request.method !== 'POST') return new Response('POST only\n', { status: 405 });
      if (pathname === '/ps/outreach/event') { await recordEvent(env.DB, u.searchParams.get('kind'), u.searchParams.get('id'), u.searchParams.get('detail'), new Date(now).toISOString().replace('T', ' ').slice(0, 19)); return Response.json({ ok: true }); }
      if (pathname === '/ps/outreach/approve') return Response.json({ approved: await approveIntent(env.DB, env, now, FOOTER, u.searchParams.get('id'), u.searchParams.get('by')) });
      if (pathname === '/ps/outreach/suppress') { await suppressAddr(env.DB, env, now, FOOTER, u.searchParams.get('addr'), 'opt-out'); return Response.json({ suppressed: true }); }
    }
    if (pathname === '/ps/tick' || pathname === '/ps/ledger') {
      if (!authed(request, env)) return new Response('forbidden\n', { status: 403 });
      if (pathname === '/ps/tick') return request.method === 'POST' ? Response.json({ report: (await ps(env).tick()).report }) : new Response('POST only\n', { status: 405 });
      return Response.json(await ledgerExport(env.DB));
    }
    return (await ps(env).handle(request)) ?? new Response('practical-solutions\n', { status: 404, headers: { 'content-type': 'text/plain' } });
  },
};
