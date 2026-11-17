// SPDX-License-Identifier: LicenseRef-Ultrastable-USL-1.0
// Copyright (c) 2026 Rowan Brad Quni-Gudzinas. Non-commercial use free; commercial use requires a license. See LICENSE.
// Instance configuration. Secrets appear only as binding names. The model ladder follows the monthly budget.
import access from './access.mjs';
import policy from '../vendor/ultrastable/autonomy/policy.json' with { type: 'json' };

const surface = (max, start) => ({ max_permission: max, start_rung: start });
export function buildConfig(over = {}) {
  return {
    org_slug: 'practical-solutions', claim_ttl_minutes: 120, max_wip_per_role: 3, plus_share: 0.2,
    policy: {
      trust: policy.trust, ladder: policy.ladder,
      surfaces: {
        ...policy.surfaces,
        ps_detect: surface('execute', 'assisted'), ps_verify: surface('execute', 'assisted'), ps_audit: surface('execute', 'assisted'),
        ps_calibrate: surface('propose', 'observed'), ps_publish: surface('propose', 'observed'), ps_brief: surface('propose', 'observed'),
      },
    },
    ps: { max_per_tick: 8, perms: 500, criticality: {} },
    access, // core/access: the preflight that every ask of the owner must pass; see ps/access.mjs
    ...over,
  };
}
