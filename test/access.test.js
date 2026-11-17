// SPDX-License-Identifier: LicenseRef-Ultrastable-USL-1.0
// Copyright (c) 2026 Rowan Brad Quni-Gudzinas. Non-commercial use free; commercial use requires a license. See LICENSE.
// The owner-ask guard holds in this tenant's own deployed schema, and the tenant's access config is coherent.
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { makeDb } from '../vendor/ultrastable/core/_shared/testdb.js';
import { CAPABILITIES, askOwner } from '../vendor/ultrastable/core/access/index.js';
import access from '../ps/access.mjs';
import { buildConfig } from '../ps/config.js';

const MIGS = fileURLToPath(new URL('../worker/migrations/', import.meta.url));
const mkDb = () => makeDb([MIGS]);   // seed + the deployed migration set; the seed part is applied twice, which is idempotent
const ACCT = access.needs.find(n => n.capability === 'cloudflare.account_access').subject;
const T0 = Date.parse('2026-11-17T12:00:00Z');

test('the tenant config names only capabilities that exist and is wired into the tick config', () => {
  for (const n of access.needs) assert.ok(CAPABILITIES[n.capability], n.capability);
  for (const p of access.ask_phrases) { new RegExp(p.pattern, 'i'); assert.ok(access.needs.some(n => n.capability === p.capability && n.subject === p.subject), 'a phrase maps to a probed need'); }
  assert.equal(buildConfig().access, access);
});

test('in the deployed schema a card asking the owner for access that exists is closed by the database, not filed', async () => {
  const db = mkDb();
  db.raw.prepare('INSERT INTO gate_cards (id, what, why_gated, default_in_effect, closing_probe) VALUES (?,?,?,?,?)').run('c1', 'Install the Cloudflare Workers & Pages app on QNFO', 'deploys need it', 'manual deploys', 'manual');
  assert.equal(db.raw.prepare("SELECT status FROM gate_cards WHERE id='c1'").get().status, 'closed');
  assert.equal(db.raw.prepare('SELECT COUNT(*) AS n FROM access_blocked_asks').get().n, 1);
});

test('askOwner for a granted Cloudflare account files nothing; a proven-missing one with no one-click flow becomes a staff item', async () => {
  const db = mkDb();
  const world = list => async () => ({ status: 200, json: async () => ({ result: list }) });
  const base = { db, now: () => T0, env: { CLOUDFLARE_API_TOKEN: 'x' }, config: access };
  const ask = { id: 'ask', what: 'grant access to the account', why_gated: 'deploys', default_in_effect: 'manual deploys', closing_probe: 'manual', capability: 'cloudflare.account_access', subject: ACCT };
  const granted = await askOwner({ ...base, fetch: world([{ id: ACCT, name: 'ultrastable' }]) }, ask);
  assert.equal(granted.asked, false); assert.equal(granted.reason, 'already_granted');
  assert.equal(db.raw.prepare('SELECT COUNT(*) AS n FROM gate_cards').get().n, 0);
  // OWNERLINK-1: a proven-missing account still reaches the owner only with a one-click flow; there is none for a Cloudflare account,
  // so the ask is refused and becomes a staff item that builds the flow or acquires the access by code.
  const missing = await askOwner({ ...base, fetch: world([]) }, { ...ask, id: 'ask2' });
  assert.equal(missing.asked, false); assert.equal(missing.reason, 'no_owner_link');
  assert.equal(db.raw.prepare("SELECT COUNT(*) AS n FROM gate_cards").get().n, 0);
  assert.equal(db.raw.prepare("SELECT status FROM items WHERE id='OWNERLINK-ask2'").get().status, 'blocked');
});
