import test from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../ps/db.js';
import { seedOrg } from '../ps/seed.js';
import { ledgerExport } from '../ps/ledger.js';

test('ledger export lists every table, omits dataset payloads, and carries the seeded items', async () => {
  const db = openDb(':memory:');
  await seedOrg(db, { problems: [{ id: 'p', title: 'P', enabled: true }], now: Date.UTC(2026, 11, 1) });
  const l = await ledgerExport(db);
  assert.equal(l.schema, 'ps-ledger/1');
  assert.ok(l.tables.items.some(i => i.id === 'ps:cycle:p:0'));
  assert.ok(!JSON.stringify(l.tables.ps_datasets).includes('"payload"'));
});
