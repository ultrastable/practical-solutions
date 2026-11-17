// SPDX-License-Identifier: LicenseRef-Ultrastable-USL-1.0
// Copyright (c) 2026 Rowan Brad Quni-Gudzinas. Non-commercial use free; commercial use requires a license. See LICENSE.
// AUDIT-1 for the Practical Solutions tenant: configuration only. The log, roll-up and verification are ultrastable core/audit; this file names the
// tenant, the OIDC audience that lets this repository's workflows record deploys and merges, and a recorder that never hides a failed write.
import { createAudit } from '../vendor/ultrastable/core/audit/index.js';
import { verifyOidc } from '../vendor/ultrastable/core/auth/actions-oidc.js';
export const AUDIT_TENANT = 'practical-solutions';
export const AUDIT_AUDIENCE = 'practical-solutions-audit';
export const AUDIT_REPOSITORY = 'ultrastable/practical-solutions';
export const auditFor = (db, env = {}, now = () => Date.now()) => createAudit({ db, bucket: env.AUDIT_BUCKET || null, now: typeof now === 'function' ? now : () => now, config: { tenant: AUDIT_TENANT } });
// Records one event. Returns { seq } or { error }: the caller puts an error in its tick notes, so a failed write is visible, never silent.
export async function record(db, env, event, now) { try { const r = await auditFor(db, env, now).append(event); return { seq: r.seq }; } catch (e) { return { error: String((e && e.message) || e).slice(0, 160) }; } }
// Writes and event reads: the tick token, or a GitHub Actions OIDC token minted for this repository and audience (no stored secret).
export const authorizer = (env, verify = verifyOidc) => async request => {
  const bearer = (request.headers.get('authorization') || '').replace(/^Bearer /, '');
  if (env.PS_TICK_TOKEN && bearer === env.PS_TICK_TOKEN) return true;
  return bearer ? (await verify(bearer, { audience: AUDIT_AUDIENCE, repository: AUDIT_REPOSITORY })).ok === true : false;
};
