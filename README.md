> **License: free for non-commercial use; commercial use requires a license and shares revenue with the Licensor.** See [LICENSE](LICENSE) (Ultrastable License v1.0, USL-1.0, source-available, not open source) and [COMMERCIAL-TERMS.md](COMMERCIAL-TERMS.md).

# Practical Solutions

An autonomous bright-spot finder that runs on Ultrastable. It finds units (countries, regions, clinics) doing far better than their context predicts, checks each one with an independent method, publishes a brief, registers a dated prediction, scores itself, and repeats, with no person in the loop.

    npm test                 # 15 tests: detector, reviewer, sources, the whole loop, the Worker, deploy plan
    npm run test:vendor      # the 462 upstream Ultrastable tests this builds on
    npm run simulate         # the loop from birth on a fake clock; prints the criticality report
    node bin/ps.mjs init --db ps.sqlite && node bin/ps.mjs tick --db ps.sqlite   # live: real data, real clock
    node tools/deploy.mjs    # needs CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID (a scoped token for this instance only)

Layout: `ps/` the code, `vendor/ultrastable/` the pinned Ultrastable core, `worker/` the Cloudflare Worker, `org/problems.json` the problems it works on, `test/` the tests. Rules for agents: `AGENTS.md`. License: `LICENSE`.
