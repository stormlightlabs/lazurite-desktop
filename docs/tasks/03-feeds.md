# Task 03: Feeds

Spec: [feeds.md](../specs/feeds.md)

## Steps

### Backend — `src-tauri/src/feed.rs`

- [ ] `get_preferences()` — calls `app.bsky.actor.getPreferences`, extracts `savedFeedsPrefV2` items and `feedViewPref` entries
- [ ] `get_feed_generators(uris: Vec<String>)` — calls `app.bsky.feed.getFeedGenerators` to hydrate display names/avatars
- [ ] `get_timeline(cursor: Option<String>, limit: u32)` — calls `app.bsky.feed.getTimeline`
- [ ] `get_feed(uri: String, cursor: Option<String>, limit: u32)` — calls `app.bsky.feed.getFeed` for custom feed generators
- [ ] `get_list_feed(uri: String, cursor: Option<String>, limit: u32)` — calls `app.bsky.feed.getListFeed`
- [ ] `get_post_thread(uri: String)` — thread view
- [ ] `get_author_feed(did: String, cursor: Option<String>)`
- [ ] `create_post(text: String, reply_to: Option<ReplyRef>, embed: Option<Embed>)` — with richtext facet detection via `jacquard::richtext`
- [ ] `like_post(uri: String, cid: String)` / `unlike_post(uri: String)`
- [ ] `repost(uri: String, cid: String)` / `unrepost(uri: String)`

### Frontend — Feed Tabs & Content

- [ ] Feed tab bar — pinned feeds as tabs, hydrated with generator display names/avatars; `1`–`9` keyboard shortcuts to switch
- [ ] Feed content loader — dispatches to correct endpoint based on feed type (`timeline` / `feed` / `list`)
- [ ] Infinite scroll with cursor pagination and scroll-position preservation
- [ ] `Presence` crossfade animation on tab switch
- [ ] Skeleton screens while feeds load

### Frontend — Post Card & Actions

- [ ] Post card component (author, text, embeds, timestamps, action bar) — `Motion` fade-in on viewport enter
- [ ] Like/repost icon `Motion` scale pop animation (1.0 -> 1.3 -> 1.0)
- [ ] `j/k` keyboard navigation between posts, `l` like, `r` reply, `t` repost, `o` open thread

### Frontend — Thread View

- [ ] Thread view with nested replies
- [ ] Navigate into thread from post card (`o` / `Enter`)

### Frontend — Post Composer

- [ ] Composer with `Presence` slide-up/down, `n` keyboard shortcut to open
- [ ] Mention/hashtag autocomplete
- [ ] Reply threading with parent/root refs
- [ ] Quote post embed

### Frontend — Feed Preferences

- [ ] Per-feed display toggles (hide reposts/replies/quotes) via `feedViewPref`
- [ ] Feeds drawer for accessing saved (unpinned) feeds
