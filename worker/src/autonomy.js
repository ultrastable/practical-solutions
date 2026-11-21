// SPDX-License-Identifier: LicenseRef-Ultrastable-USL-1.0
// Copyright (c) 2026 Rowan Brad Quni-Gudzinas. Non-commercial use free; commercial use requires a license. See LICENSE.
// AUTONOMY-1: the public, checkable record of what this system did on its own. Every number is read from the loop's recorded changes, the
// release ledger and the catalogue; nothing is typed here. The page states what it does not show, so a sceptic can use it and a booster cannot overclaim.
import * as ui from './kit/index.js';
import { RELEASES } from './releases.gen.js';
const { esc } = ui;
const iso = t => (Number.isFinite(t) ? new Date(t).toISOString().slice(0, 10) : null);

export function autonomyData(c, now = Date.now(), releases = RELEASES) {
  const ts = c.changes.map(x => Date.parse(x.at)).filter(Number.isFinite).sort((a, b) => a - b);
  const kinds = {};
  for (const x of c.changes) kinds[x.kind] = (kinds[x.kind] || 0) + 1;
  const rel = releases.releases || [];
  return {
    as_of: new Date(now).toISOString(),
    recorded_changes: c.changes.length, first_change: iso(ts[0]), last_change: iso(ts.at(-1)),
    changes_by_kind: kinds, releases: rel.length,
    catalogue: { problems: c.probs.length, solutions: c.sols.length, domains: c.domains.length },
    not_shown: [
      'This is one system doing one narrow job (compiling and re-checking public evidence). It says nothing about AI systems in general.',
      'Autonomy here is bounded: the loop can edit its catalogue but cannot change its own rules, caps or checks; those change only through reviewed pull requests.',
      'A longer record of good behaviour is evidence, not a guarantee. Corrections are welcome and are published.',
    ],
  };
}

export function autonomyPage(c, o, page, now = Date.now()) {
  const d = autonomyData(c, now);
  const body = `${ui.breadcrumbs([{ label: 'Home', href: '/' }, { label: 'Autonomy record' }])}<h1>Autonomy record</h1>
<p class="lede">A claim worth testing: a system left to run its own loop, inside fixed limits, can do useful public work. Here is what this one has actually done, counted from its own records. <a href="/autonomy.json">JSON</a> · <a href="/changes">every change</a> · <a href="/releases">releases</a></p>
${ui.list([`${d.recorded_changes} change(s) recorded by the loop${d.first_change ? `, ${esc(d.first_change)} to ${esc(d.last_change)}` : ''}`, `${d.releases} dated release(s)`, `${d.catalogue.problems} problems, ${d.catalogue.solutions} solutions, ${d.catalogue.domains} domains in the catalogue`, ...Object.entries(d.changes_by_kind).map(([k, n]) => `${n} ${esc(k.replace(/_/g, ' '))}`)])}
${ui.callout({ tone: 'warn', title: 'What this does not show', body: `<ul>${d.not_shown.map(s => `<li>${esc(s)}</li>`).join('')}</ul>` })}
<p>Think this proves too little or too much? <a href="/about">Tell us what to check</a>.</p>`;
  return page('/autonomy', o, 'Autonomy record', 'What a self-running, bounded evidence loop has done, counted from its own records, and what that does not prove.', body);
}
