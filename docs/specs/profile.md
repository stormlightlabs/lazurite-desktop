# Profile Screens

## Profile View

The profile view is the primary way to inspect any user on the network. It renders a hero section (banner, avatar, identity, stats) followed by tabbed content (posts, replies, media, likes). The hero section uses scroll-driven animation to condense into a compact header as the user scrolls down.

### Profile Data (XRPC via jacquard)

| Action              | Lexicon                              |
| ------------------- | ------------------------------------ |
| Get profile         | `app.bsky.actor.getProfile`          |
| Author feed         | `app.bsky.feed.getAuthorFeed`        |
| Actor likes         | `app.bsky.feed.getActorLikes`        |
| Follow              | `app.bsky.graph.follow` (create)     |
| Unfollow            | `app.bsky.graph.follow` (delete)     |
| Get followers       | `app.bsky.graph.getFollowers`        |
| Get following       | `app.bsky.graph.getFollows`          |

### Hero Section

The hero contains the banner image, avatar, display name, handle, bio, metadata (website, join date, DID), and social stats.

**Scroll-driven condensation:** As the user scrolls, the avatar shrinks and slides right while the display name and handle slide up to sit beside it, forming a compact sticky header. The banner parallax-scrolls behind.

- Avatar starts at 128px, scales down to ~84px (`1 - progress * 0.34`)
- Display name and handle translate upward and leftward to sit beside the shrunk avatar
- The avatar + name + handle group sticks to the top of the scroll container
- Banner offset: `scrollTop * 0.28` (capped at 88px), scale: `1 + scrollTop / 1600` (capped at 1.08)
- All transforms use `translate3d` for GPU-accelerated compositing, `duration-100 ease-out`

### Tabs

Four content tabs below the hero: **Posts**, **Replies**, **Media**, **Likes**.

- Posts: author feed filtered to exclude replies
- Replies: author feed filtered to replies only
- Media: author feed filtered to posts with embeds
- Likes: separate endpoint (`getActorLikes`)
- Sticky tab bar with backdrop blur, sits below the condensed hero on scroll
- Cursor-based pagination with "Load more" button

### Follow / Unfollow Actions

- Follow button on other users' profiles (not on self)
- Visual state: "Follow" (outline) / "Following" (filled) / "Unfollow" (on hover of Following)
- Creates/deletes `app.bsky.graph.follow` record
- Optimistic UI update with rollback on error

### Following & Follower Lists

- Accessible from the follower/following stat counts on the profile hero
- Paginated list using `app.bsky.graph.getFollowers` / `app.bsky.graph.getFollows`
- Each entry is a compact actor card (avatar, name, handle, bio preview, follow button)
- `Presence` slide-up overlay or route-based panel

### DMs

- DM button on other users' profiles
- Opens `chat.bsky.convo.*` conversation view
- **Deferred** to post-MVP unless trivial alongside feed DMs

### Profile Edit Screen

- Accessible only on self-profile
- Controls for: display name, bio/description, avatar, banner, website, pronouns
- Uses `com.atproto.repo.putRecord` on `app.bsky.actor.profile`
- Image upload via `com.atproto.repo.uploadBlob`
- Confirmation before discarding unsaved changes

## Keyboard Shortcuts

| Key       | Action                   |
| --------- | ------------------------ |
| `Escape`  | Close overlay / go back  |
| `1`–`4`   | Switch profile tabs      |

## UX Polish

- Avatar + name condensation: smooth scroll-driven transform (not IntersectionObserver snap)
- Banner parallax: subtle depth via `translate3d` + `scale`
- Tab switch: `Presence` crossfade between feed content
- Skeleton screens for profile hero and feed content during load
- Error state with retry button for network failures
- Badge row for relationship indicators (Following, Follows you, Muted, etc.)

## Responsive Behavior

- On narrow widths (< 520px), reduce horizontal padding, compress hero spacing
- On medium widths (< 760px), reduce banner height from 256px to 224px

## Parking Lot

- Profile edit screen (full settings exposure)
- DM conversation view
