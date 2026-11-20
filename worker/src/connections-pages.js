// SPDX-License-Identifier: LicenseRef-Ultrastable-USL-1.0
// Copyright (c) 2026 Rowan Brad Quni-Gudzinas. Non-commercial use free; commercial use requires a license. See LICENSE.
// CONNECT-1: /connections, the leads the connection engine (vendor core/connect) found in the catalogue: connections between problems and
// solutions that mean nearly the same but that nobody has linked. Leads, not findings: each one only seeds the discovery loop, whose
// proposals still have to pass a red team and a source check before anything appears under /syntheses.
import * as ui from './kit/index.js';
import { CONNECTIONS as D } from './connections.gen.js';

const { esc } = ui;
export const KIND = {
  transfer: { name: 'Transfer', note: 'A solution proven against one problem, and a second problem that means nearly the same, which nobody has linked it to.' },
  bridge: { name: 'Bridge', note: 'Two solutions from different domains that work in a similar way: what does one lend the other?' },
  closure: { name: 'Closure', note: 'Two solutions share a problem; one also addresses a second problem the other has not been tried on (the Swanson A-B-C pattern).' },
};
const pct = x => Math.round(100 * x) + '%';
const link = n => (n.url ? `<a href="${esc(n.url)}">${esc(n.label)}</a>` : esc(n.label));
const prior = c => !c.prior_work ? 'not searched' : c.prior_work.error ? 'search unavailable' : c.prior_work.total === null ? 'unknown' : `${Number(c.prior_work.total).toLocaleString('en')} works`;

export function indexJson(o, d = D) {
  return { schema: d.schema, at: d.at, status: 'leads for the discovery loop, not findings', embedding_route: d.route, stats: d.stats, calibration: d.calibration,
    connections: d.candidates.map(c => ({ ...c, kind_name: (KIND[c.kind] || {}).name || c.kind })), handed_to_discovery: d.handed, url: o + '/connections' };
}

export function connectionsPage(o, page, d = D) {
  const st = d.stats || {}, model = !String(d.route || '').startsWith('lexical');
  const rows = d.candidates.map((c, i) => [String(i + 1), esc((KIND[c.kind] || {}).name || c.kind) + (c.found_by.length > 1 ? ' <span class="m">(corroborated)</span>' : ''),
    `${link(c.a)} <span class="m">${esc(c.a.domain)}</span> &rarr; ${link(c.b)} <span class="m">${esc(c.b.domain)}</span>${c.via.length ? `<br><span class="m">via ${c.via.map(link).join(', ')}</span>` : ''}`,
    `${c.score}`, pct(c.relevance), pct(c.novelty), esc(prior(c))]);
  const handed = (d.handed || []).map(h => `${esc(h.id)}: ${h.outcome === 'accepted' ? `a proposal survived review${h.synthesis ? ` (${esc(h.synthesis)})` : ''}` : h.outcome === 'rejected' ? 'no proposal survived review' : 'waiting'}`);
  const body = `${ui.breadcrumbs([{ label: 'Home', href: '/' }, { label: 'Connections' }])}<h1>Connections nobody has made</h1>
<p class="lede">The catalogue as a knowledge graph and a vector space. The graph records which solution is known to address which problem. The vectors record what each problem and solution means. A lead is a place where the two disagree: close in meaning, far apart in the graph.</p>
<p>${ui.badge('Leads, not findings', 'warn')} <span class="m">Last run ${esc(String(d.at).slice(0, 10))} · ${esc(st.items)} problems and solutions · ${esc(st.links)} known links · ${esc(st.scored)} connections scored · embedding route ${esc(d.route)}</span></p>
${model ? '' : '<p><b>This run used the word-overlap route because no model route answered, so these leads reflect shared words more than shared meaning. They are not used to seed the discovery loop.</b></p>'}
${ui.section({ id: 'leads', title: 'The best unexplored leads', body: rows.length ? ui.table({ caption: 'Ranked by relevance x novelty x strength of evidence; at most two leads per item', head: ['#', 'Kind', 'Connection', 'Score', 'Relevance', 'Novelty', 'Prior work (OpenAlex)'], rows }) : '<p>No lead passed the cutoff in the last run.</p>' })}
${ui.section({ id: 'kinds', title: 'How leads are found', body: ui.list(Object.values(KIND).map(k => `<b>${esc(k.name)}.</b> ${esc(k.note)}`)) + `<p>A pair counts as related only when it is more similar than ${esc(st.cutoff ? st.cutoff.transfer : '?')} (transfer) or ${esc(st.cutoff ? st.cutoff.bridge : '?')} (bridge). These cutoffs are not fixed in advance: each is set from the run's own background, the similarity of unrelated pairs plus a margin. A target that means almost exactly what an already-solved problem means is treated as a restatement of it and ranked down. A pair found both by meaning and by graph structure is marked corroborated. The prior-work count is how many published works mention the key words of both ends; a low count suggests a gap but does not prove one.</p>` })}
${ui.section({ id: 'loop', title: 'What happens to a lead', body: `<p>The discovery loop takes the best lead nobody has handed on yet. A model drafts a concrete proposal from it using only real, registered papers, and a second model attacks the proposal. Every citation is then checked against Crossref and every quoted figure against the paper's abstract. Only what survives appears under <a href="/syntheses">New solutions</a>. Whether a lead survived is fed back to the engine, which gives more weight to the kinds of lead that survive (current weights: ${Object.entries((d.calibration || {}).kindWeight || {}).map(([k, v]) => `${esc(k)} ${esc(v)}`).join(', ')}).</p>${handed.length ? ui.list(handed) : '<p>No lead has been handed on yet.</p>'}` })}
<p class="m">Machine-readable: <a href="/connections.json">JSON</a>. The engine is the Ultrastable core module core/connect.</p>`;
  return page('/connections', o, 'Connections nobody has made', 'Leads where a proven solution and a problem mean nearly the same but nobody has linked them, found by a knowledge graph and a vector space.', body);
}
