# Milestone 09: Profile

Spec: [profile.md](../specs/profile.md)

Depends on: Milestone 03 (Feeds - post card, feed loading), Milestone 02 (Auth - session, account context)

## Steps

### Backend - `src-tauri/src/commands/profile.rs`

- [x] `get_profile(actor: String)` - `app.bsky.actor.getProfile`
- [x] `get_author_feed(actor: String, cursor: Option<String>, limit: Option<u32>)` - `app.bsky.feed.getAuthorFeed`
- [x] `get_actor_likes(actor: String, cursor: Option<String>, limit: Option<u32>)` - `app.bsky.feed.getActorLikes`
- [ ] `follow_actor(did: String)` - create `app.bsky.graph.follow` record, return record URI
- [ ] `unfollow_actor(uri: String)` - delete follow record via `com.atproto.repo.deleteRecord`
- [ ] `get_followers(actor: String, cursor: Option<String>, limit: Option<u32>)` - `app.bsky.graph.getFollowers`
- [ ] `get_follows(actor: String, cursor: Option<String>, limit: Option<u32>)` - `app.bsky.graph.getFollows`

### Frontend - Profile Hero & Scroll Behavior

- [x] Profile hero section: banner image with parallax, avatar, display name, handle, bio, metadata row, stat counters
- [x] Scroll-driven avatar condensation: avatar shrinks from 128px and shifts right as user scrolls
- [ ] **Fix**: Avatar, display name, and handle must move together as a joined group on scroll — as the avatar shrinks, the name and handle slide up beside it to form a compact sticky header
- [x] Badge row for relationship indicators (Following, Follows you, Muted, etc.)
- [x] Responsive: reduced padding on narrow widths, shorter banner on medium widths

### Frontend - Profile Tabs & Feed

- [x] Four-tab layout: Posts, Replies, Media, Likes
- [x] Sticky tab bar with backdrop blur below the condensed hero
- [x] Per-tab feed filtering (posts excludes replies, replies only, media only)
- [x] Likes tab uses separate `getActorLikes` endpoint
- [x] Cursor-based pagination with "Load more" button
- [x] Skeleton loading states for both hero and feed content
- [x] Error state with message for profile load failures

### Frontend - Follow / Unfollow

- [ ] Follow/unfollow button on non-self profiles
- [ ] Visual states: "Follow" (outline), "Following" (filled), "Unfollow" (hover state)
- [ ] Optimistic UI update with rollback on error
- [ ] Badge row updates immediately on follow/unfollow

### Frontend - Following & Follower Lists

- [ ] Tappable follower/following stat counts open list overlay
- [ ] Paginated actor list with compact cards (avatar, name, handle, bio snippet, follow button)
- [ ] `Presence` slide-up overlay with backdrop blur
- [ ] Cursor-based pagination with infinite scroll or "Load more"

### Parking Lot

- [ ] DM button (requires `chat.bsky.convo.*` implementation)
- [ ] Profile edit screen (display name, bio, avatar, banner, website, pronouns)
- [ ] Mute / block actions from profile view
