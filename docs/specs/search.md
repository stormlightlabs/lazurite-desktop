# Search

Search has two scopes:

1. **Network search**: server-side search via Bluesky APIs - no local indexing. Always available.
2. **Local search**: full-text + semantic search over the **authenticated user's own** liked and bookmarked/saved posts, stored locally in SQLite.

Local semantic search (embeddings) is **opt-in** and **off by default**. Keyword search remains available without setup. When embeddings are enabled, Lazurite downloads the model locally and unlocks semantic and hybrid search for synced posts.

## Network Search (not indexed)

Server-side Bluesky search APIs. These are thin wrappers - no local storage or indexing.

### `app.bsky.feed.searchPosts`

Search all public posts.

| Parameter | Type     | Required | Notes                                        |
| --------- | -------- | -------- | -------------------------------------------- |
| `q`       | string   | yes      | Query string. Supports `from:handle` syntax. |
| `sort`    | string   | no       | `top` (default) or `latest`                  |
| `since`   | string   | no       | ISO 8601 datetime, inclusive                 |
| `until`   | string   | no       | ISO 8601 datetime, exclusive                 |
| `mentions`| string   | no       | Filter to posts mentioning this DID/handle   |
| `author`  | string   | no       | Filter by DID or handle                      |
| `lang`    | string   | no       | Language code (e.g., `en`)                   |
| `tag`     | string[] | no       | Hashtag filter (without `#`), repeatable     |
| `limit`   | integer  | no       | 1–100, default 25                            |
| `cursor`  | string   | no       | Pagination cursor from previous response     |

Returns `{ cursor?, hitsTotal?, posts: PostView[] }`. With auth the response includes `viewer` state and full post facets.

### Search Route Contract

- `/search` owns `q`, `tab`, `mode`, `sort`, `since`, `until`, `mentions`, `author`, and repeatable `tags`
- `/hashtag/:hashtag` uses the path segment as the primary hashtag query and reuses `sort`, `since`, `until`, `mentions`, `author`, and repeatable `tags`
- `since` and `until` are URL-facing `YYYY-MM-DD` values in the frontend, converted to ISO datetimes before calling Tauri
- `tags` are URL-facing repeatable params and are normalized to bare tag strings before `searchPosts`

### `app.bsky.actor.searchActors`

Search user profiles.

| Parameter | Type    | Required | Notes             |
| --------- | ------- | -------- | ----------------- |
| `q`       | string  | yes      | Query string      |
| `limit`   | integer | no       | 1–100, default 25 |
| `cursor`  | string  | no       | Pagination cursor |

Returns `{ cursor?, actors: ProfileView[] }`.

### `app.bsky.actor.searchActorsTypeahead`

Lightweight actor search for autocomplete (already used in login flow).

| Parameter | Type    | Required | Notes             |
| --------- | ------- | -------- | ----------------- |
| `q`       | string  | yes      | Query string      |
| `limit`   | integer | no       | 1–100, default 10 |

Returns `{ actors: ProfileViewBasic[] }`. No pagination.

### `app.bsky.graph.searchStarterPacks`

Search starter packs.

| Parameter | Type    | Required | Notes             |
| --------- | ------- | -------- | ----------------- |
| `q`       | string  | yes      | Query string      |
| `limit`   | integer | no       | 1–100, default 25 |
| `cursor`  | string  | no       | Pagination cursor |

Returns `{ cursor?, starterPacks: StarterPackViewBasic[] }`.

## Local Data Pipeline

1. **Sync**: on login and periodically, fetch the authenticated user's own likes (`app.bsky.feed.getActorLikes`) and bookmarks. Paginate using the API cursor, store posts in SQLite.
2. **Cursor persistence**: store the last-seen API cursor per `(did, source)` in the `sync_state` table. On subsequent syncs, resume from the stored cursor so we only fetch new posts - never re-fetch the full history.
3. **Index FTS**: insert post text into SQLite FTS5 virtual table for keyword search (always active).
4. **Embed** _(optional)_: run post text through `fastembed` with `nomic-embed-text-v1.5` (768-dim). Store vectors in `sqlite-vec` virtual table. Skipped unless the user opts in.
5. **Reindex**: a manual "Reindex" action clears all embeddings from `posts_vec` and re-embeds every post. Useful after model updates or if the index becomes corrupted.

