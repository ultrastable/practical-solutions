-- Every contact-discovery attempt per target, so a page that yields nothing is retried later and never starves the targets behind it.
-- Migrations re-run on every open, so only IF NOT EXISTS forms.
CREATE TABLE IF NOT EXISTS ps_target_attempts (id INTEGER PRIMARY KEY AUTOINCREMENT, target_id TEXT NOT NULL, at TEXT NOT NULL, ok INTEGER NOT NULL, found INTEGER NOT NULL, detail TEXT);
CREATE INDEX IF NOT EXISTS ps_target_attempts_t ON ps_target_attempts (target_id, at);
