// SPDX-License-Identifier: LicenseRef-Ultrastable-USL-1.0
// Copyright (c) 2026 Rowan Brad Quni-Gudzinas. Non-commercial use free; commercial use requires a license. See LICENSE.
// FEATURE-GAP-1: gap analysis as code. Reads org/capabilities.json (what best-in-class references offer), probes each capability against a
// fetcher (the site's own router in tests, the live site in the weekly job) and returns what is shipped and what is a gap, ranked.
// A capability with a passing probe is shipped; a probe that fails or is absent is a gap. Status is computed, never typed.
export async function scan(registry, fetchFn) {
  const out = [];
  for (const c of registry.capabilities) {
    let shipped = false, detail = 'no probe: not built';
    if (c.probe) {
      try { const r = await fetchFn(c.probe.path); const body = r ? await r.text() : ''; shipped = !!r && r.status === (c.probe.status || 200) && (!c.probe.text || body.includes(c.probe.text)); detail = r ? `status ${r.status}` : 'no response'; }
      catch (e) { detail = 'probe error: ' + e.message; }
    }
    out.push({ id: c.id, reference: c.reference, feature: c.feature, priority: c.priority || 2, shipped, deferred: shipped ? null : (c.deferred || null), detail });
  }
  const gaps = out.filter(x => !x.shipped && !x.deferred).sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id));
  return { total: out.length, shipped: out.filter(x => x.shipped).length, deferred: out.filter(x => x.deferred).map(x => ({ id: x.id, reason: x.deferred })), coverage: out.length ? out.filter(x => x.shipped).length / out.length : 0, gaps, capabilities: out };
}
export const issueTitle = g => `Feature gap: ${g.feature}`;
export const issueBody = g => `Gap found by the weekly gap analysis (FEATURE-GAP-1, \`ps/gapscan.js\`).\n\nReference: ${g.reference}\nCapability: ${g.feature} (\`${g.id}\`)\nProbe: ${g.detail}\n\nDone when the probe for \`${g.id}\` in \`org/capabilities.json\` exists and passes in \`npm test\`; add a story to \`ux/stories.js\` for any user-facing page. Closing probe: \`node tools/gapscan.mjs\` lists \`${g.id}\` as shipped.\nPrediction: capability_coverage > current within 72 h.\nDisposition: owner \`agent\` (.github/workflows/agent.yml), trigger: label \`idea\`.`;
// Plan at most `max` new issues, never duplicating one whose title already exists (open or closed).
export function planIssues(gaps, existingTitles, max = 2) {
  const have = new Set(existingTitles);
  return gaps.filter(g => !have.has(issueTitle(g))).slice(0, max).map(g => ({ id: g.id, title: issueTitle(g), body: issueBody(g), labels: ['idea', 'gap'] }));
}
