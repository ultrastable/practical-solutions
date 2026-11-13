// SPDX-License-Identifier: LicenseRef-Ultrastable-USL-1.0
// Copyright (c) 2026 Rowan Brad Quni-Gudzinas. Non-commercial use free; commercial use requires a license. See LICENSE.
// The Cloudflare Worker: cron runs one tick of every loop; fetch serves /health, /ps/briefs, /ps/criticality and the Ultrastable routes.
import { createPs } from '../../ps/org.js';

const ps = env => createPs({ db: env.DB, env, secrets: env });

export default {
  async scheduled(_event, env, ctx) { ctx.waitUntil(ps(env).tick()); },
  async fetch(request, env) {
    return (await ps(env).handle(request)) ?? new Response('practical-solutions\n', { status: 404, headers: { 'content-type': 'text/plain' } });
  },
};
