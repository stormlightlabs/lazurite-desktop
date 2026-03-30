DROP TRIGGER IF EXISTS posts_ai;
DROP TRIGGER IF EXISTS posts_ad;
DROP TRIGGER IF EXISTS posts_au;

ALTER TABLE posts RENAME TO posts_legacy;

DROP TABLE IF EXISTS posts_fts;
DROP TABLE IF EXISTS posts_vec;

CREATE TABLE posts (
  storage_key TEXT PRIMARY KEY,
  owner_did TEXT NOT NULL,
  uri TEXT NOT NULL,
  cid TEXT NOT NULL,
  author_did TEXT NOT NULL,
  author_handle TEXT,
  text TEXT,
  created_at TEXT,
  indexed_at TEXT DEFAULT CURRENT_TIMESTAMP,
  json_record TEXT,
  source TEXT NOT NULL,
  UNIQUE(owner_did, source, uri)
);

CREATE VIRTUAL TABLE posts_fts USING fts5(
  text,
  content=posts,
  content_rowid=rowid
);

CREATE VIRTUAL TABLE posts_vec USING vec0(
  storage_key TEXT PRIMARY KEY,
  embedding float[768]
);

CREATE TRIGGER posts_ai AFTER INSERT ON posts BEGIN
  INSERT INTO posts_fts(rowid, text) VALUES (new.rowid, new.text);
END;

CREATE TRIGGER posts_ad AFTER DELETE ON posts BEGIN
  INSERT INTO posts_fts(posts_fts, rowid, text)
  VALUES('delete', old.rowid, old.text);
END;

CREATE TRIGGER posts_au AFTER UPDATE ON posts BEGIN
  INSERT INTO posts_fts(posts_fts, rowid, text)
  VALUES('delete', old.rowid, old.text);
  INSERT INTO posts_fts(rowid, text) VALUES (new.rowid, new.text);
END;

WITH migrated_posts AS (
  SELECT
    CASE
      WHEN (
        SELECT COUNT(DISTINCT ss.did)
        FROM sync_state ss
        WHERE ss.source = legacy.source
      ) = 1 THEN COALESCE((
        SELECT ss.did
        FROM sync_state ss
        WHERE ss.source = legacy.source
        LIMIT 1
      ), '')
      ELSE ''
    END AS owner_did,
    legacy.uri,
    legacy.cid,
    legacy.author_did,
    legacy.author_handle,
    legacy.text,
    legacy.created_at,
    legacy.indexed_at,
    legacy.json_record,
    legacy.source
  FROM posts_legacy legacy
)
INSERT INTO posts(
  storage_key,
  owner_did,
  uri,
  cid,
  author_did,
  author_handle,
  text,
  created_at,
  indexed_at,
  json_record,
  source
)
SELECT
  owner_did || '|' || source || '|' || uri,
  owner_did,
  uri,
  cid,
  author_did,
  author_handle,
  text,
  created_at,
  indexed_at,
  json_record,
  source
FROM migrated_posts;

DROP TABLE posts_legacy;
