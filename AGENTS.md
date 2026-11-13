# Practical Solutions: rules for any agent working here

Only running code counts. If it does not run, it fails. If it is not code, it fails.

1. Every change is code with a test that runs in `npm test`. A document is allowed only when code reads it (`org/problems.json`, SQL, workflow files).
2. `vendor/ultrastable` is a pinned, unmodified copy of `ultrastable/workers`. Fix defects upstream and re-vendor; never edit it here. Defects found here are filed as `UPSTREAM-*` items in `ps/seed.js`; `UPSTREAM-1` is open.
3. The reviewer of a result is never its author (`ps/verify.js` and the `reviewer_ne_author` check in `ps/steps.js`).
4. No secret value is ever read into source, config, logs or the database: bindings are named, values come from the platform. `test/birth.test.js` scans for them.
5. This instance never touches the Ultrastable Cloudflare account. It deploys with its own scoped token under the `ps-` prefix.
6. Criticality is measured by `ps/criticality.js`. A test that cannot be measured is `unmeasured`, which is not a pass. Do not weaken a test to make the report pass.
7. Run `npm test`, `npm run test:vendor`, `node tools/build_migrations.mjs --check` before pushing.
