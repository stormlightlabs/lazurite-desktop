CREATE TABLE columns_next (
  id TEXT PRIMARY KEY,
  account_did TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('feed', 'explorer', 'diagnostics', 'messages', 'search', 'profile')),
  config TEXT NOT NULL,
  position INTEGER NOT NULL,
  width TEXT NOT NULL DEFAULT 'standard' CHECK(width IN ('narrow', 'standard', 'wide')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO columns_next (id, account_did, kind, config, position, width, created_at)
SELECT id, account_did, kind, config, position, width, created_at
FROM columns;

DROP TABLE columns;

ALTER TABLE columns_next RENAME TO columns;

CREATE INDEX IF NOT EXISTS columns_account_did ON columns(account_did, position);
