// SPDX-License-Identifier: LicenseRef-Ultrastable-USL-1.0
// Copyright (c) 2026 Rowan Brad Quni-Gudzinas. Non-commercial use free; commercial use requires a license. See LICENSE.
// Tick step: promotion and reach for this tenant, through the Ultrastable core/promote engine. IndexNow and the feeds need no
// credential. A social channel posts as soon as its account secret exists; until then it is skipped and recorded.
import { run, tune, snapshot, evaluate, indexnowKey } from '../vendor/ultrastable/core/promote/index.js';
export const TENANT = 'practical-solutions';
// Explicit reach targets (hypotheses until measured): at least 70 views a week; alert when below.
export const TARGETS = { views: { min: 70, windowDays: 7 } };

export const entriesFrom = (solutions, origin) => solutions.map(s => ({ id: s.id, title: s.title, url: `${origin}/solutions/${s.id}`, summary: s.claim, label: s.label, tags: s.domains || [] }));

export function promoteStep({ solutions, fetch: f, env, origin }) {
  return {
    name: 'ps_promote',
    async run(db, ctx) {
      const config = { promote: { tenant: TENANT, origin, automatedLabel: 'Automated post from Practical Solutions',
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
