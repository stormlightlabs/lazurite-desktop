# Task 03: Timeline & Feeds

Spec: [timeline.md](../specs/timeline.md)

## Steps

- [ ] Create `src-tauri/src/feed.rs` — Tauri commands for feed operations
- [ ] `get_timeline(cursor: Option<String>, limit: u32)` — calls `app.bsky.feed.getTimeline` via jacquard Agent
- [ ] `get_feed(uri: String, cursor: Option<String>)` — custom/list feeds
- [ ] `get_post_thread(uri: String)` — thread view
- [ ] `create_post(text: String, reply_to: Option<ReplyRef>, embed: Option<Embed>)` — with richtext facet detection via `jacquard::richtext`
- [ ] `like_post(uri: String, cid: String)` / `unlike_post(uri: String)`
- [ ] `repost(uri: String, cid: String)` / `unrepost(uri: String)`
- [ ] `get_author_feed(did: String, cursor: Option<String>)`
- [ ] **Frontend**: timeline component with infinite scroll, scroll-position preservation
- [ ] **Frontend**: post card component (text, embeds, actions bar) — `Motion` fade-in on viewport enter
- [ ] **Frontend**: like/repost icon `Motion` scale pop animation (1.0 → 1.3 → 1.0)
- [ ] **Frontend**: post composer with `Presence` slide-up/down, mention/hashtag autocomplete
- [ ] **Frontend**: thread view with nested replies
- [ ] **Frontend**: feed selector (Following, custom feeds, lists) with `Presence` crossfade on switch
- [ ] **Frontend**: feed preferences toggle (hide reposts/replies/quotes), persisted per account
- [ ] **Frontend**: skeleton screens while feeds load
- [ ] **Frontend**: keyboard shortcuts — `n` post, `j/k` navigate, `l` like, `r` reply, `t` repost, `o` open, `1-9` feeds
