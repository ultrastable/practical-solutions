#!/usr/bin/env node
// SPDX-License-Identifier: LicenseRef-Ultrastable-USL-1.0
// Copyright (c) 2026 Rowan Brad Quni-Gudzinas. Non-commercial use free; commercial use requires a license. See LICENSE.
// ps: one CLI over the same code the Worker runs.
//   ps init [--db FILE] [--only id,id]       create the database from migrations and seed the first items
//   ps tick [--db FILE] [--n N]               run N real-time ticks (needs network for live sources)
//   ps simulate [--days D] [--step-hours H]   run the loop on a fake clock against the synthetic world; prints the criticality report
//   ps criticality [--db FILE]                evaluate criticality; exit 0 only when critical
//   ps export [--db FILE] [--out DIR]         write published briefs as files
//   ps selfcheck                               two fresh builds from the idea file must be identical
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { openDb } from '../ps/db.js';
import { createPs } from '../ps/org.js';
import { seedOrg } from '../ps/seed.js';
import { evaluate } from '../ps/criticality.js';
import { renderBrief } from '../ps/brief.js';
import { buildConfig } from '../ps/config.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const args = process.argv.slice(2);
const cmd = args.shift();
const opt = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d; };
const problemsFor = only => JSON.parse(readFileSync(path.join(ROOT, 'org/problems.json'), 'utf8')).filter(p => (only ? only.split(',').includes(p.id) : p.enabled));

export async function birthHash(now) {
  const db = openDb(':memory:');
  await seedOrg(db, { problems: problemsFor(null), now });
  const schema = db.raw.prepare(`SELECT sql FROM sqlite_master WHERE sql IS NOT NULL ORDER BY name`).all().map(r => r.sql).join('\n');
  const rows = db.raw.prepare(`SELECT id, owner_role, status FROM items ORDER BY id`).all();
  return createHash('sha256').update(schema + JSON.stringify(rows)).digest('hex');
}

async function main() {
  if (cmd === 'init') {
    const file = opt('db', 'ps.sqlite');
    const db = openDb(file);
    await seedOrg(db, { problems: problemsFor(opt('only')) });
    console.log(`initialised ${file}`);
  } else if (cmd === 'tick') {
    const db = openDb(opt('db', 'ps.sqlite'));
    const ps = createPs({ db, env: process.env, secrets: process.env });
    for (let i = 0; i < Number(opt('n', 1)); i++) { const r = await ps.tick(); console.log(r.report); }
  } else if (cmd === 'simulate') {
    const T0 = Date.parse('2026-12-01T00:00:00Z');
    const clock = { t: T0 };
    const db = openDb(opt('db', ':memory:'));
    await seedOrg(db, { problems: problemsFor('synthetic-demo,synthetic-b'), now: T0 });
    const cfg = buildConfig({ ps: { max_per_tick: 12, perms: 300, criticality: { window_days: Number(opt('window', opt('days', 120))) } } });
    const ps = createPs({ db, env: {}, config: cfg, now: () => clock.t });
    const days = Number(opt('days', 120)), step = Number(opt('step-hours', 12)) * 3600e3;
    let lastReport = '';
    for (; clock.t < T0 + days * 86400e3; clock.t += step) lastReport = (await ps.tick()).report;
    const birth = (await birthHash(T0)) === (await birthHash(T0));
    const rep = await evaluate(db, { now: clock.t, config: cfg, birth });
    console.log(lastReport);
    console.log(JSON.stringify(rep, null, 2));
    process.exitCode = rep.critical ? 0 : 1;
  } else if (cmd === 'criticality') {
    const db = openDb(opt('db', 'ps.sqlite'));
    const birth = (await birthHash(Date.now())) === (await birthHash(Date.now()));
    const rep = await evaluate(db, { now: Date.now(), config: buildConfig(), birth });
    console.log(JSON.stringify(rep, null, 2));
    process.exitCode = rep.critical ? 0 : 1;
  } else if (cmd === 'export') {
    const db = openDb(opt('db', 'ps.sqlite'));
    const out = opt('out', 'briefs'); mkdirSync(out, { recursive: true });
    const rows = (await db.prepare(`SELECT * FROM ps_briefs WHERE status='published'`).all()).results;
    const index = [];
    for (const r of rows) {
      const b = JSON.parse(r.payload), md = renderBrief(b, JSON.parse(r.verification || 'null'), r.narrative);
      const f = `${b.problem}-${b.unit}.md`; writeFileSync(path.join(out, f), md + '\n');
      index.push({ file: f, id: b.id, z: b.z, sha256: createHash('sha256').update(md).digest('hex') });
    }
    writeFileSync(path.join(out, 'index.json'), JSON.stringify(index, null, 2) + '\n');
    console.log(`exported ${rows.length} brief(s) to ${out}`);
  } else if (cmd === 'selfcheck') {
    const t = Date.parse('2026-12-01T00:00:00Z');
    const a = await birthHash(t), b = await birthHash(t);
    console.log(a === b ? `birth reproducible ${a.slice(0, 12)}` : 'birth differs');
    process.exitCode = a === b ? 0 : 1;
  } else {
    console.error('usage: ps init|tick|simulate|criticality|export|selfcheck'); process.exitCode = 2;
  }
}
main().catch(e => { console.error(e); process.exit(1); });
