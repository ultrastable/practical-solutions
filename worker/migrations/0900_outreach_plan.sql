-- Outreach targeting: contact addresses read from agencies' own public contact pages, and the plan of messages per (solution, agency).
-- Migrations re-run on every open, so only IF NOT EXISTS forms.
CREATE TABLE IF NOT EXISTS ps_agency_contacts (agency_id TEXT NOT NULL, addr TEXT NOT NULL, source_url TEXT NOT NULL, found_at TEXT NOT NULL, PRIMARY KEY (agency_id, addr));
CREATE TABLE IF NOT EXISTS ps_outreach_plan (id TEXT PRIMARY KEY, solution_id TEXT NOT NULL, agency_id TEXT NOT NULL, to_addr TEXT, subject TEXT NOT NULL, body TEXT NOT NULL, evidence_url TEXT NOT NULL, reason TEXT NOT NULL, submitted INTEGER NOT NULL DEFAULT 0, at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS ps_outreach_events (id INTEGER PRIMARY KEY AUTOINCREMENT, intent_id TEXT, agency_id TEXT, kind TEXT NOT NULL, detail TEXT, at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS ps_outreach_inbox (id INTEGER PRIMARY KEY AUTOINCREMENT, from_addr TEXT NOT NULL, subject TEXT, text TEXT, kind TEXT NOT NULL, intent_id TEXT, at TEXT NOT NULL);
