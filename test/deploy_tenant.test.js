import test from 'node:test';
import assert from 'node:assert/strict';
import { deployTenant, guard, metadata, HOST_ACCOUNT } from '../tools/deploy_tenant.mjs';

const env = { CLOUDFLARE_API_TOKEN: 't', CLOUDFLARE_ACCOUNT_ID: HOST_ACCOUNT };
const code = Buffer.from('export default {};');
const res = (ok, body, status = ok ? 200 : 403) => ({ ok, status, json: async () => body, arrayBuffer: async () => Buffer.from(String(body)) });

test('metadata keeps bindings and the guard refuses missing secrets and any other account', () => {
  assert.ok(metadata().keep_bindings.includes('kv_namespace'));
  assert.throws(() => guard({}), /missing secrets/);
  assert.throws(() => guard({ ...env, CLOUDFLARE_ACCOUNT_ID: 'other' }), /not the tenant host/);
  assert.doesNotThrow(() => guard(env));
});

test('an unapproved account never reaches the network', async () => {
  let calls = 0;
  await assert.rejects(deployTenant({ code, env: { ...env, CLOUDFLARE_ACCOUNT_ID: 'other' }, fetchFn: async () => { calls++; } }), /refusing/);
  assert.equal(calls, 0);
});

test('success needs a good upload and a read-back containing the built bytes; each failure throws', async () => {
  const ok = async (url, o) => o && o.method === 'PUT' ? res(true, { success: true }) : res(true, 'x' + code + 'y');
  assert.equal((await deployTenant({ code, env, fetchFn: ok })).deployed, true);
  await assert.rejects(deployTenant({ code, env, fetchFn: async () => res(false, { success: false, errors: ['no'] }) }), /deploy failed/);
  await assert.rejects(deployTenant({ code, env, fetchFn: async (u, o) => o && o.method === 'PUT' ? res(true, { success: true }) : res(false, 'denied') }), /read-back failed/);
  await assert.rejects(deployTenant({ code, env, fetchFn: async (u, o) => o && o.method === 'PUT' ? res(true, { success: true }) : res(true, 'other bytes') }), /does not contain/);
});
