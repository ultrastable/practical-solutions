// SPDX-License-Identifier: LicenseRef-Ultrastable-USL-1.0
// Copyright (c) 2026 Rowan Brad Quni-Gudzinas. Non-commercial use free; commercial use requires a license. See LICENSE.
// The Cloudflare Worker: cron runs one tick of every loop; fetch serves /health, /ps/briefs, /ps/criticality and the Ultrastable routes.
// Two token-gated routes exist for the bootstrap workflow: POST /ps/tick (run one tick now) and GET /ps/ledger (export state).
import { createPs } from '../../ps/org.js';
import { ledgerExport } from '../../ps/ledger.js';


const ps = env => createPs({ db: env.DB, env, secrets: env });
const authed = (request, env) => Boolean(env.PS_TICK_TOKEN) && request.headers.get('x-ps-token') === env.PS_TICK_TOKEN;

export default {
  async scheduled(_event, env, ctx) { ctx.waitUntil(ps(env).tick()); },
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    if (pathname === '/ps/tick' || pathname === '/ps/ledger') {
      if (!authed(request, env)) return new Response('forbidden\n', { status: 403 });
      if (pathname === '/ps/tick') return request.method === 'POST' ? Response.json({ report: (await ps(env).tick()).report }) : new Response('POST only\n', { status: 405 });
      return Response.json(await ledgerExport(env.DB));
    }
    return (await ps(env).handle(request)) ?? new Response('practical-solutions\n', { status: 404, headers: { 'content-type': 'text/plain' } });
  },
};
