// SPDX-License-Identifier: LicenseRef-Ultrastable-USL-1.0
// Copyright (c) 2026 Rowan Brad Quni-Gudzinas. Non-commercial use free; commercial use requires a license. See LICENSE.
// Tick step: promotion and reach for this tenant, through the Ultrastable core/promote engine. IndexNow and the feeds need no
// credential. A social channel posts as soon as its account secret exists; until then it is skipped and recorded.
import { postsFor } from './voice.js';
import { run, tune, snapshot, evaluate, indexnowKey } from '../vendor/ultrastable/core/promote/index.js';
export const TENANT = 'practical-solutions';
// Explicit reach targets (hypotheses until measured): at least 70 views a week; alert when below.
export const TARGETS = { views: { min: 70, windowDays: 7 } };

// Domains, then problems, then solutions, in a human voice (ps/voice.js). The automated-post disclosure stays on every post.
export const entriesFrom = (solutions, origin) => postsFor(solutions, origin);

export function promoteStep({ solutions, fetch: f, env, origin }) {
  return {
    name: 'ps_promote',
    async run(db, ctx) {
      const config = { promote: { tenant: TENANT, origin, automatedLabel: 'Posted by Ultrastable, source-checked',
        halt: false, channels: { indexnow: { perDay: 1 }, mastodon: { base: env.MASTODON_BASE || 'https://mastodon.social', perDay: 2 }, bluesky: { perDay: 2 } } } };
      const pctx = { db, fetch: f, env, now: () => ctx.now ?? Date.now(), config };
      const sent = await run(pctx, entriesFrom(solutions, origin));
      let alerts = [];
      try {
        const m = await (await f(origin + '/metrics.json')).json();
        const today = (m.daily || [])[0];
        if (today) await snapshot(pctx, { views: today.views }, today.day);
        alerts = await evaluate(pctx, TARGETS);
      } catch { /* metrics unreachable this tick: recorded as no snapshot, never as zero */ }
      await tune(pctx);
      return { sent: sent.sent.length, skipped: sent.skipped.length, failed: sent.failed.length, alerts };
    },
  };
}
export { indexnowKey };
