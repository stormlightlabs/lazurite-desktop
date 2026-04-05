UPDATE app_settings
SET value = '0'
WHERE key = 'embeddings_enabled';

INSERT OR IGNORE INTO app_settings(key, value) VALUES ('embeddings_enabled', '0');
INSERT OR IGNORE INTO app_settings(key, value) VALUES ('embeddings_preflight_seen', '0');
