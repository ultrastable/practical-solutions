# Practical Solutions

Practical solutions to pressing problems: things someone can actually implement.

The unit of output is a **solution**: an intervention, practice, policy, mechanism or design that a government, foundation, company or community could adopt. Each published brief states the problem, the candidate solution, the evidence for it, who could implement it and what that takes, the cheapest first test, and what the data cannot show. The charter is code (`ps/charter.js`) and every brief and model prompt reads it.

Places, programs and organizations are the **evidence**, never the subject. One method inside the system, positive deviance, looks for cases that do much better than their setting predicts and asks what differs about them; what differs points to a candidate solution. A country or clinic appearing in a brief is a data point supporting a solution, not a ranking and not the message. The first problem (keeping young children alive) is a seed, not the scope: `org/problems.json` is where new problems and their candidate solutions are added, in any domain.

The loop runs on [Ultrastable](vendor/ultrastable): find evidence cases, verify each with an independent method (a reviewer that is never the author), publish a solution brief, register a dated prediction, score itself on the next data refresh, repeat, with no person in the loop. Criticality is measured by `ps/criticality.js` and reported honestly (a test that cannot be measured is `unmeasured`).

    npm test                 # detector, reviewer, sources, briefs, the whole loop, the Worker, deploy plan
    npm run test:vendor      # the upstream Ultrastable tests this builds on
    npm run simulate         # the loop from birth on a fake clock; prints the criticality report
    node bin/ps.mjs init --db ps.sqlite && node bin/ps.mjs tick --db ps.sqlite   # live: real data, real clock
    node tools/deploy.mjs    # needs CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID (a scoped token for this instance only)

Layout: `ps/` the code, `vendor/ultrastable/` the pinned Ultrastable core, `worker/` the Cloudflare Worker, `org/problems.json` the problems and their candidate solutions, `test/` the tests. Rules for agents: `AGENTS.md`. License: `LICENSE`.

## Why this repository is private

It vendors the Ultrastable core, which is unreleased and under a non-commercial license (`LICENSE`, `COMMERCIAL-TERMS.md`). Publishing this repository would republish that core. It can be made public once Ultrastable is released or the vendored copy is replaced by a published dependency.
