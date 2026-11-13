// SPDX-License-Identifier: LicenseRef-Ultrastable-USL-1.0
// Copyright (c) 2026 Rowan Brad Quni-Gudzinas. Non-commercial use free; commercial use requires a license. See LICENSE.
// This instance's failure modes, each with its root cause and a read-only detector the kernel runs every tick. A detector returns one
// row with `value`; the mode fires when `fire_when` holds. The closing probe is the same measurement and must read 0 to close.
const C = probe => ({ owner: 'operations', doer: 'ps-operations', closing_probe: probe, pass: '= 0', max_attempts: 3, backoff_h: [1, 6, 24], deadline_h: 72 });
const fm = (id, name, root_cause, sql, severity = 3) => ({ id, name: `${name} (root cause: ${root_cause})`, surface: 'ps_ops', detector_sql: sql, fire_when: 'value > 0', severity, interval_h: 1, contract: C(sql) });

export const FAILURE_MODES = [
  fm('FM-PS-TICK-INCOMPLETE', 'a tick finished with steps undone', 'a step threw (bad data, schema drift, bundle bug), so later steps never ran',
    `SELECT COALESCE((SELECT steps_total - steps_completed FROM tick_runs WHERE finished_at IS NOT NULL ORDER BY id DESC LIMIT 1), 0) AS value`, 4),
  fm('FM-PS-BLOCKED-ITEM', 'an item is blocked after three failed attempts', 'a source or handler keeps failing; the retry item does not clear it',
    `SELECT COUNT(*) AS value FROM items WHERE status = 'blocked' AND id NOT LIKE 'FM-%'`, 3),
  fm('FM-PS-MODEL-FAILING', 'a model call failed in the last day', 'the model binding or key is missing, rate-limited or the model id retired',
    `SELECT COUNT(*) AS value FROM ps_model_calls WHERE ok = 0 AND at > datetime('now', '-1 day')`, 2),
  fm('FM-PS-PREDICTION-OVERDUE', 'a prediction is more than a day past due and unscored', 'the cycle that scores it is not running or its dataset fetch fails',
    `SELECT COUNT(*) AS value FROM ps_predictions WHERE verdict IS NULL AND due_at < datetime('now', '-1 day')`, 3),
  fm('FM-PS-CYCLE-OVERDUE', 'a scheduled cycle is more than a day overdue', 'the tick is not dispatching ready items (claims held, cron stalled, handler missing)',
    `SELECT COUNT(*) AS value FROM ps_schedule s JOIN items i ON i.id = s.item_id WHERE i.status = 'ready' AND s.due_at < datetime('now', '-1 day')`, 4),
];
