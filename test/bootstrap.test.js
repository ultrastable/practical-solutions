import test from 'node:test';
import assert from 'node:assert/strict';
import { guard, tickToken } from '../tools/bootstrap.mjs';

test('bootstrap refuses missing secrets and any account outside the allow-list', () => {
  assert.throws(() => guard({}), /missing secrets/);
  assert.throws(() => guard({ CLOUDFLARE_API_TOKEN: 'x', CLOUDFLARE_ACCOUNT_ID: '0'.repeat(32) }), /allow-list/);
  assert.doesNotThrow(() => guard({ CLOUDFLARE_API_TOKEN: 'x', CLOUDFLARE_ACCOUNT_ID: '81e3a4efb4eb66e613529b87682911bb' }));
});
test('the tick token is derived, stable, and differs per secret', () => {
  assert.equal(tickToken({ CLOUDFLARE_API_TOKEN: 'a' }), tickToken({ CLOUDFLARE_API_TOKEN: 'a' }));
  assert.notEqual(tickToken({ CLOUDFLARE_API_TOKEN: 'a' }), tickToken({ CLOUDFLARE_API_TOKEN: 'b' }));
});
