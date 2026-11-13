// SPDX-License-Identifier: LicenseRef-Ultrastable-USL-1.0
// Copyright (c) 2026 Rowan Brad Quni-Gudzinas. Non-commercial use free; commercial use requires a license. See LICENSE.
import test from 'node:test';
import assert from 'node:assert/strict';
import { complete, routesFor } from '../ps/llm.js';
import { parseExtraction, extractPractices } from '../ps/extract.js';
import { renderBrief } from '../ps/brief.js';

const brief = { name: 'Syria', unit: 'SYR', observed: 18.4, expected: 45.7, z: 2.3, higherIsBetter: false, peers: ['NPL'], practices: [{ key: 'SH.STA.BASS.ZS', effect: 1.5 }], contextKeys: ['x'], n: 185, stability: 1, dataset: 'd', source: 'worldbank', problem: 'p', title: 'T', id: 'i' };
const ok = body => async () => ({ ok: true, status: 200, json: async () => body });

test('routes: the workflow token alone is a route; nothing bound means none', () => {
  assert.deepEqual(routesFor({}), []);
  assert.deepEqual(routesFor({ GITHUB_MODELS_TOKEN: 't' }), ['github-models']);
});
test('github-models route sends the token and returns the text', async () => {
  let seen; const f = async (u, o) => { seen = { u, o }; return ok({ choices: [{ message: { content: 'hi' } }] })(); };
  const r = await complete({ fetch: f, secrets: { GITHUB_MODELS_TOKEN: 'tok' }, prompt: 'p' });
  assert.equal(r.ok, true); assert.equal(r.route, 'github-models'); assert.match(seen.u, /models\.github\.ai/); assert.equal(seen.o.headers.authorization, 'Bearer tok');
});
test('a failing route falls through to the next, and the failure is recorded', async () => {
  const f = async () => ({ ok: false, status: 403 });
  const r = await complete({ fetch: f, secrets: { GITHUB_MODELS_TOKEN: 't', AI: { run: async () => ({ response: 'from ai' }) } }, prompt: 'p' });
  assert.equal(r.route, 'workers-ai'); assert.match(r.tried[0], /403/);
});
test('parseExtraction accepts fenced JSON, caps and marks every practice unverified, rejects other shapes', () => {
  const p = parseExtraction('```json\n{"practices":[{"name":"Community health workers","what":"w","how_to_check":"c","confidence":"high"},{"name":""}],"artefact_risks":["modelled"]}\n```');
  assert.equal(p.practices.length, 1); assert.equal(p.practices[0].verified, false); assert.equal(p.practices[0].source, 'model-knowledge');
  assert.equal(parseExtraction('no json'), null); assert.equal(parseExtraction('{"x":1}'), null);
});
test('no route is reported, not faked; a bad answer is a failed call', async () => {
  const none = await extractPractices({ fetch: null, secrets: {}, brief });
  assert.equal(none.ok, false); assert.equal(none.called, false);
  const bad = await extractPractices({ fetch: ok({ choices: [{ message: { content: 'sorry' } }] }), secrets: { GITHUB_MODELS_TOKEN: 't' }, brief });
  assert.equal(bad.ok, false); assert.equal(bad.called, true);
});
test('the brief shows extracted practices as unverified hypotheses', () => {
  const md = renderBrief(brief, null, null, { model: 'm', practices: [{ name: 'Mobile clinics', confidence: 'low', what: 'w', how_to_check: 'c' }], artefact_risks: ['conflict-era modelled estimate'] });
  assert.match(md, /unverified/); assert.match(md, /Mobile clinics/); assert.match(md, /artefacts/);
});

import { generateKeyPairSync, createSign } from 'node:crypto';
import { verifyOidc, ISSUER } from '../ps/oidc.js';
const b64 = o => Buffer.from(typeof o === 'string' ? o : JSON.stringify(o)).toString('base64url');
function mint(claims, kid = 'k1') {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const h = b64({ alg: 'RS256', kid }), p = b64(claims);
  const sig = createSign('RSA-SHA256').update(`${h}.${p}`).sign(privateKey).toString('base64url');
  return { token: `${h}.${p}.${sig}`, jwks: [{ ...publicKey.export({ format: 'jwk' }), kid }] };
}
const good = { iss: ISSUER, aud: 'practical-solutions-llm', repository: 'QNFO/practical-solutions', exp: Math.floor(Date.now() / 1000) + 300 };
test('oidc: a valid run token passes; wrong repository, audience, expiry or key fail', async () => {
  const a = mint(good); const opt = { audience: 'practical-solutions-llm', repository: 'QNFO/practical-solutions', jwks: a.jwks };
  assert.equal((await verifyOidc(a.token, opt)).ok, true);
  assert.equal((await verifyOidc(a.token, { ...opt, repository: 'x/y' })).reason, 'repository');
  assert.equal((await verifyOidc(a.token, { ...opt, audience: 'other' })).reason, 'audience');
  assert.equal((await verifyOidc(mint({ ...good, exp: 1 }).token, opt)).reason, 'expired');
  assert.equal((await verifyOidc(a.token, { ...opt, jwks: mint(good).jwks })).reason, 'signature');
  assert.equal((await verifyOidc('a.b', opt)).reason, 'malformed token');
});
test('worker-ai route: mints an OIDC token, then calls the Worker with it', async () => {
  const seen = [];
  const f = async (u, o) => { seen.push(u); return u.includes('ID_TOKEN') ? ok({ value: 'jwt' })() : ok({ text: 'answer', model: 'm' })(); };
  const r = await complete({ fetch: f, secrets: { PS_LLM_URL: 'https://w/ps/llm', ACTIONS_ID_TOKEN_REQUEST_URL: 'https://x/ID_TOKEN?a=1', ACTIONS_ID_TOKEN_REQUEST_TOKEN: 't' }, prompt: 'p' });
  assert.equal(r.route, 'worker-ai'); assert.equal(r.text, 'answer'); assert.match(seen[0], /audience=practical-solutions-llm/);
});
