CREATE TABLE oauth_sessions_v3 (
  did TEXT NOT NULL,
  session_id TEXT NOT NULL,
  session_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (did, session_id)
);

INSERT INTO oauth_sessions_v3(did, session_id, session_json, created_at, updated_at)
SELECT did, session_id, session_json, created_at, updated_at
FROM oauth_sessions;

DROP TABLE oauth_sessions;

ALTER TABLE oauth_sessions_v3 RENAME TO oauth_sessions;

CREATE INDEX IF NOT EXISTS idx_oauth_sessions_did_updated_at
  ON oauth_sessions(did, updated_at DESC);