## SQLite Schema

```sql
-- Post storage (authenticated user's liked/bookmarked posts)
CREATE TABLE posts (
  uri TEXT PRIMARY KEY,
  cid TEXT NOT NULL,
  author_did TEXT NOT NULL,
  author_handle TEXT,
  text TEXT,
  created_at TEXT,
  indexed_at TEXT DEFAULT CURRENT_TIMESTAMP,
  json_record TEXT,         -- full record JSON
  source TEXT NOT NULL       -- 'like', 'bookmark'
);

-- Sync cursor tracking (avoids re-fetching on every sync)
CREATE TABLE sync_state (
  did TEXT NOT NULL,
  source TEXT NOT NULL,       -- 'like', 'bookmark'
  cursor TEXT,                -- last API cursor returned
  last_synced_at TEXT,
  PRIMARY KEY (did, source)
);

-- Full-text search (always active)
CREATE VIRTUAL TABLE posts_fts USING fts5(text, uri UNINDEXED, content=posts, content_rowid=rowid);

-- Vector embeddings (optional - only populated when embeddings enabled)
CREATE VIRTUAL TABLE posts_vec USING vec0(
  uri TEXT PRIMARY KEY,
  embedding float[768]
);
```

## Search Modes

| Mode     | Scope  | How                                                                                       |
| -------- | ------ | ----------------------------------------------------------------------------------------- |
| Network  | Remote | Server-side via Bluesky APIs (posts, actors, starter packs) - not indexed locally         |
| Keyword  | Local  | `SELECT * FROM posts_fts WHERE posts_fts MATCH ?`                                         |
| Semantic | Local  | Embed query → `SELECT * FROM posts_vec WHERE embedding MATCH ? ORDER BY distance LIMIT k` |
| Hybrid   | Local  | Run keyword + semantic, merge results by reciprocal rank fusion                           |

## Embedding Details

- Model: `nomic-embed-text-v1.5` via `fastembed` (ONNX runtime, no GPU required)
- Dimensions: 768 (or 256 with Matryoshka truncation for speed)
- Batch embedding on sync; single embedding on search query
- Model downloaded after the user explicitly enables semantic search, cached in Tauri app data dir

## Tauri Commands

```rs
// Network search (not indexed - direct API calls)
search_posts_network(
  query: String,
  sort: Option<String>,
  since: Option<String>,
  until: Option<String>,
  mentions: Option<String>,
  author: Option<String>,
  tags: Option<Vec<String>>,
  limit: Option<u32>,
  cursor: Option<String>
) -> NetworkSearchResult
search_actors(query: String, limit: Option<u32>, cursor: Option<String>) -> ActorSearchResult
search_starter_packs(query: String, limit: Option<u32>, cursor: Option<String>) -> StarterPackSearchResult
// Note: searchActorsTypeahead already exists in auth module

// Local search (user's own likes/bookmarks)
search_posts(query: String, mode: "keyword"|"semantic"|"hybrid", limit: u32) -> Vec<PostResult>
sync_posts(did: String, source: "like"|"bookmark") -> SyncStatus   // resumes from stored cursor
get_sync_status(did: String) -> SyncStatus
reindex_embeddings() -> ()                                          // clears & re-embeds all posts
set_embeddings_enabled(enabled: bool) -> ()                         // explicit opt-in toggle
set_embeddings_preflight_seen(seen: bool) -> ()                    // dismiss first-run semantic-search setup
```

## Keyboard Shortcuts

| Key      | Action                                                    |
| -------- | --------------------------------------------------------- |
| `/`      | Focus search bar from anywhere                            |
| `Tab`    | Cycle search mode (network → keyword → semantic → hybrid) |
| `Escape` | Clear search / close results                              |

## UX Polish

- Search results: staggered `Motion` fade-in list animation
- Mode switcher: `Motion` sliding indicator underline between tabs
- Sync status: animated progress bar during sync, `Presence` fade-out when complete
- Highlighted keyword matches in result text
- First Search visit can open a dedicated semantic-search preflight when embeddings are still off
- Preflight explains that keyword/network search already work, embeddings are optional, and enabling downloads the model locally
- Model download: progress bar with percentage + ETA while the local model is being prepared
- Empty state: illustration with prompt when no posts synced yet
