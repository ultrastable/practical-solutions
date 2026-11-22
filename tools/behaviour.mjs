#!/usr/bin/env node
// SPDX-License-Identifier: LicenseRef-Ultrastable-USL-1.0
// Copyright (c) 2026 Rowan Brad Quni-Gudzinas. Non-commercial use free; commercial use requires a license. See LICENSE.
// BEHAVIOUR-1 audit: every catalogue entry must have a change profile that passes its guard (no overclaim, no pressure wording, every source in the
// library, aim matched to the evidence label), and every entry should carry a belief and barriers written for it. A guard failure exits 1 (the
// workflow files one item for the code agent); an entry still on a generated profile is listed as `missing_bespoke` and files one item too.
//   node tools/behaviour.mjs [--check]
import { buildCatalog } from '../worker/src/catalog.js';
import { SOLUTIONS } from '../worker/src/solutions.js';
import { profileFor, guard, lintLibrary, HINTS } from '../worker/src/behaviour.js';

export function audit(solutions = SOLUTIONS, hints = HINTS) {
  const cat = buildCatalog({ problems: { problems: [] }, solutions });
  const failing = [], missing_bespoke = [];
  for (const s of cat.sols) {
    const bad = guard(profileFor(s), s);
    if (bad.length) failing.push({ id: s.id, problems: bad });
    if (!hints[s.id]) missing_bespoke.push(s.id);
  }
  const library = lintLibrary();
  return { entries: cat.sols.length, failing, missing_bespoke, library, ok: !failing.length && !library.length };
}
if (import.meta.url === `file://${process.argv[1]}`) {
  const r = audit();
  console.log(JSON.stringify(r));
  process.exit(r.ok && !r.missing_bespoke.length ? 0 : 1);
}
