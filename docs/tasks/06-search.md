# Task 06: Search & Embeddings

Spec: [search.md](../specs/search.md)

## Tasks

### Backend

#### Network Search

- [x] Create
  - `src-tauri/src/search.rs` for business logic
  - `src-tauri/src/commands/search.rs`
- [x] Implement network search commands (not indexed - direct API calls):
  - `search_posts_network(query, sort?, limit?, cursor?)` → `app.bsky.feed.searchPosts`
  - `search_actors(query, limit?, cursor?)` → `app.bsky.actor.searchActors`
  - `search_starter_packs(query, limit?, cursor?)` → `app.bsky.graph.searchStarterPacks`
  - Note: `searchActorsTypeahead` already exists in auth module
  - Always available - no local setup required

#### Local Data Pipeline (Base)

- [x] Add `sync_state` table to migrations (stores cursor per `(did, source)`)
- [x] Implement `sync_posts(did: String, source: "like"|"bookmark")`:
  - Resume from stored cursor in `sync_state` (never re-fetch full history)
  - Paginate `app.bsky.feed.getActorLikes` (or bookmarks) for the **authenticated user's own** likes/saves
  - Upsert into `posts` table
  - FTS index is maintained automatically via triggers
  - Persist the new cursor back to `sync_state`

#### Embeddings

- [x] Implement `embed_pending_posts()`
  - Query posts without embeddings
  - Batch through `fastembed` TextEmbedding model (`nomic-embed-text-v1.5`)
  - Insert into `posts_vec` via `zerocopy::AsBytes`
- [x] Implement `reindex_embeddings()`:
  - Clear all rows from `posts_vec`
  - Re-embed every post in `posts` table
  - Triggered manually by user (reindex button in UI)
- [x] Implement `set_embeddings_enabled(enabled: bool)`:
  - Persist preference; when disabled, skip model download + embedding on sync
  - Keyword search remains fully functional regardless

#### Search Result Context

- [x] Implement `search_posts(query, mode, limit)`:
  - `keyword`: FTS5 MATCH query (always available)
  - `semantic`: embed query string → vec similarity search (requires embeddings enabled)
  - `hybrid`: run both, merge via reciprocal rank fusion (falls back to keyword-only if embeddings disabled)
- [x] `get_sync_status(did)` → last sync time, post counts, cursor state
- [x] Model management: download `nomic-embed-text-v1.5` ONNX on first use to `<app_data_dir>/models/` (skipped when embeddings disabled)
- [x] Background sync: trigger after login, then every 15 min

### Frontend

#### Search UI

- [x] search bar (`/` or `CTRL/CMD + F` to focus) with mode selector (network / keyword / semantic / hybrid), `Motion` sliding indicator underline
- [x] search results with staggered `Motion` fade-in, highlighted keyword matches

#### Embeddings

- [ ] embeddings opt-out toggle in settings (disables semantic search, skips model download)
- [ ] model download progress bar (percentage + ETA) on first launch
  - Enabled by default (opt-out)
  - Splash/Preflight route should explain what semantic search provides

#### Sync Indexing

- [ ] sync status indicator with animated progress bar, `Presence` fade-out on complete
- [ ] reindex button: triggers `reindex_embeddings()`, shown in search settings or sync status area
- [ ] empty state illustration when no posts synced yet
- [ ] `Tab` cycles search mode (network → keyword → semantic → hybrid), `Escape` clears
