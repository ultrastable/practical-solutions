// SPDX-License-Identifier: LicenseRef-Ultrastable-USL-1.0
// Copyright (c) 2026 Rowan Brad Quni-Gudzinas. Non-commercial use free; commercial use requires a license. See LICENSE.
// The probe behind the /method audit statement: the real core/audit on the real migration, an attack on the log, and the size after a roll.
import { fileURLToPath } from 'node:url';
import { makeDb } from '../vendor/ultrastable/core/_shared/testdb.js';
import { createAudit } from '../vendor/ultrastable/core/audit/index.js';
const MIG = fileURLToPath(new URL('../vendor/ultrastable/core/audit/migrations/', import.meta.url));
export async function auditProbe(must) {
  let t = Date.parse('2026-11-01T00:00:00Z'); const db = makeDb([MIG]), a = createAudit({ db, now: () => t, config: { tenant: 'probe' } });
  for (let d = 0; d < 5; d++) for (let i = 0; i < 6; i++) { t = Date.parse('2026-11-01T00:00:00Z') + d * 86400e3 + i * 1000; await a.append({ actor: 'probe', kind: 'deploy', summary: 'secret@example.org d' + d, payload: { d, i, secret: 'zzz-payload' } }); }
  must((await a.verify()).ok, 'a clean log did not verify');
  const raw = JSON.stringify((await db.prepare('SELECT * FROM audit_events').all()).results); must(!raw.includes('zzz-payload') && !raw.includes('secret@example.org'), 'the payload or an address was stored');
  t = Date.parse('2026-11-06T00:00:00Z'); const r = await a.roll(); must(r.rolled.length >= 3, 'finished days were not rolled');
  const rows = (await db.prepare('SELECT (SELECT COUNT(*) FROM audit_events) + (SELECT COUNT(*) FROM audit_days) AS c').first()).c; must(rows < 30, 'rows did not shrink after the roll: ' + rows);
  must((await a.verify()).ok, 'the rolled log did not verify');
  db.raw.exec(`UPDATE audit_events SET summary='edited' WHERE seq=${(await a.head()).seq}`); must(!(await a.verify()).ok, 'an edited event was not detected');
}
