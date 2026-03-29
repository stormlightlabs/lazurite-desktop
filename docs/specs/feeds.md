# Feeds & Social Features

## Feed-Centric Architecture

Feeds are the primary view. The "Following" timeline is one feed among many — custom feed generators and lists sit alongside it as equal peers. Pinned feeds render as switchable tabs; saved (unpinned) feeds live in a drawer for quick access.

### User Preferences & Feed Discovery

| Action              | Endpoint                                             |
| ------------------- | ---------------------------------------------------- |
| Get saved/pinned    | `app.bsky.actor.getPreferences` → `savedFeedsPrefV2` |
| Update saved/pinned | `app.bsky.actor.putPreferences`                      |
| Hydrate generators  | `app.bsky.feed.getFeedGenerators` (batch by URI)     |
| Suggested feeds     | `app.bsky.feed.getSuggestedFeeds`                    |
| Actor's feeds       | `app.bsky.feed.getActorFeeds`                        |

#### `savedFeedsPrefV2` Shape

Each saved feed:

```ts
{ id: string, type: "timeline" | "feed" | "list", value: string, pinned: boolean }
```

- `"timeline"` → value `"following"`, loaded via `getTimeline`
- `"feed"` → value is an `at://` URI, loaded via `getFeed`
- `"list"` → value is an `at://` URI, loaded via `app.bsky.feed.getListFeed`

Pinned feeds appear in array order as tabs.

#### Per-Feed Display Preferences (`feedViewPref`)

```ts
{ feed: string, hideReplies?: boolean, hideRepliesByUnfollowed?: boolean,
  hideRepliesByLikeCount?: number, hideReposts?: boolean, hideQuotePosts?: boolean }
```

### Feed Content (XRPC via jacquard)

| Action             | Lexicon                                                   |
| ------------------ | --------------------------------------------------------- |
| Following timeline | `app.bsky.feed.getTimeline`                               |
| Custom feed        | `app.bsky.feed.getFeed`                                   |
| List feed          | `app.bsky.feed.getListFeed`                               |
| Author feed        | `app.bsky.feed.getAuthorFeed`                             |
| Post thread        | `app.bsky.feed.getPostThread`                             |
| Like a post        | `app.bsky.feed.like` (create record)                      |
| Repost             | `app.bsky.feed.repost` (create record)                    |
| Create post        | `com.atproto.repo.createRecord` with `app.bsky.feed.post` |
| Get likes list     | `app.bsky.feed.getActorLikes`                             |
| Get profile        | `app.bsky.actor.getProfile`                               |
| Follow/unfollow    | `app.bsky.graph.follow` (create/delete record)            |
| Mute/block         | `app.bsky.graph.muteActor` / `app.bsky.graph.block`       |

### Client Flow

1. On login / account switch, call `getPreferences` → extract `savedFeedsPrefV2`
2. Filter pinned feeds → render as tabs (ordered by array position)
3. Call `getFeedGenerators` with pinned feed URIs → hydrate display names + avatars for tab labels
4. Active tab loads content: `getTimeline` for timeline type, `getFeed` for feed type, `getListFeed` for list type
5. Saved (unpinned) feeds accessible via feeds drawer

## Post Composer

- Rich text via `jacquard::richtext` — auto-detect mentions, links, hashtags
- Image/media upload via `com.atproto.repo.uploadBlob`
- Reply threading with parent/root refs
- Quote post embed

## Keyboard Shortcuts

| Key           | Action                      |
| ------------- | --------------------------- |
| `n`           | New post (open composer)    |
| `j` / `k`     | Next / previous post        |
| `l`           | Like focused post           |
| `r`           | Reply to focused post       |
| `t`           | Repost focused post         |
| `o` / `Enter` | Open thread                 |
| `1`–`9`       | Switch between pinned feeds |

## UX Polish

- New posts slide in from top via `Motion` with spring easing; scroll position preserved
- Like/repost actions: `Motion` scale pop on the icon (1.0 -> 1.3 -> 1.0)
- Post card: subtle `Motion` fade-in on viewport enter during infinite scroll
- Composer: `Presence` slide-up animation on open, slide-down on dismiss
- Feed tab switch: `Presence` crossfade between feed content
- Skeleton screens while feeds load; error toast with retry button on network failure
- Per-feed display preferences (hide reposts/replies/quotes) stored via `putPreferences`

## System Tray & Global Composer Shortcut

The composer should be accessible from anywhere on the system — even when the app window is hidden or unfocused — via a system tray icon and a global keyboard shortcut.

### System Tray

Uses Tauri's built-in tray support (core feature flag, not a plugin).

**Setup:**
- Enable `tray-icon` feature in `src-tauri/Cargo.toml`: `tauri = { version = "2", features = ["tray-icon"] }`
- Icon: `public/tray-icon.png` (already exists)
- Build tray in `lib.rs` `setup()` via `TrayIconBuilder`

**Tray menu items:**

| Item            | Action                                                  |
| --------------- | ------------------------------------------------------- |
| New Post…       | Show + focus window, emit `"composer:open"` event       |
| Show / Hide     | Toggle main window visibility                           |
| Quit            | `app.exit(0)`                                           |

**Tray icon click (left click):** Toggle window visibility — if visible, hide; if hidden, show + focus.

**Key types:** `TrayIconBuilder`, `TrayIconEvent::Click`, `MouseButton`, `MenuItem::with_id`

**Platform note:** Use `.show_menu_on_left_click(false)` so left click toggles the window. Linux does not support tray mouse events; on Linux the menu is the only interaction.

### Global Keyboard Shortcut

Uses `tauri-plugin-global-shortcut` (separate plugin, registers OS-level hotkeys that work even when the app is unfocused).

**Setup:**
- `cargo add tauri-plugin-global-shortcut` (desktop only via `cfg(any(target_os = "macos", windows, target_os = "linux"))`)
- Register plugin in `lib.rs` builder with a handler
- No capability permissions needed since registration happens in Rust only

**Shortcut:** `Ctrl+Shift+N` (maps to `Modifiers::CONTROL | Modifiers::SHIFT`, `Code::KeyN`)

**Handler flow:**
1. On `ShortcutState::Pressed`, get the main webview window
2. Call `window.unminimize()`, `window.show()`, `window.set_focus()` (all three to cover every hidden state)
3. Emit `"composer:open"` event to the frontend

**Key types:** `Shortcut::new()`, `Modifiers`, `Code`, `ShortcutState`, `GlobalShortcutExt`

### Frontend Integration

Both tray "New Post…" and the global shortcut emit a `"composer:open"` Tauri event. The frontend listens for this event and opens the composer:

```ts
import { listen } from "@tauri-apps/api/event";

listen("composer:open", () => {
  // set composer.open = true in FeedWorkspace state
});
```

This reuses the existing `FeedComposer` component and state — no new UI needed.

### Window Show/Focus Pattern

Reliable cross-platform pattern used in both tray and shortcut handlers:

```rust
if let Some(window) = app.get_webview_window("main") {
    let _ = window.unminimize();
    let _ = window.show();
    let _ = window.set_focus();
}
```

## Direct Messages

- `chat.bsky.convo.*` lexicons for DM support
- Deferred to post-MVP unless trivial to add
