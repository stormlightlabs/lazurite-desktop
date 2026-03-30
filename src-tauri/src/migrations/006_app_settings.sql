CREATE TABLE IF NOT EXISTS app_settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Embeddings are enabled by default (opt-out).
INSERT OR IGNORE INTO app_settings(key, value) VALUES ('embeddings_enabled', '1');
