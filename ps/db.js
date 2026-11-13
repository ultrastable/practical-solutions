// SPDX-License-Identifier: LicenseRef-Ultrastable-USL-1.0
// Copyright (c) 2026 Rowan Brad Quni-Gudzinas. Non-commercial use free; commercial use requires a license. See LICENSE.
// Database: the vendored Ultrastable migrations, then this repository's own, applied in order and idempotently.
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = p => fileURLToPath(new URL(p, import.meta.url));
export const MIGRATION_DIRS = [here('../vendor/ultrastable/adapters/cloudflare/migrations'), here('./migrations')];

export function openDb(file = ':memory:', dirs = MIGRATION_DIRS) {
  const raw = new DatabaseSync(file);
  raw.exec('PRAGMA journal_mode=DELETE; PRAGMA busy_timeout=5000;');
  for (const d of dirs) for (const f of readdirSync(d).filter(n => n.endsWith('.sql')).sort()) raw.exec(readFileSync(path.join(d, f), 'utf8'));
  return {
    raw,
    prepare(sql) {
      const st = raw.prepare(sql);
      let args = [];
      const o = {
        bind(...a) { args = a; return o; },
        async all() { return { results: st.all(...args).map(r => ({ ...r })) }; },
        async first() { const r = st.get(...args); return r ? { ...r } : null; },
        async run() { const r = st.run(...args); return { meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } }; },
      };
      return o;
    },
    close() { raw.close(); },
  };
}
