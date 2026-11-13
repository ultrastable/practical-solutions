-- Model practice extraction: hypotheses per brief, stored beside (never inside) the statistical record. Migrations re-run on every open, so only IF NOT EXISTS forms.
CREATE TABLE IF NOT EXISTS ps_extractions (brief_id TEXT PRIMARY KEY, payload TEXT NOT NULL, route TEXT, at TEXT NOT NULL);
