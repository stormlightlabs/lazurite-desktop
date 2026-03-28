# Task 07: Standard.site Integration

Spec: [standard-site.md](../specs/standard-site.md)

## Steps

- [ ] Create `src-tauri/src/publications.rs`
- [ ] `get_publications(did: String)` — list `site.standard.publication` records from repo
- [ ] `get_documents(did: String, cursor: Option<String>)` — list `site.standard.document` records
- [ ] `get_document(did: String, rkey: String)` — fetch single document content
- [ ] `subscribe_publication(did: String, rkey: String)` — create `site.standard.graph.subscription` record
- [ ] `unsubscribe_publication(uri: String)` — delete subscription record
- [ ] `list_subscriptions()` — list user's publication subscriptions
- [ ] **Frontend**: publication card with `Motion` scale-up on hover
- [ ] **Frontend**: document list with staggered `Motion` fade-in
- [ ] **Frontend**: markdown reader view with `Presence` slide-in from right
- [ ] **Frontend**: subscribe/unsubscribe `Motion` pop on icon toggle
- [ ] **Frontend**: "Publications" tab on profile views (when records exist)
- [ ] **Search integration**: index document text in `posts_fts` and `posts_vec`
