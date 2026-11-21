> **License: free for non-commercial use; commercial use requires a license and shares revenue with the Licensor.** See [LICENSE](LICENSE) (Ultrastable License v1.0, USL-1.0, source-available, not open source) and [COMMERCIAL-TERMS.md](COMMERCIAL-TERMS.md).

# Practical Solutions

**An autonomous bright-spot finder, and the first system that runs on Ultrastable.**

## What it does
Some countries, regions and clinics do far better than their circumstances predict. Those bright spots hold practical solutions others can copy. Practical Solutions finds them continuously: it reads public data, fits what each unit's context predicts, flags the units that beat it, checks each one with an independent method, publishes a brief, registers a dated prediction, scores itself when the date arrives, and repeats. No person is in the loop.

## Why it exists
It is the proof case for [Ultrastable](https://github.com/ultrastable/ultrastable): a real system with a loop to close, a measure that can be wrong (its own predictions), upkeep that does not run out (new data, new problems) and a running cost. Ultrastable runs on Ultrastable; Practical Solutions is one system it runs.

## How it works
| Stage | Code |
|---|---|
| Problems it works on | [org/problems.json](org/problems.json) |
| Sources, detector and independent reviewer | [ps/](ps/) |
| The loop: tick, briefs, predictions, scoring | [bin/ps.mjs](bin/ps.mjs) |
| Public site and API (catalogue, releases, graph, claims) | [worker/](worker/) |
| Pinned Ultrastable core, never edited here | [vendor/ultrastable/](vendor/ultrastable/), tracked in [upstream.json](upstream.json) |
| Hosting declaration, reconciled against the live host | [hosting.json](hosting.json) |

Every statement the site makes is served with its probe at `/claims.json`, so the words match what the code does.

## Run it
```sh
npm test               # the tenant's tests
npm run test:vendor    # the upstream Ultrastable tests it builds on
npm run simulate       # the loop from birth on a fake clock, with its criticality report
node bin/ps.mjs init --db ps.sqlite && node bin/ps.mjs tick --db ps.sqlite   # real data, real clock
```
Deploys are server-side: merging to `main` runs the deploy workflows named in [hosting.json](hosting.json).

## Layout
`ps/` code · `worker/`, `worker-llm/`, `worker-mail/` Cloudflare Workers · `org/` problems and config · `test/` tests · `tools/` loops and checks · `vendor/ultrastable/` pinned core. Rules for people and agents: [AGENTS.md](AGENTS.md).

## License
Source-available under the Ultrastable License v1.0 ([LICENSE](LICENSE), [COMMERCIAL-TERMS.md](COMMERCIAL-TERMS.md)): free for non-commercial use, commercial use needs a license. Not open source.
