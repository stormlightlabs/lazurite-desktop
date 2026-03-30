CREATE TABLE IF NOT EXISTS columns (
  id TEXT PRIMARY KEY,
  account_did TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('feed', 'explorer', 'diagnostics')),
  config TEXT NOT NULL,
  position INTEGER NOT NULL,
  width TEXT NOT NULL DEFAULT 'standard' CHECK(width IN ('narrow', 'standard', 'wide')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS columns_account_did ON columns(account_did, position);
