// SPDX-License-Identifier: LicenseRef-Ultrastable-USL-1.0
// Copyright (c) 2026 Rowan Brad Quni-Gudzinas. Non-commercial use free; commercial use requires a license. See LICENSE.
// This tenant's access preflight configuration (core/access). Read by the tick (config.access) and by CI (ci.yml job `access`).
// `require: 'present'` fails CI when the capability is not present. `ask_phrases` fail CI when a file asks a person for a
// capability the probe shows present or unproven missing: text that wants an owner action must be preceded by code that proved it.
const ACCT = '81e3a4efb4eb66e613529b87682911bb'; // the ultrastable Cloudflare account; an id, not a secret
export default {
  ttl_minutes: 360,
  tokens: { github: ['GITHUB_TOKEN', 'GH_TOKEN'], cloudflare: ['CLOUDFLARE_API_TOKEN'] },
  github_sample_repos: ['ultrastable/practical-solutions'],
  needs: [
    { capability: 'github.repo_permission', subject: 'ultrastable/practical-solutions:read', require: 'present' },
    // Deploys go through the ultrastable deploy gateway with a GitHub OIDC token, no repository secret. The deploy workflow having
    // succeeded is the proof that the whole path (identity, gateway, Cloudflare account) works.
    { capability: 'github.workflow_ran_ok', subject: 'ultrastable/practical-solutions:deploy-tenant.yml', require: 'present' },
    // Only probed where a Cloudflare token exists (the Worker's tick, an operator shell); with none the answer is unknown, never missing.
    { capability: 'cloudflare.account_access', subject: ACCT },
    { capability: 'cloudflare.workers_deploy', subject: ACCT },
    { capability: 'cloudflare.git_connection', subject: `${ACCT}/ultrastable/practical-solutions` },
    { capability: 'github.app_installed', subject: 'ultrastable/cloudflare-workers-and-pages' },
  ],
  ask_phrases: [
    { pattern: '(please|you (need|must|should)|owner (must|needs?)|ask (the owner|rowan)).{0,80}(cloudflare|workers).{0,40}(secret|token|api key|credential)', capability: 'github.workflow_ran_ok', subject: 'ultrastable/practical-solutions:deploy-tenant.yml' },
    { pattern: '(please|you (need|must|should)|owner (must|needs?)|ask (the owner|rowan)).{0,80}(install|authori[sz]e|grant|connect).{0,60}(cloudflare workers|workers & pages|workers and pages)', capability: 'github.app_installed', subject: 'ultrastable/cloudflare-workers-and-pages' },
  ],
  lint_paths: ['README.md', 'AGENTS.md', '.github', 'org', 'worker/src', 'tools'], // not ps/: this file holds the phrase patterns themselves,
};
