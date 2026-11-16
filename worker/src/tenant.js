// SPDX-License-Identifier: LicenseRef-Ultrastable-USL-1.0
// Copyright (c) 2026 Rowan Brad Quni-Gudzinas. Non-commercial use free; commercial use requires a license. See LICENSE.
// tenant-ps-web: the tenant's own Worker. Cron runs the improvement tick; fetch serves the page and the data it reads.
// Bindings: STATE (tenant-ps-kv) only. Core is never called; the loop backend is reached by plain HTTP (BACKEND var).
import { PAGE } from './ui.js';
import { rankProblems } from './problems.js';
import { tick, verifiedText } from './improve.js';

const BACKEND = 'https://ps-practical-solutions.q08.workers.dev';
const j = async (env, k, d) => { const v = await env.STATE.get(k); return v ? JSON.parse(v) : d; };
const headers = { 'content-type': 'text/html; charset=utf-8', 'content-security-policy': "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'", 'x-content-type-options': 'nosniff' };

export default {
  async scheduled(_e, env, ctx) { ctx.waitUntil(tick({ store: env.STATE, rank: rankProblems })); },
  async fetch(r, env) {
    const u = new URL(r.url);
    if (u.pathname === '/' || u.pathname === '/index.html') return new Response(PAGE, { headers });
    if (u.pathname === '/solutions.json') {
      const verif = await j(env, 'verif', {});
      const sols = (await j(env, 'solutions', [])).map(({ checks, ...s }) => ({ ...s, verified: verifiedText(verif[s.id]) || s.verified }));
      return Response.json({ solutions: sols });
    }
    if (u.pathname === '/problems.json') return Response.json(await j(env, 'problems', null) || await rankProblems());
    if (u.pathname === '/candidates.json') return Response.json(await j(env, 'candidates', {}));
    if (u.pathname === '/changes.json') return Response.json({ changes: await j(env, 'changes', []), last_tick: await j(env, 'last_tick', null) });
    if (['/health', '/ps/briefs', '/ps/criticality'].includes(u.pathname)) return fetch(BACKEND + u.pathname, { headers: { accept: 'application/json' } });
    return new Response('not found', { status: 404 });
  },
};
