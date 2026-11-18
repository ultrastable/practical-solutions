// SPDX-License-Identifier: LicenseRef-Ultrastable-USL-1.0
// Copyright (c) 2026 Rowan Brad Quni-Gudzinas. Non-commercial use free; commercial use requires a license. See LICENSE.
// Bright-spot issue lifecycle (ISSUE-LOOP-1). Each published brief gets one public issue as its record. The issue never waits open:
// the wait is the brief's prediction, held in ps_predictions and scored by the cycle loop, so the issue is closed at once with that
// disposition (owner, trigger, probe) and the loop comments the verdict on it when the prediction is scored. Pure planner; the gh
// calls are in bin/issues.mjs.
export const LABEL = 'bright-spot';
export const AWAITING = 'awaiting-verdict';
export const verdictLabel = v => `verdict-${v}`;
export const titleFor = file => `Bright spot: ${String(file).replace(/\.md$/, '')}`;

export function disposition(pred) {
  if (!pred) return 'Disposition: no prediction is registered for this brief; the criticality step counts it as unpredicted and the cycle loop registers one. Closed as a record; nothing waits on this issue.';
  return `Disposition: backlogged with owner \`cycle\` (.github/workflows/cycle.yml), trigger: prediction \`${pred.id}\` comes due ${pred.due_at} UTC and is scored on the first data refresh after that, probe: \`ps_predictions.verdict\` for that id in ledger/ps.sqlite. Closed as a record; nothing waits on this issue. The cycle loop comments the verdict here and labels it \`${verdictLabel('hit')}\` or \`${verdictLabel('miss')}\`.`;
}

export function verdictText(pred) {
  const obs = pred.observed == null ? 'n/a' : Number(pred.observed).toFixed(3);
  return `Verdict: prediction \`${pred.id}\` scored ${pred.scored_at} UTC: observed ${pred.metric} ${obs} against ${pred.op} ${pred.target}, **${pred.verdict}**. Recorded in ledger/ps.sqlite whether it held or not.`;
}

// briefs: ledger/briefs/index.json rows; preds: ps_predictions rows; issues: [{number, title, state, labels: [name]}].
export function planIssues(briefs, preds, issues) {
  const byBrief = new Map(preds.map(p => [p.brief_id, p]));
  const byTitle = new Map(issues.map(i => [i.title, i]));
  const actions = [];
  for (const b of briefs) {
    const title = titleFor(b.file), pred = byBrief.get(b.id), issue = byTitle.get(title);
    const labels = new Set((issue?.labels || []).map(l => (typeof l === 'string' ? l : l.name)));
    if (!issue) {
      actions.push({ op: 'create', title, file: b.file, comment: disposition(pred), add: [pred?.verdict ? verdictLabel(pred.verdict) : AWAITING] });
      if (pred?.verdict) actions.push({ op: 'settle', title, comment: verdictText(pred), add: [verdictLabel(pred.verdict)], remove: [AWAITING] });
      continue;
    }
    const open = String(issue.state).toUpperCase() === 'OPEN';
    if (pred?.verdict) {
      if (!labels.has(verdictLabel(pred.verdict))) actions.push({ op: 'settle', number: issue.number, title, comment: verdictText(pred), add: [verdictLabel(pred.verdict)], remove: [AWAITING], close: open });
      else if (open) actions.push({ op: 'close', number: issue.number, title, comment: null });
    } else if (open) {
      actions.push({ op: 'close', number: issue.number, title, comment: disposition(pred), add: [AWAITING] });
    }
  }
  return actions;
}
