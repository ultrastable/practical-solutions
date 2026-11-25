#!/usr/bin/env node
// SPDX-License-Identifier: LicenseRef-Ultrastable-USL-1.0
// Copyright (c) Ultrastable
// TENANT-SYNC-1 for Practical Solutions: core files that live outside the workers tree (the KGRAPH-1 engine, seed/worker/src/knowledge.js)
// are vendored under vendor/seed/ and must not drift from core. vendor/ultrastable/ stays the workers tree pinned by tenant_sync. The vendor map
// is read from the core's own registry (doctrine/tenant-repos.json `tenants.practical-solutions.vendor`), so a file added there is picked up
// with no change here; each file is fetched from the public core repository's main and vendor/seed/VENDORED_FROM records the commit.
// No credential: the core repository is public. Run by .github/workflows/vendor-seed.yml, which tests before it commits.
//   node scripts/vendor_seed.mjs            write the files; prints "changed" or "unchanged"
//   node scripts/vendor_seed.mjs --check    exit 1 when any vendored file differs from core main (the probe)
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CORE = process.env.CORE_REPO || "ultrastable/ultrastable", SLUG = process.env.TENANT_SLUG || "practical-solutions";
const RAW = (sha, path) => `https://raw.githubusercontent.com/${CORE}/${sha}/${path}`;
const UA = { "user-agent": "ultrastable-vendor-sync" };
// the token only raises the API rate limit; it is sent to api.github.com and never to the raw file host
const API = { ...UA, accept: "application/vnd.github+json", ...(process.env.GITHUB_TOKEN ? { authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}) };

async function get(url, as = "text") {
  const r = await fetch(url, { headers: url.startsWith("https://api.github.com/") ? API : UA });
  if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
  return as === "json" ? r.json() : r.text();
}
async function local(path) { try { return await readFile(join(ROOT, path), "utf8"); } catch (e) { if (e.code === "ENOENT") return null; throw e; } }

export async function plan() {
  // pin every file to one core commit; when the API cannot be read the branch name is used, and the record says so
  let sha = "main";
  try { sha = (await get(`https://api.github.com/repos/${CORE}/commits/main`, "json")).sha; } catch (e) { console.warn(`vendor_sync: core head unreadable (${e.message}); reading main by name`); }
  const reg = await get(RAW(sha, "doctrine/tenant-repos.json"), "json");
  const map = reg.tenants?.[SLUG]?.vendor;
  if (!map || !Object.keys(map).length) throw new Error(`no vendor map for ${SLUG} in ${CORE} doctrine/tenant-repos.json`);
  const files = [];
  for (const [src, dst] of Object.entries(map)) files.push({ src, dst, body: await get(RAW(sha, src)), have: await local(dst) });
  return { sha, files };
}

async function main() {
  const check = process.argv.includes("--check");
  const { sha, files } = await plan();
  const drift = files.filter(f => f.body !== f.have);
  for (const f of drift) console.log(`${check ? "drift" : "update"}: ${f.dst} <- ${CORE}@${sha.slice(0, 12)}:${f.src}`);
  if (check) { console.log(drift.length ? `${drift.length} vendored file(s) behind core` : "vendored files match core main"); process.exit(drift.length ? 1 : 0); }
  for (const f of drift) { await mkdir(dirname(join(ROOT, f.dst)), { recursive: true }); await writeFile(join(ROOT, f.dst), f.body); }
  if (drift.length) await writeFile(join(ROOT, process.env.VENDOR_RECORD || "vendor/seed/VENDORED_FROM"), `${CORE}@${sha}\n${files.map(f => `${f.src} -> ${f.dst}`).join("\n")}\n`);
  console.log(drift.length ? "changed" : "unchanged");
}
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main().catch(e => { console.error("vendor_sync:", e.message); process.exit(2); });
