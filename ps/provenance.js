// SPDX-License-Identifier: LicenseRef-Ultrastable-USL-1.0
// Copyright (c) 2026 Rowan Brad Quni-Gudzinas. Non-commercial use free; commercial use requires a license. See LICENSE.
// PROVENANCE-1 for the Practical Solutions tenant: the same row shape as ultrastable/doctrine/provenance.json, kept in the tenant's KV (`provenance`).
// Where each input came from (system, loop, owner, end_user, agent, external), what it touched, and what it did. Public view: public rows only, redacted.
const CLASSES = ['system', 'loop', 'owner', 'end_user', 'agent', 'external'];
const CHANNELS = ['commit', 'pr', 'issue', 'command', 'thread', 'form', 'api', 'loop-run', 'deploy', 'migration', 'scout'];
const KINDS = ['change', 'input', 'decision', 'deploy', 'suggestion', 'incident', 'settlement'];
const EFFECTS = ['pending', 'kept', 'reverted', 'none'];
const TENANT = 'practical-solutions', CAP = 500, PER_HOUR = 20;
const RED = [[/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, '[removed]'], [/\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-[A-Za-z0-9_-]{16,}|AKIA[0-9A-Z]{12,}|[A-Fa-f0-9]{32,})\b/g, '[removed]'],
  [/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, '[removed]'], [/(?<!\w)\+?\d[\d\s().-]{8,}\d(?!\w)/g, '[removed]'], [/(https?:\/\/[^\s?#]+)\?[^\s#]*/g, '$1']];
export const redact = t => { let o = String(t == null ? '' : t); for (const [rx, to] of RED) o = o.replace(rx, to); return o.replace(/\s+/g, ' ').trim(); };
const load = async store => { const v = await store.get('provenance'); try { return v ? JSON.parse(v) : []; } catch { return []; } };
async function sha(s) { const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)); return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join(''); }

export async function add(store, o, now = Date.now()) {
  if (!CLASSES.includes(o.class)) throw new Error('origin class must be one of ' + CLASSES.join(', '));
  if (!CHANNELS.includes(o.channel)) throw new Error('channel must be one of ' + CHANNELS.join(', '));
  if (!KINDS.includes(o.kind)) throw new Error('kind must be one of ' + KINDS.join(', '));
  const effect = o.effect || 'pending'; if (!EFFECTS.includes(effect)) throw new Error('effect must be one of ' + EFFECTS.join(', '));
  const actor = redact(o.actor).slice(0, 60), summary = redact(o.summary).slice(0, 500);
  if (!actor || !summary) throw new Error('actor and summary are required');
  const row = { at: new Date(o.at || now).toISOString(), tenant: TENANT, origin: { class: o.class, actor, channel: o.channel }, kind: o.kind, summary, ref: redact(o.ref).slice(0, 80),
    affected: (o.affected || []).slice(0, 8).map(a => redact(a).slice(0, 80)), effect: { status: effect, note: redact(o.note).slice(0, 200) }, public: !!o.public, parent: o.parent || '' };
  row.id = 'pv-' + (await sha(JSON.stringify([row.origin, row.kind, row.summary, row.ref, row.at]))).slice(0, 12);
  const rows = await load(store);
  if (rows.some(r => r.id === row.id)) return row;
  await store.put('provenance', JSON.stringify([row, ...rows].slice(0, CAP)));
  return row;
}

export async function suggest(store, body, now = Date.now()) {
  const rows = await load(store);
  if (rows.filter(r => r.origin.class === 'end_user' && Date.parse(r.at) > now - 3600e3).length >= PER_HOUR) return { status: 429, body: { error: 'too many suggestions this hour, try again later' } };
  const text = redact(body && body.text).slice(0, 500);
  if (text.length < 8) return { status: 400, body: { error: 'write a sentence or two' } };
  const page = String((body && body.page) || '').replace(/[^\w/.-]/g, '').slice(0, 60);
  const r = await add(store, { class: 'end_user', actor: 'ps-visitor', channel: 'form', kind: 'suggestion', summary: text, affected: page ? [page] : [], public: false }, now);
  return { status: 200, body: { ok: true, id: r.id } };
}

export async function settle(store, id, effect, note) {
  if (!['kept', 'reverted', 'none'].includes(effect)) throw new Error('effect must be kept, reverted or none');
  const rows = await load(store); const r = rows.find(x => x.id === id); if (!r) return false;
  r.effect = { status: effect, note: redact(note).slice(0, 200) }; await store.put('provenance', JSON.stringify(rows)); return true;
}

export const full = load;
export async function publicView(store) {
  const entries = (await load(store)).filter(r => r.public && r.kind !== 'settlement').map(r => ({ id: r.id, at: r.at, tenant: r.tenant, origin: r.origin.class, channel: r.origin.channel,
    actor: ['loop', 'system', 'agent'].includes(r.origin.class) ? r.origin.actor : r.origin.class, kind: r.kind, summary: redact(r.summary).slice(0, 200), affected: r.affected.map(redact), effect: r.effect.status }));
  const counts = {}; for (const e of entries) counts[e.origin] = (counts[e.origin] || 0) + 1;
  return { schema: 'ultrastable-changelog/v1', tenant: TENANT, counts_by_origin: counts, entries };
}

/** Each automatic change of the improvement tick is a row: origin loop, actor ps-improve. */
export async function recordChanges(store, changes, at) {
  for (const c of changes) await add(store, { class: 'loop', actor: 'ps-improve', channel: 'loop-run', kind: c.kind && /error/.test(c.kind) ? 'incident' : 'change',
    summary: `${String(c.kind || 'change').replace(/_/g, ' ')}${c.title ? ': ' + c.title : ''}${c.problem ? ' (' + c.problem + ')' : ''}`, affected: [c.problem, c.id].filter(Boolean), public: !/error/.test(c.kind || ''), at: Date.parse(at) || undefined });
}

const LABEL = { system: 'The system itself', loop: 'An automated loop', owner: 'The owner', end_user: 'A visitor', agent: 'A code agent', external: 'Outside signal' };
const e = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export function changelogHtml(v) {
  const days = {}; for (const x of v.entries) (days[x.at.slice(0, 10)] = days[x.at.slice(0, 10)] || []).push(x);
  const body = Object.keys(days).sort().reverse().map(d => `<h2>${e(d)}</h2><ul>${days[d].map(x => `<li><span class="t">${e(LABEL[x.origin] || x.origin)}${x.actor !== x.origin ? ' · ' + e(x.actor) : ''}</span> ${e(x.summary)} <span class="m">${e(x.effect)}</span></li>`).join('')}</ul>`).join('') || '<p class="m">Nothing recorded yet.</p>';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Changelog | Practical Solutions</title><style>body{font:16px/1.55 system-ui,sans-serif;max-width:760px;margin:0 auto;padding:24px 16px;background:#fafaf7;color:#1c1c1a}@media(prefers-color-scheme:dark){body{background:#161614;color:#ece9e1}}h2{font-size:16px;margin:24px 0 8px}ul{padding:0;list-style:none}li{padding:8px 0;border-top:1px solid #8884}.t{font-size:14px;border:1px solid #8886;border-radius:12px;padding:0 8px}.m{font-size:14px;opacity:.7}textarea{width:100%;font:inherit;padding:8px;box-sizing:border-box}button{font:inherit;min-height:44px;padding:0 16px}</style></head><body><p class="m"><a href="/">Practical Solutions</a></p><h1>What changed, and where it came from</h1><p class="m">Every change, who or what started it, and what it did. Contact details and private text are never shown.</p><p>${Object.entries(v.counts_by_origin).map(([k, n]) => `<span class="t">${e(LABEL[k] || k)} ${n}</span>`).join(' ')}</p>${body}<h2>Suggest an improvement</h2><form id="f"><label for="t" class="m">One or two sentences. Do not include contact details; none are stored.</label><textarea id="t" rows="3" maxlength="500"></textarea><p><button>Send suggestion</button> <span id="s" class="m" role="status"></span></p></form><script>document.getElementById('f').onsubmit=async function(ev){ev.preventDefault();var r=await fetch('/api/suggest',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({text:document.getElementById('t').value,page:'/changelog'})});var j=await r.json();document.getElementById('s').textContent=r.ok?'Thank you. It is recorded.':(j.error||'Could not send.');if(r.ok)document.getElementById('t').value=''}</script></body></html>`;
}
