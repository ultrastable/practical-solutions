# Practical Solutions: rules for any agent working here

Only running code counts. If it does not run, it fails. If it is not code, it fails.

1. Every change is code with a test that runs in `npm test`. A document is allowed only when code reads it (`org/problems.json`, SQL, workflow files).
2. `vendor/ultrastable` is a pinned, unmodified copy of `ultrastable/workers`. Fix defects upstream and re-vendor; never edit it here. Defects found here are filed as `UPSTREAM-*` items in `ps/seed.js`; `UPSTREAM-1` is open.
3. The reviewer of a result is never its author (`ps/verify.js` and the `reviewer_ne_author` check in `ps/steps.js`).
4. No secret value is ever read into source, config, logs or the database: bindings are named, values come from the platform. `test/birth.test.js` scans for them.
5. The tenant front-end deploys to the host account in `tenancy.json` (the Ultrastable account, Rowan's decision of 2026-11-16) under the `tenant-ps-` prefix, guarded by an account allow-list (`tools/deploy_tenant.mjs`); it never shares a binding, secret or resource with an `ultrastable-*` core resource. The backend keeps its own scoped token and allow-list (`tools/bootstrap.mjs`) until it migrates.
6. Criticality is measured by `ps/criticality.js`. A test that cannot be measured is `unmeasured`, which is not a pass. Do not weaken a test to make the report pass.
7. UI: pages are built only from `worker/src/kit/` (core/ui, tenant-agnostic; a test forbids it naming this product) and `worker/src/pages.js`. A user-facing change needs a story in `ux/stories.js`; `test/ux.test.js` runs every story, crawls every link, audits every page and checks colour contrast, and the deploy re-runs them against the live site. Pages stay script-free.
8. Run `npm test`, `npm run test:vendor`, `node tools/build_migrations.mjs --check` before pushing.
