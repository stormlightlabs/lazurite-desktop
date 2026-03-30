CREATE TABLE IF NOT EXISTS sync_state (
  did TEXT NOT NULL,
  source TEXT NOT NULL,
  cursor TEXT,
  last_synced_at TEXT,
  PRIMARY KEY (did, source)
);
