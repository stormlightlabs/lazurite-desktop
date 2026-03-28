# Task 06: Search & Embeddings

Spec: [search.md](../specs/search.md)

## Steps

- [ ] Create `src-tauri/src/search.rs`
- [ ] Implement `sync_posts(did: String, source: "like"|"bookmark")`:
  - Paginate `app.bsky.feed.getActorLikes` (or bookmarks)
  - Upsert into `posts` table
  - Insert text into `posts_fts`
  - Track sync cursor in `sync_state` table
- [ ] Implement `embed_pending_posts()`:
  - Query posts without embeddings
  - Batch through `fastembed` TextEmbedding model (`nomic-embed-text-v1.5`)
  - Insert into `posts_vec` via `zerocopy::AsBytes`
- [ ] Implement `search_posts(query, mode, limit)`:
  - `keyword`: FTS5 MATCH query
  - `semantic`: embed query string → vec similarity search
  - `hybrid`: run both, merge via reciprocal rank fusion
- [ ] `get_sync_status(did)` → last sync time, post counts
- [ ] Model management: download `nomic-embed-text-v1.5` ONNX on first use to `app_data_dir/models/`
- [ ] Background sync: trigger after login, then every 15 min
- [ ] **Frontend**: search bar (`/` to focus) with mode selector, `Motion` sliding indicator underline
- [ ] **Frontend**: search results with staggered `Motion` fade-in, highlighted keyword matches
- [ ] **Frontend**: sync status indicator with animated progress bar, `Presence` fade-out on complete
- [ ] **Frontend**: model download progress bar (percentage + ETA) on first launch
- [ ] **Frontend**: empty state illustration when no posts synced yet
- [ ] **Frontend**: `Tab` cycles search mode, `Escape` clears
