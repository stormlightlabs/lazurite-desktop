ALTER TABLE accounts ADD COLUMN session_id TEXT;

CREATE TABLE IF NOT EXISTS oauth_sessions (
  did TEXT NOT NULL,
  session_id TEXT NOT NULL,
  session_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (did, session_id),
  FOREIGN KEY (did) REFERENCES accounts(did) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS oauth_auth_requests (
  state TEXT PRIMARY KEY,
  auth_request_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_accounts_active_handle
  ON accounts(active DESC, handle COLLATE NOCASE ASC);
