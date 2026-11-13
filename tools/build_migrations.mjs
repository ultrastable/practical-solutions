// SPDX-License-Identifier: LicenseRef-Ultrastable-USL-1.0
// Copyright (c) 2026 Rowan Brad Quni-Gudzinas. Non-commercial use free; commercial use requires a license. See LICENSE.
// One ordered migrations directory for D1: the vendored Ultrastable migrations, then this repository's own.
// node tools/build_migrations.mjs [--check]   (--check fails when the committed output is stale)
import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
export const OUT = path.join(ROOT, 'worker/migrations');
export function planMigrations() {
  const out = new Map();
  const vend = path.join(ROOT, 'vendor/ultrastable/adapters/cloudflare/migrations');
  for (const f of readdirSync(vend).filter(n => n.endsWith('.sql')).sort()) out.set(f, readFileSync(path.join(vend, f), 'utf8'));
  const own = path.join(ROOT, 'ps/migrations');
  for (const f of readdirSync(own).filter(n => n.endsWith('.sql')).sort()) out.set(`0900_${f.replace(/^\d+_/, '')}`, readFileSync(path.join(own, f), 'utf8'));
  return out;
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const plan = planMigrations();
  const check = process.argv.includes('--check');
  mkdirSync(OUT, { recursive: true });
  let stale = 0;
  for (const [f, sql] of plan) {
    const p = path.join(OUT, f);
    if (check) { if (!existsSync(p) || readFileSync(p, 'utf8') !== sql) { stale++; console.error('stale: ' + f); } } else writeFileSync(p, sql);
  }
  if (check && stale) process.exit(1);
  console.log(check ? 'migrations up to date' : `wrote ${plan.size} migration(s) to worker/migrations`);
}
