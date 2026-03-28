CREATE TABLE IF NOT EXISTS accounts (
  did TEXT PRIMARY KEY,
  handle TEXT,
  pds_url TEXT,
  active INTEGER NOT NULL DEFAULT 0 CHECK(active IN (0, 1))
);

CREATE TABLE IF NOT EXISTS posts (
  uri TEXT PRIMARY KEY,
  cid TEXT NOT NULL,
  author_did TEXT NOT NULL,
  author_handle TEXT,
  text TEXT,
  created_at TEXT,
  indexed_at TEXT DEFAULT CURRENT_TIMESTAMP,
  json_record TEXT,
  source TEXT NOT NULL
);

CREATE VIRTUAL TABLE IF NOT EXISTS posts_fts USING fts5(
  text,
  uri UNINDEXED,
  content=posts,
  content_rowid=rowid
);

CREATE VIRTUAL TABLE IF NOT EXISTS posts_vec USING vec0(
  uri TEXT PRIMARY KEY,
  embedding float[768]
);

CREATE TRIGGER IF NOT EXISTS posts_ai AFTER INSERT ON posts BEGIN
  INSERT INTO posts_fts(rowid, text, uri) VALUES (new.rowid, new.text, new.uri);
END;

CREATE TRIGGER IF NOT EXISTS posts_ad AFTER DELETE ON posts BEGIN
  INSERT INTO posts_fts(posts_fts, rowid, text, uri)
  VALUES('delete', old.rowid, old.text, old.uri);
END;

CREATE TRIGGER IF NOT EXISTS posts_au AFTER UPDATE ON posts BEGIN
  INSERT INTO posts_fts(posts_fts, rowid, text, uri)
  VALUES('delete', old.rowid, old.text, old.uri);
  INSERT INTO posts_fts(rowid, text, uri) VALUES (new.rowid, new.text, new.uri);
END;
