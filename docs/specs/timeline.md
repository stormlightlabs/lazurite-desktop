# Timeline & Social Features

## Timeline View

Inspired by Aeronaut's timeline continuity — new posts prepend without losing scroll position.

### XRPC Endpoints (via jacquard)

| Action             | Lexicon                                                   |
| ------------------ | --------------------------------------------------------- |
| Following timeline | `app.bsky.feed.getTimeline`                               |
| Custom feed        | `app.bsky.feed.getFeed`                                   |
| Author feed        | `app.bsky.feed.getAuthorFeed`                             |
| Post thread        | `app.bsky.feed.getPostThread`                             |
| Like a post        | `app.bsky.feed.like` (create record)                      |
| Repost             | `app.bsky.feed.repost` (create record)                    |
| Create post        | `com.atproto.repo.createRecord` with `app.bsky.feed.post` |
| Get likes list     | `app.bsky.feed.getActorLikes`                             |
| Get profile        | `app.bsky.actor.getProfile`                               |
| Follow/unfollow    | `app.bsky.graph.follow` (create/delete record)            |
| Mute/block         | `app.bsky.graph.muteActor` / `app.bsky.graph.block`       |

### Feed Preferences

- Toggle reposts, replies, quote-posts per feed (like Aeronaut)
- Store preferences per account in SQLite

## Post Composer

- Rich text via `jacquard::richtext` — auto-detect mentions, links, hashtags
- Image/media upload via `com.atproto.repo.uploadBlob`
- Reply threading with parent/root refs
- Quote post embed

## Notifications

- `app.bsky.notification.listNotifications` — poll or use Jetstream
- Separate tabs: Mentions vs Activity (Aeronaut pattern)
- System notifications via Tauri

## Keyboard Shortcuts

| Key           | Action                   |
| ------------- | ------------------------ |
| `n`           | New post (open composer) |
| `j` / `k`     | Next / previous post     |
| `l`           | Like focused post        |
| `r`           | Reply to focused post    |
| `t`           | Repost focused post      |
| `o` / `Enter` | Open thread              |
| `1`–`9`       | Switch between feeds     |

## UX Polish

- New posts slide in from top via `Motion` with spring easing; scroll position preserved
- Like/repost actions: `Motion` scale pop on the icon (1.0 → 1.3 → 1.0)
- Post card: subtle `Motion` fade-in on viewport enter during infinite scroll
- Composer: `Presence` slide-up animation on open, slide-down on dismiss
- Feed switcher: `Presence` crossfade between feed content on tab change
- Skeleton screens while feeds load; error toast with retry button on network failure
- Feed preferences stored per account in SQLite

## Direct Messages

- `chat.bsky.convo.*` lexicons for DM support
- Deferred to post-MVP unless trivial to add
