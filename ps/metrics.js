// SPDX-License-Identifier: LicenseRef-Ultrastable-USL-1.0
// Copyright (c) 2026 Rowan Brad Quni-Gudzinas. Non-commercial use free; commercial use requires a license. See LICENSE.
// Domain metrics registered with Ultrastable core (upstream workers#175), so core's own score_predictions grades a bright-spot
// prediction: the unit's residual z in the latest stored dataset of its problem. NaN (no dataset, unit absent) is a miss in core.
import { unitZ } from './detect.js';

export const CORE_PREFIX = 'core:';
export const psMetrics = {
  async ps_residual_z(db, _now, row) {
    const p = await db.prepare(`SELECT problem_id, unit FROM ps_predictions WHERE id=?`).bind(String(row.id).slice(CORE_PREFIX.length)).first();
    if (!p) return NaN;
    const ds = await db.prepare(`SELECT payload FROM ps_datasets WHERE problem_id=? ORDER BY fetched_at DESC, rowid DESC LIMIT 1`).bind(p.problem_id).first();
    if (!ds) return NaN;
    const z = unitZ(JSON.parse(ds.payload), p.unit);
    return z == null ? NaN : z;
  },
};
