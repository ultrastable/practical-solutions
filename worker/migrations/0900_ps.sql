-- SPDX-License-Identifier: LicenseRef-Ultrastable-USL-1.0
-- Copyright (c) 2026 Rowan Brad Quni-Gudzinas. Non-commercial use free; commercial use requires a license. See LICENSE.
-- Practical Solutions tables. Additive and idempotent; every table is prefixed ps_.
CREATE TABLE IF NOT EXISTS ps_problems (
  id TEXT PRIMARY KEY, title TEXT NOT NULL, config TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS ps_datasets (
  id INTEGER PRIMARY KEY AUTOINCREMENT, problem_id TEXT NOT NULL, epoch INTEGER NOT NULL, hash TEXT NOT NULL,
  fetched_at TEXT NOT NULL, payload TEXT NOT NULL, UNIQUE (problem_id, hash));
CREATE TABLE IF NOT EXISTS ps_briefs (
  id TEXT PRIMARY KEY, problem_id TEXT NOT NULL, dataset_id INTEGER NOT NULL, unit TEXT NOT NULL, z REAL NOT NULL,
  stability REAL NOT NULL, payload TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'draft', -- draft | verified | unit_only | rejected | published
  created_by TEXT NOT NULL, verified_by TEXT, verification TEXT, narrative TEXT,
  created_at TEXT NOT NULL, published_at TEXT);
CREATE TABLE IF NOT EXISTS ps_predictions (
  id TEXT PRIMARY KEY, brief_id TEXT NOT NULL, problem_id TEXT NOT NULL, unit TEXT NOT NULL, klass TEXT NOT NULL,
  metric TEXT NOT NULL, op TEXT NOT NULL, target REAL NOT NULL, probability REAL NOT NULL, due_at TEXT NOT NULL,
  observed REAL, verdict TEXT, scored_at TEXT);
CREATE TABLE IF NOT EXISTS ps_schedule (item_id TEXT PRIMARY KEY, due_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS ps_spawn (child_id TEXT NOT NULL, parent_id TEXT NOT NULL, at TEXT NOT NULL, PRIMARY KEY (child_id));
CREATE TABLE IF NOT EXISTS ps_attempts (item_id TEXT PRIMARY KEY, n INTEGER NOT NULL DEFAULT 0, last_error TEXT);
CREATE TABLE IF NOT EXISTS ps_params (key TEXT PRIMARY KEY, value REAL NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS ps_decisions (
  id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT NOT NULL, param TEXT NOT NULL, from_value REAL, to_value REAL, evidence TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS ps_audits (
  id INTEGER PRIMARY KEY AUTOINCREMENT, problem_id TEXT NOT NULL, at TEXT NOT NULL, jaccard REAL NOT NULL, detail TEXT);
CREATE TABLE IF NOT EXISTS ps_model_calls (
  id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT NOT NULL, role TEXT NOT NULL, model TEXT NOT NULL, ok INTEGER NOT NULL, cost_usd REAL NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS ps_trust_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT NOT NULL, surface TEXT NOT NULL, action_class TEXT NOT NULL, reliability REAL NOT NULL, rung TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS ps_criticality (
  id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT NOT NULL, critical INTEGER NOT NULL, payload TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_ps_pred_due ON ps_predictions(verdict, due_at);
