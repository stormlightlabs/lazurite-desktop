# Milestone 03: Feeds

Spec: [feeds.md](../specs/feeds.md)

## Steps

### Backend - `src-tauri/src/feed.rs`

- [x] `get_preferences()` - calls `app.bsky.actor.getPreferences`, extracts `savedFeedsPrefV2` items and `feedViewPref` entries
- [x] `get_feed_generators(uris: Vec<String>)` - calls `app.bsky.feed.getFeedGenerators` to hydrate display names/avatars
- [x] `get_timeline(cursor: Option<String>, limit: u32)` - calls `app.bsky.feed.getTimeline`
- [x] `get_feed(uri: String, cursor: Option<String>, limit: u32)` - calls `app.bsky.feed.getFeed` for custom feed generators
- [x] `get_list_feed(uri: String, cursor: Option<String>, limit: u32)` - calls `app.bsky.feed.getListFeed`
- [x] `get_post_thread(uri: String)` - thread view
- [x] `get_author_feed(did: String, cursor: Option<String>)`
- [x] `create_post(text: String, reply_to: Option<ReplyRef>, embed: Option<Embed>)` - with richtext facet detection via `jacquard::richtext`
- [x] `like_post(uri: String, cid: String)` / `unlike_post(uri: String)`
- [x] `repost(uri: String, cid: String)` / `unrepost(uri: String)`

### Frontend - Feed Tabs & Content

- [x] Feed tab bar - pinned feeds as tabs, hydrated with generator display names/avatars; `1`–`9` keyboard shortcuts to switch
- [x] Feed content loader - dispatches to correct endpoint based on feed type (`timeline` / `feed` / `list`)
- [x] Infinite scroll with cursor pagination and scroll-position preservation
- [x] `Presence` crossfade animation on tab switch
- [x] Skeleton screens while feeds load

### Frontend - Post Card & Actions

- [x] Post card component (author, text, embeds, timestamps, action bar) - `Motion` fade-in on viewport enter
- [x] Like/repost icon `Motion` scale pop animation (1.0 -> 1.3 -> 1.0)
- [x] `j/k` keyboard navigation between posts, `l` like, `r` reply, `t` repost, `o` open thread

### Frontend - Thread View

- [x] Thread view with nested replies
- [x] Navigate into thread from post card (`o` / `Enter`) with route-backed thread URLs

### Frontend - Post Composer

- [x] Composer with `Presence` slide-up/down, `n` keyboard shortcut to open
- [x] Mention/hashtag autocomplete
- [x] Reply threading with parent/root refs
- [x] Quote post embed
- [x] Tray button and global keyboard shortcut to open composer from anywhere

### Frontend - Feed Preferences

- [x] Per-feed display toggles (hide reposts/replies/quotes) via `feedViewPref`
- [x] Feeds drawer for accessing saved (unpinned) feeds
- [x] Feed generator management (pin/unpin, reorder) via `savedFeedsPrefV2`
