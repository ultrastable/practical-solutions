// SPDX-License-Identifier: LicenseRef-Ultrastable-USL-1.0
// Copyright (c) 2026 Rowan Brad Quni-Gudzinas. Non-commercial use free; commercial use requires a license. See LICENSE.
// Export of the instance's own state as plain JSON, so a rebuilt deployment can be compared to the record and the repo
// holds the history. Dataset payloads are omitted (large); their hashes stay.
const TABLES = ['ps_problems', 'ps_datasets', 'ps_briefs', 'ps_predictions', 'ps_decisions', 'ps_audits', 'ps_model_calls', 'ps_trust_history', 'ps_criticality', 'items', 'tick_runs'];

export async function ledgerExport(db, { limit = 500 } = {}) {
  const out = { schema: 'ps-ledger/1', tables: {} };
  for (const t of TABLES) {
    const rows = (await db.prepare(`SELECT * FROM ${t} ORDER BY rowid DESC LIMIT ?`).bind(limit).all()).results || [];
    out.tables[t] = rows.map(r => { const { payload, ...rest } = r; return t === 'ps_datasets' ? rest : r; }).reverse();
  }
  return out;
}
