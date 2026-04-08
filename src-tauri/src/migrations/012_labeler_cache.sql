CREATE TABLE IF NOT EXISTS labeler_cache (
  labeler_did TEXT PRIMARY KEY,
  policies_json TEXT NOT NULL,
  fetched_at INTEGER NOT NULL
);
