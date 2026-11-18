// SPDX-License-Identifier: LicenseRef-Ultrastable-USL-1.0
// Copyright (c) 2026 Rowan Brad Quni-Gudzinas. Non-commercial use free; commercial use requires a license. See LICENSE.
// AUDIT-ANCHOR-1: publishes the audit chain head outside the database. Each run reads the public head and verification result, checks that the
// previous anchor is still the chain's own history (same hash at that seq), and appends one line to ledger/audit-anchors.jsonl in git. A
// rewritten chain can no longer match a head git already holds. Exit 1 on a mismatch or a failed verify, so the workflow turns red.
import { readFileSync, appendFileSync, existsSync } from 'node:fs';
export const BASE = process.env.AUDIT_URL || 'https://tenant-ps-web.ultrastable.workers.dev';
export const LEDGER = 'ledger/audit-anchors.jsonl';
export const lastAnchor = (text) => { const l = String(text || '').trim().split('\n').filter(Boolean); return l.length ? JSON.parse(l[l.length - 1]) : null; };
export async function anchor({ fetchImpl = fetch, ledgerText = '', now = () => new Date().toISOString() } = {}) {
  const j = async p => { const r = await fetchImpl(BASE + p); if (!r.ok) throw new Error(p + ' answered ' + r.status); return r.json(); };
  const sum = await j('/audit/summary.json'), ver = await j('/audit/verify'), head = sum.head, prev = lastAnchor(ledgerText), problems = [];
  if (!ver.ok) problems.push('chain verification failed: ' + JSON.stringify(ver.problems || []).slice(0, 200));
  if (prev) {
    if (head.seq < prev.seq) problems.push(`head moved back from ${prev.seq} to ${head.seq}`);
    else if (head.seq === prev.seq && head.hash !== prev.hash) problems.push(`hash at seq ${prev.seq} changed`);
    else if (head.seq > prev.seq) { const p = await j('/audit/proof?seq=' + prev.seq); if (p.hash && p.hash !== prev.hash) problems.push(`hash at seq ${prev.seq} changed`); }
  }
  return { entry: { at: now(), tenant: sum.tenant, seq: head.seq, hash: head.hash, verified: !!ver.ok, days: ver.days, hot_events: ver.hot_events }, problems, unchanged: !!prev && prev.seq === head.seq && prev.hash === head.hash };
}
if (import.meta.url === `file://${process.argv[1]}`) {
  const text = existsSync(LEDGER) ? readFileSync(LEDGER, 'utf8') : '';
  const r = await anchor({ ledgerText: text });
  if (r.problems.length) { console.log('::error::audit anchor mismatch: ' + r.problems.join('; ')); process.exit(1); }
  if (!r.unchanged) appendFileSync(LEDGER, JSON.stringify(r.entry) + '\n');
  console.log(r.unchanged ? 'head unchanged' : 'anchored ' + JSON.stringify(r.entry));
}
