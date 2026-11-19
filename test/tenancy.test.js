import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const T = JSON.parse(readFileSync(new URL('../tenancy.json', import.meta.url), 'utf8'));

test('every tenant resource carries the tenant prefix and none carries a core prefix', () => {
  const prefix = `tenant-${T.tenant}-`;
  for (const [k, v] of Object.entries(T.resources)) {
    assert.ok(v.startsWith(prefix), `${k} = ${v}`);
    for (const f of T.forbidden_prefixes) assert.ok(!v.startsWith(f), `${k} uses core prefix ${f}`);
  }
});

test('the Worker template binds only tenant-owned resources and no service bindings', () => {
  const tpl = readFileSync(new URL('../worker/wrangler.template.jsonc', import.meta.url), 'utf8');
  assert.ok(!/services/.test(tpl), 'no service bindings to core');
  assert.ok(!/kv_namespaces|r2_buckets/.test(tpl), 'no KV or R2 bindings to shared stores');
  for (const f of T.forbidden_prefixes) assert.ok(!tpl.includes(f), `template names ${f}`);
});
