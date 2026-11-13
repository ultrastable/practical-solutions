// SPDX-License-Identifier: LicenseRef-Ultrastable-USL-1.0
// Copyright (c) 2026 Rowan Brad Quni-Gudzinas. Non-commercial use free; commercial use requires a license. See LICENSE.
// Birth: the first items an instance needs. Everything after this is spawned by the loop itself.
const iso = ms => new Date(ms).toISOString().replace('T', ' ').slice(0, 19);

export async function seedOrg(db, { problems, now = Date.now(), slug = 'practical-solutions' }) {
  await db.prepare(`INSERT OR REPLACE INTO org (key, value) VALUES ('org_slug', ?)`).bind(slug).run();
  for (const p of problems) {
    await db.prepare(`INSERT OR IGNORE INTO ps_problems (id, title, config) VALUES (?,?,?)`).bind(p.id, p.title, JSON.stringify(p)).run();
    const id = `ps:cycle:${p.id}:0`;
    await db.prepare(`INSERT OR IGNORE INTO items (id, title, kind, owner_role, done_check, closing_probe, priority, status, surface, action_class)
      VALUES (?,?, 'work', 'analyst', ?, ?, 40, 'ready', 'ps_detect', 'detect')`).bind(id, `Cycle 0 for ${p.id}: fetch data, find evidence cases and candidate solutions`, 'dataset stored and detector run', 'ps_datasets row for epoch 0').run();
    await db.prepare(`INSERT OR REPLACE INTO ps_schedule (item_id, due_at) VALUES (?,?)`).bind(id, iso(now)).run();
  }
  await db.prepare(`INSERT OR IGNORE INTO items (id, title, kind, owner_role, done_check, closing_probe, priority, status)
    VALUES ('UPSTREAM-1', 'Core score_predictions marks any metric it does not know as a miss; add a metric registration hook so domain metrics can be scored by core', 'fix', 'operations',
            'PR merged in ultrastable/workers adding metric registration, then this repo drops its own scorer', 'upstream PR merged', 30, 'ready')`).run();
}
