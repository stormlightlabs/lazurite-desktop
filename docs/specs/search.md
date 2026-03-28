# Search & Embeddings

Local full-text + semantic search over the authenticated user's saved and liked posts.

## Data Pipeline

1. **Sync**: on login and periodically, fetch user's likes (`app.bsky.feed.getActorLikes`) and bookmarks. Paginate fully, store in SQLite.
2. **Index FTS**: insert post text into SQLite FTS5 virtual table for keyword search.
3. **Embed**: run post text through `fastembed` with `nomic-embed-text-v1.5` (768-dim). Store vectors in `sqlite-vec` virtual table.
4. **Incremental**: track cursor/last-seen; only process new posts on subsequent syncs.

## SQLite Schema

```sql
-- Post storage
CREATE TABLE posts (
  uri TEXT PRIMARY KEY,
  cid TEXT NOT NULL,
  author_did TEXT NOT NULL,
  author_handle TEXT,
  text TEXT,
  created_at TEXT,
  indexed_at TEXT DEFAULT CURRENT_TIMESTAMP,
  json_record TEXT,         -- full record JSON
  source TEXT NOT NULL       -- 'like', 'bookmark', 'own'
);

-- Full-text search
CREATE VIRTUAL TABLE posts_fts USING fts5(text, uri UNINDEXED, content=posts, content_rowid=rowid);

-- Vector embeddings
CREATE VIRTUAL TABLE posts_vec USING vec0(
  uri TEXT PRIMARY KEY,
  embedding float[768]
);
```

## Search Modes

| Mode     | How                                                                                       |
| -------- | ----------------------------------------------------------------------------------------- |
| Keyword  | `SELECT * FROM posts_fts WHERE posts_fts MATCH ?`                                         |
| Semantic | Embed query → `SELECT * FROM posts_vec WHERE embedding MATCH ? ORDER BY distance LIMIT k` |
| Hybrid   | Run both, merge results by reciprocal rank fusion                                         |

## Embedding Details

- Model: `nomic-embed-text-v1.5` via `fastembed` (ONNX runtime, no GPU required)
- Dimensions: 768 (or 256 with Matryoshka truncation for speed)
- Batch embedding on sync; single embedding on search query
- Model downloaded on first use, cached in Tauri app data dir

## Tauri Commands

```rs
search_posts(query: String, mode: "keyword"|"semantic"|"hybrid", limit: u32) -> Vec<PostResult>
sync_liked_posts(did: String) -> SyncStatus
get_sync_status(did: String) -> SyncStatus
```

## Keyboard Shortcuts

| Key      | Action                                          |
| -------- | ----------------------------------------------- |
| `/`      | Focus search bar from anywhere                  |
| `Tab`    | Cycle search mode (keyword → semantic → hybrid) |
| `Escape` | Clear search / close results                    |

## UX Polish

- Search results: staggered `Motion` fade-in list animation
- Mode switcher: `Motion` sliding indicator underline between tabs
- Sync status: animated progress bar during sync, `Presence` fade-out when complete
- Highlighted keyword matches in result text
- Model download: progress bar on first launch with percentage + ETA
- Empty state: illustration with prompt when no posts synced yet
