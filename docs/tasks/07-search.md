# Milestone 07: Search & Embeddings

Spec: [search.md](../specs/search.md)

## Tasks

### Backend

#### Network Search

- [x] Create
  - `src-tauri/src/search.rs` for business logic
  - `src-tauri/src/commands/search.rs`
- [x] Implement network search commands (not indexed - direct API calls):
  - `search_posts_network(query, sort?, since?, until?, mentions?, author?, tags?, limit?, cursor?)` → `app.bsky.feed.searchPosts`
  - `search_actors(query, limit?, cursor?)` → `app.bsky.actor.searchActors`
  - `search_starter_packs(query, limit?, cursor?)` → `app.bsky.graph.searchStarterPacks`
  - Note: `searchActorsTypeahead` already exists in auth module
  - Always available - no local setup required

#### Search Routing

- [x] Add URL-synced network post search state on `/search`
  - `q`, `tab`, `mode`, `sort`, `since`, `until`, `mentions`, `author`, repeatable `tags`
- [x] Add dedicated `/hashtag/:hashtag` route backed by `searchPosts` with `q=#tag`
- [x] Render hashtag facets as internal links to the hashtag route

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
- [x] Model management: download `nomic-embed-text-v1.5` ONNX after explicit opt-in to `<app_data_dir>/models/` (skipped when embeddings disabled)
- [x] Background sync: trigger after login, then every 15 min

### Frontend

#### Search UI

- [x] search bar (`/` or `CTRL/CMD + F` to focus) with mode selector (network / keyword / semantic / hybrid), `Motion` sliding indicator underline
- [x] search results with staggered `Motion` fade-in, highlighted keyword matches

#### Embeddings

- [x] embeddings opt-in toggle in settings/search UI (keeps semantic search off by default, skips model download until enabled)
- [x] model download progress bar (percentage + ETA) during first semantic-search setup
  - Semantic search is off by default
  - Dedicated preflight route explains what semantic search provides before download starts

#### Sync Indexing

- [x] sync status indicator with animated progress bar, `Presence` fade-out on complete
- [x] reindex button: triggers `reindex_embeddings()`, shown in search settings or sync status area
- [x] empty state illustration when no posts synced yet
- [x] `Tab` cycles search mode (network → keyword → semantic → hybrid), `Escape` clears
